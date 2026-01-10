import { TTSClient, TTSMessageEvent } from './TTSClient';
import { TTSGranularity, TTSVoice, TTSVoicesGroup } from './types';
import { parseSSMLMarks } from '@/utils/ssml';
import { TTSController } from './TTSController';
import { TTSUtils } from './TTSUtils';

// VieNeu-TTS voices from config.yaml
const VIENEU_VOICES = {
  'vi-VN': [
    'Vĩnh (nam miền Nam)',
    'Bình (nam miền Bắc)',
    'Ngọc (nữ miền Bắc)',
    'Dung (nữ miền Nam)',
    'Đoan (nữ miền Nam)',
    'Hương (nữ miền Bắc)',
    'Ly (nữ miền Bắc)',
    'Nguyên (nam miền Nam)',
    'Sơn (nam miền Nam)',
    'Tuyên (nam miền Bắc)',
  ],
};

interface VieNeuTTSConfig {
  serverUrl?: string;
  timeout?: number;
  bookKey?: string;
}

export class VieNeuTTSClient implements TTSClient {
  name = 'vieneu-tts';
  initialized = false;
  controller?: TTSController;

  #voices: TTSVoice[] = [];
  #primaryLang = 'vi';
  #speakingLang = '';
  #currentVoiceId = '';
  #rate = 1.0;
  #pitch = 1.0;
  #serverUrl: string;
  #timeout: number;
  #bookKey: string;

  #audioElement: HTMLAudioElement | null = null;
  #isPlaying = false;
  #pausedAt = 0;
  #startedAt = 0;

  constructor(config?: VieNeuTTSConfig, controller?: TTSController) {
    this.controller = controller;
    this.#serverUrl = config?.serverUrl || '/api/tts/vieneu';
    this.#timeout = config?.timeout || 30000;
    this.#bookKey = config?.bookKey || '_default';
    this.#voices = this.#generateVoiceList();
  }

