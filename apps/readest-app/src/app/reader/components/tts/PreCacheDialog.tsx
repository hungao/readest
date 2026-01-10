import React, { useState, useEffect } from 'react';
import Dialog from '@/components/Dialog';
import { PreCacheService, PreCacheProgress } from '@/services/tts/PreCacheService';
import { FoliateView } from '@/types/view';
import { useTranslation } from '@/hooks/useTranslation';
import { useBookDataStore } from '@/store/bookDataStore';
import { usePreCacheStore } from '@/store/preCacheStore';
import { MdStorage, MdPause, MdPlayArrow, MdStop, MdCheckCircle, MdError } from 'react-icons/md';

// VieNeu-TTS voices from config.yaml
const VIENEU_VOICES = [
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
];

interface PreCacheDialogProps {
  isOpen: boolean;
  onClose: () => void;
  view: FoliateView;
  bookKey: string;
  voice?: string;
  voiceName?: string;
  bookTitle?: string;
}

export const PreCacheDialog: React.FC<PreCacheDialogProps> = ({
  isOpen,
  onClose,
  view,
  bookKey,
  voice: initialVoice,
  voiceName: initialVoiceName,
  bookTitle: initialBookTitle,
}) => {
  const { getBookData } = useBookDataStore();
  const bookData = getBookData(bookKey);
  const bookTitle = initialBookTitle || bookData?.title || 'Untitled Book';
  const _ = useTranslation();

  const { setPreCacheProgress, getPreCacheProgress, removePreCacheProgress } = usePreCacheStore();

  const [preCacheService] = useState(() => new PreCacheService());
  const [selectedVoice, setSelectedVoice] = useState<string>(initialVoice || VIENEU_VOICES[0]);

  // Use global state for progress
  const globalProgress = getPreCacheProgress(bookKey);
  const [progress, setProgress] = useState<PreCacheProgress>(
    globalProgress || {
      state: 'idle',
      current: 0,
      total: 0,
      percentage: 0,
      message: '',
    }
  );

  const [isStarted, setIsStarted] = useState(
    globalProgress ? globalProgress.state !== 'idle' : false
  );

  // Sync local progress with global state
  useEffect(() => {
    const interval = setInterval(() => {
      const latestProgress = getPreCacheProgress(bookKey);
      if (latestProgress) {
        setProgress(latestProgress);
        if (latestProgress.state !== 'idle') {
          setIsStarted(true);
        }
      }
    }, 200);

    return () => clearInterval(interval);
  }, [bookKey, getPreCacheProgress]);

  const handleStart = async () => {
    if (!selectedVoice) {
      alert(_('Please select a voice'));
      return;
    }

    setIsStarted(true);

    try {
      await preCacheService.preCacheBook(view, {
        voice: selectedVoice,
        bookKey,
        onProgress: (p) => {
          setProgress(p);
          // Update global state
          setPreCacheProgress(bookKey, p);
        },
      });
    } catch (error) {
      console.error('Pre-cache failed:', error);
    }
  };

  const handlePause = () => {
    preCacheService.pause();
    const newProgress = { ...progress, state: 'paused' as const };
    setProgress(newProgress);
    setPreCacheProgress(bookKey, newProgress);
  };

  const handleResume = () => {
    preCacheService.resume();
    const newProgress = { ...progress, state: 'synthesizing' as const };
    setProgress(newProgress);
    setPreCacheProgress(bookKey, newProgress);
  };

  const handleCancel = () => {
    preCacheService.cancel();
    const newProgress = { ...progress, state: 'cancelled' as const };
    setProgress(newProgress);
    setPreCacheProgress(bookKey, newProgress);
    setTimeout(() => {
      removePreCacheProgress(bookKey);
      onClose();
    }, 1000);
  };

  const handleClose = () => {
    // Don't cancel pre-cache when closing dialog - let it run in background
    if (
      preCacheService.isActive &&
      progress.state !== 'completed' &&
      progress.state !== 'failed' &&
      progress.state !== 'cancelled'
    ) {
      const confirmed = confirm(
        _('Pre-caching will continue in the background. You can reopen this dialog to check progress.')
      );
      if (!confirmed) return;
    }

    // If completed/failed/cancelled, remove from global state
    if (
      progress.state === 'completed' ||
      progress.state === 'failed' ||
      progress.state === 'cancelled'
    ) {
      removePreCacheProgress(bookKey);
    }

    onClose();
  };

  const getStateIcon = () => {
    switch (progress.state) {
      case 'completed':
        return <MdCheckCircle className="text-green-500" size={32} />;
      case 'failed':
      case 'cancelled':
        return <MdError className="text-red-500" size={32} />;
      case 'synthesizing':
      case 'extracting':
      case 'checking':
        return <MdStorage className="text-blue-500 animate-pulse" size={32} />;
      default:
        return <MdStorage className="text-gray-500" size={32} />;
    }
  };

  const getStateColor = () => {
    switch (progress.state) {
      case 'completed':
        return 'bg-green-500';
      case 'failed':
      case 'cancelled':
        return 'bg-red-500';
      case 'paused':
        return 'bg-yellow-500';
      case 'synthesizing':
      case 'extracting':
      case 'checking':
        return 'bg-blue-500';
      default:
        return 'bg-gray-300';
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={handleClose}
      title={_('Pre-Cache Book Audio')}
      className="pre-cache-dialog"
    >
      <div className="flex flex-col gap-4 p-4">
        {/* Book Info and Voice Selection */}
        <div className="bg-base-200 p-4 rounded-lg">
          <h3 className="font-semibold text-lg mb-3">{bookTitle}</h3>

          {/* TTS Engine Selector (only VieNeu available) */}
          <div className="mb-3">
            <label className="block text-sm font-medium mb-2">{_('TTS Engine')}</label>
            <select
              className="select select-bordered w-full"
              value="vieneu-tts"
              disabled={isStarted}
            >
              <option value="vieneu-tts">VieNeu TTS</option>
              <option value="edge-tts" disabled>{_('Edge TTS (Coming Soon)')}</option>
              <option value="web-speech" disabled>{_('Web Speech API (Coming Soon)')}</option>
            </select>
          </div>

          {/* Voice Selector */}
          <div className="mb-2">
            <label className="block text-sm font-medium mb-2">{_('Voice')}</label>
            <select
              className="select select-bordered w-full"
              value={selectedVoice}
              onChange={(e) => setSelectedVoice(e.target.value)}
              disabled={isStarted}
            >
              {VIENEU_VOICES.map((voice) => (
                <option key={voice} value={voice}>
                  {voice}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Progress Section */}
        {isStarted && (
          <div className="flex flex-col gap-3">
            {/* Status Icon and Message */}
            <div className="flex items-center gap-3">
              {getStateIcon()}
              <div className="flex-1">
                <p className="font-medium">{progress.message}</p>
                {progress.total > 0 && (
                  <p className="text-sm text-base-content/70">
                    {progress.current} / {progress.total} {_('chunks')}
                  </p>
                )}
              </div>
            </div>

            {/* Progress Bar */}
            {progress.total > 0 && (
              <div className="w-full">
                <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
                  <div
                    className={`h-full ${getStateColor()} transition-all duration-300 flex items-center justify-center text-xs text-white font-medium`}
                    style={{ width: `${progress.percentage}%` }}
                  >
                    {progress.percentage > 10 && `${progress.percentage}%`}
                  </div>
                </div>
              </div>
            )}

            {/* Error Message */}
            {progress.error && (
              <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-700">
                <p className="font-medium">{_('Error')}:</p>
                <p>{progress.error}</p>
              </div>
            )}
          </div>
        )}

        {/* Info Message before starting */}
        {!isStarted && (
          <div className="bg-blue-50 border border-blue-200 rounded p-4 text-sm text-blue-900">
            <p className="mb-2">
              <strong>{_('What is pre-caching?')}</strong>
            </p>
            <p className="mb-2">
              {_('Pre-caching downloads and stores all audio for this book on your device. After pre-caching, you can read the book with TTS even if the VieNeu-TTS server is offline.')}
            </p>
            <p className="text-xs text-blue-700">
              {_('Note: This may take several minutes depending on book length and network speed.')}
            </p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2 justify-end">
          {!isStarted && (
            <>
              <button
                onClick={handleClose}
                className="btn btn-ghost"
              >
                {_('Cancel')}
              </button>
              <button
                onClick={handleStart}
                className="btn btn-primary"
              >
                <MdStorage size={20} />
                {_('Start Pre-Caching')}
              </button>
            </>
          )}

          {isStarted && progress.state !== 'completed' && progress.state !== 'failed' && progress.state !== 'cancelled' && (
            <>
              {progress.state === 'paused' ? (
                <button
                  onClick={handleResume}
                  className="btn btn-success"
                >
                  <MdPlayArrow size={20} />
                  {_('Resume')}
                </button>
              ) : (
                <button
                  onClick={handlePause}
                  className="btn btn-warning"
                  disabled={progress.state === 'extracting' || progress.state === 'checking'}
                >
                  <MdPause size={20} />
                  {_('Pause')}
                </button>
              )}
              <button
                onClick={handleCancel}
                className="btn btn-error"
              >
                <MdStop size={20} />
                {_('Cancel')}
              </button>
            </>
          )}

          {(progress.state === 'completed' || progress.state === 'failed' || progress.state === 'cancelled') && (
            <button
              onClick={handleClose}
              className="btn btn-primary"
            >
              {_('Close')}
            </button>
          )}
        </div>
      </div>
    </Dialog>
  );
};