  #generateVoiceList(): TTSVoice[] {
    return Object.entries(VIENEU_VOICES).flatMap(([lang, voices]) => {
      return voices.map((name) => ({
        id: name,
        name: name,
        lang: lang,
      }));
    });
  }

  async init(): Promise<boolean> {
    try {
      // Check if server is available by making a simple request
      const response = await fetch(this.#serverUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });

      this.initialized = response.ok;
      return this.initialized;
    } catch (error) {
      console.warn('VieNeu-TTS server not available:', error);
      this.initialized = false;
      return false;
    }
  }

  async *speak(ssml: string, signal: AbortSignal, preload = false): AsyncIterable<TTSMessageEvent> {
    if (preload) {
      yield { code: 'end', message: 'Preload not supported' } as TTSMessageEvent;
      return;
    }

    const { marks } = parseSSMLMarks(ssml, this.#primaryLang);

    await this.stopInternal();

    if (!this.#audioElement) {
      this.#audioElement = new Audio();
    }
    const audio = this.#audioElement;
    audio.setAttribute('x-webkit-airplay', 'deny');
    audio.preload = 'auto';

    for (const mark of marks) {
      this.controller?.dispatchSpeakMark(mark);
      let abortHandler: null | (() => void) = null;

      try {
        const { language: voiceLang } = mark;
        const voiceId = await this.getVoiceIdFromLang(voiceLang);
        this.#speakingLang = voiceLang;
        this.#currentVoiceId = voiceId;

        // Call our API endpoint (which handles caching)
        const audioBlob = await this.#synthesize(mark.text, voiceId);

        if (signal.aborted) {
          yield { code: 'error', message: 'Aborted' } as TTSMessageEvent;
          break;
        }

        const audioUrl = URL.createObjectURL(audioBlob);

        yield {
          code: 'boundary',
          message: `Start chunk: ${mark.name}`,
          mark: mark.name,
        } as TTSMessageEvent;

        const result = await new Promise<TTSMessageEvent>((resolve) => {
          const cleanUp = () => {
            audio.onended = null;
            audio.onerror = null;
            URL.revokeObjectURL(audioUrl);
            audio.src = '';
          };

          abortHandler = () => {
            cleanUp();
            resolve({ code: 'error', message: 'Aborted' });
          };

          if (signal.aborted) {
            abortHandler();
            return;
          } else {
            signal.addEventListener('abort', abortHandler);
          }

          audio.onended = () => {
            cleanUp();
            resolve({ code: 'end', message: `Chunk finished: ${mark.name}` });
          };

          audio.onerror = (e) => {
            cleanUp();
            console.warn('Audio playback error:', e);
            resolve({ code: 'error', message: 'Audio playback error' });
          };

          this.#isPlaying = true;
          audio.src = audioUrl;
          audio.playbackRate = this.#rate;
          audio.play().catch((err) => {
            cleanUp();
            console.error('Failed to play audio:', err);
            resolve({ code: 'error', message: 'Playback failed: ' + err.message });
          });
        });

        yield result;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn('VieNeu-TTS error:', message);
        yield { code: 'error', message } as TTSMessageEvent;
        break;
      } finally {
        if (abortHandler) {
          signal.removeEventListener('abort', abortHandler);
        }
      }
    }

    await this.stopInternal();
  }

  async #synthesize(text: string, voiceId: string): Promise<Blob> {
    const response = await fetch(this.#serverUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: text,
        voice: voiceId,
        bookKey: this.#bookKey,
      }),
      signal: AbortSignal.timeout(this.#timeout),
    });

    if (!response.ok) {
      throw new Error(`VieNeu-TTS synthesis failed: ${response.status} ${response.statusText}`);
    }

    // Check cache status from header
    const cacheStatus = response.headers.get('X-Cache-Status');
    if (cacheStatus) {
      console.log(`VieNeu-TTS: ${cacheStatus === 'HIT' ? '✓ Cache hit' : '✗ Cache miss - synthesized'} [${this.#bookKey}]`);
    }

    return await response.blob();
  }

  getVoiceIdFromLang = async (lang: string) => {
    const preferredVoiceId = TTSUtils.getPreferredVoice(this.name, lang);
    const preferredVoice = this.#voices.find((v) => v.id === preferredVoiceId);
    if (preferredVoice) return preferredVoice.id;

    const availableVoices = (await this.getVoices(lang))[0]?.voices || [];
    const defaultVoice: TTSVoice | null = availableVoices[0] || null;
    return defaultVoice?.id || this.#currentVoiceId || this.#voices[0]?.id || '';
  };

  async pause(): Promise<boolean> {
    if (!this.#isPlaying || !this.#audioElement) return true;
    this.#pausedAt = this.#audioElement.currentTime - this.#startedAt;
    await this.#audioElement.pause();
    this.#isPlaying = false;
    return true;
  }

  async resume(): Promise<boolean> {
    if (this.#isPlaying || !this.#audioElement) return true;
    await this.#audioElement.play();
    this.#isPlaying = true;
    this.#startedAt = this.#audioElement.currentTime - this.#pausedAt;
    return true;
  }

  async stop(): Promise<void> {
    await this.stopInternal();
  }

  private async stopInternal() {
    this.#isPlaying = false;
    this.#pausedAt = 0;
    this.#startedAt = 0;
    if (this.#audioElement) {
      this.#audioElement.pause();
      this.#audioElement.currentTime = 0;
      if (this.#audioElement.onended) {
        this.#audioElement.onended(new Event('stopped'));
      }
      this.#audioElement.src = '';
    }
  }

  async setRate(rate: number): Promise<void> {
    // Note: VieNeu-TTS doesn't support dynamic rate adjustment
    // Rate is only applied during playback via audio element
    this.#rate = Math.max(0.5, Math.min(2.0, rate));
  }

  async setPitch(pitch: number): Promise<void> {
    // VieNeu-TTS doesn't support pitch adjustment
    this.#pitch = pitch;
  }

  async setVoice(voice: string): Promise<void> {
    const selectedVoice = this.#voices.find((v) => v.id === voice);
    if (selectedVoice) {
      this.#currentVoiceId = selectedVoice.id;
    }
  }

  async getAllVoices(): Promise<TTSVoice[]> {
    this.#voices.forEach((voice) => {
      voice.disabled = !this.initialized;
    });
    return this.#voices;
  }

  async getVoices(lang: string): Promise<TTSVoicesGroup[]> {
    const voices = await this.getAllVoices();
    const filteredVoices = voices.filter((v) => v.lang.startsWith(lang) || lang === 'vi');

    const voicesGroup: TTSVoicesGroup = {
      id: 'vieneu-tts',
      name: 'VieNeu TTS',
      voices: filteredVoices.sort(TTSUtils.sortVoicesFunc),
      disabled: !this.initialized || filteredVoices.length === 0,
    };

    return [voicesGroup];
  }

  setPrimaryLang(lang: string): void {
    this.#primaryLang = lang;
  }

  getGranularities(): TTSGranularity[] {
    return ['sentence'];
  }

  getVoiceId(): string {
    return this.#currentVoiceId;
  }

  getSpeakingLang(): string {
    return this.#speakingLang;
  }

  async shutdown(): Promise<void> {
    this.initialized = false;
    this.#audioElement = null;
    this.#voices = [];
  }
}
