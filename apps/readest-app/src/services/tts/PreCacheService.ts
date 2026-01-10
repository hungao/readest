import { FoliateView } from '@/types/view';
import { parseSSMLMarks } from '@/utils/ssml';

export interface PreCacheProgress {
  state: 'idle' | 'extracting' | 'checking' | 'synthesizing' | 'completed' | 'paused' | 'failed' | 'cancelled';
  current: number;
  total: number;
  percentage: number;
  message: string;
  error?: string;
}

export interface PreCacheOptions {
  voice: string;
  bookKey: string;
  onProgress?: (progress: PreCacheProgress) => void;
}

export interface CheckCacheResult {
  results: Array<{
    text: string;
    cached: boolean;
    cacheKey: string;
  }>;
  cachedCount: number;
  totalCount: number;
  cacheRate: number;
}

export class PreCacheService {
  private abortController: AbortController | null = null;
  private isPaused = false;

  /**
   * Extract all text chunks from the book
   */
  async extractBookText(view: FoliateView, lang: any): Promise<string[]> {
    const allTexts: string[] = [];

    // Detect language properly - handle both string and object
    let detectedLang: string = 'vi';
    if (typeof lang === 'string') {
      detectedLang = lang;
    } else if (lang && typeof lang === 'object' && lang.canonical) {
      detectedLang = lang.canonical;
    } else if (view.language && typeof view.language === 'object' && (view.language as any).canonical) {
      detectedLang = (view.language as any).canonical;
    }

    console.log('📖 [PreCache] Starting book text extraction...');
    console.log('📖 [PreCache] Language (raw):', lang);
    console.log('📖 [PreCache] Language (detected string):', detectedLang);
    console.log('📖 [PreCache] View type:', typeof view);
    console.log('📖 [PreCache] Book sections:', view.book?.sections?.length || 'unknown');

    try {
      // Initialize TTS on view if not already initialized
      if (!view.tts) {
        console.log('⚠️ [PreCache] view.tts not initialized, initializing now...');
        try {
          // Use the view's built-in initTTS method
          await view.initTTS('sentence');
          console.log('✅ [PreCache] TTS initialized successfully via view.initTTS()');
        } catch (err) {
          console.error('❌ [PreCache] Failed to initialize TTS:', err);
          throw new Error('Cannot initialize TTS for text extraction');
        }
      } else {
        console.log('✅ [PreCache] view.tts already exists');
      }

      // Save current position to restore later (with error handling)
      let currentLocation: string | null = null;
      try {
        currentLocation = await view.getCFI();
        console.log('📖 [PreCache] Current CFI saved:', currentLocation?.substring(0, 50));
      } catch (err) {
        console.warn('⚠️ [PreCache] Could not get current CFI, will not restore position:', err);
      }

      // NEW APPROACH 2: Extract text from book sections directly
      // This avoids viewport/rendering issues
      console.log('📖 [PreCache] Starting section-based extraction...');
      console.log('📖 [PreCache] Book has', view.book?.sections?.length || 0, 'sections');

      const sections = view.book?.sections || [];
      if (sections.length === 0) {
        throw new Error('No sections found in book');
      }

      // APPROACH 3: Try pagination approach - use view.next() to navigate through pages
      console.log('📖 [PreCache] Trying pagination approach with view.next()...');

      // Go to start of book
      await view.goTo(0);
      await new Promise(resolve => setTimeout(resolve, 800));

      let pageCount = 0;
      const MAX_PAGES = 1000; // Safety limit

      // Extract from first page
      try {
        const ssml = view.tts.start();
        if (ssml) {
          console.log(`📄 Page ${pageCount + 1}: Got SSML (${ssml.length} chars)`);
          console.log(`  🔍 Content preview: ${ssml.substring(0, 150)}...`);
          const { marks } = parseSSMLMarks(ssml, detectedLang);

          for (const mark of marks) {
            const trimmedText = mark.text?.trim();
            if (trimmedText && trimmedText.length > 0 && !allTexts.includes(trimmedText)) {
              allTexts.push(trimmedText);
              console.log(`  ✅ Added chunk: "${trimmedText.substring(0, 50)}..."`);
            }
          }
        }
      } catch (err) {
        console.warn('  ❌ Error on first page:', err);
      }

      // Navigate through remaining pages
      while (pageCount < MAX_PAGES) {
        pageCount++;

        try {
          // Try to go to next page
          const hasNext = await view.next();

          if (!hasNext) {
            console.log(`📖 [PreCache] Reached end of book at page ${pageCount}`);
            break;
          }

          // Wait for page to render
          await new Promise(resolve => setTimeout(resolve, 400));

          // Extract from this page
          const ssml = view.tts.start();
          if (ssml) {
            console.log(`📄 Page ${pageCount + 1}: Got SSML (${ssml.length} chars)`);
            const { marks } = parseSSMLMarks(ssml, detectedLang);

            let addedOnPage = 0;
            for (const mark of marks) {
              const trimmedText = mark.text?.trim();
              if (trimmedText && trimmedText.length > 0 && !allTexts.includes(trimmedText)) {
                allTexts.push(trimmedText);
                addedOnPage++;
              }
            }

            if (addedOnPage > 0) {
              console.log(`  ✅ Added ${addedOnPage} new chunks (${allTexts.length} total)`);
            } else {
              console.log(`  ⚠️ No new chunks on this page`);
            }
          }
        } catch (err) {
          console.warn(`  ❌ Error on page ${pageCount + 1}:`, err);
          break;
        }

        // Show progress every 10 pages
        if (pageCount % 10 === 0) {
          console.log(`📊 [PreCache] Progress: ${pageCount} pages, ${allTexts.length} unique chunks`);
        }
      }

      console.log(`\n✅ [PreCache] Extraction complete!`);
      console.log(`📊 [PreCache] Total sections processed: ${sections.length}`);
      console.log(`📊 [PreCache] Total text chunks extracted: ${allTexts.length}`);

      // Restore original position (with error handling)
      if (currentLocation) {
        try {
          console.log('📖 [PreCache] Restoring original position...');
          await view.goTo(currentLocation);
          console.log('✅ [PreCache] Position restored');
        } catch (err) {
          console.warn('⚠️ [PreCache] Could not restore original position:', err);
        }
      }
    } catch (error) {
      console.error('❌ [PreCache] Failed to extract book text:', error);
      throw new Error(`Text extraction failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    return allTexts;
  }

  /**
   * Check which texts are already cached
   */
  async checkCachedTexts(texts: string[], voice: string, bookKey: string): Promise<CheckCacheResult> {
    const response = await fetch('/api/tts/vieneu/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts, voice, bookKey }),
    });

    if (!response.ok) {
      throw new Error(`Cache check failed: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Synthesize and cache a single text
   */
  private async synthesizeText(text: string, voice: string, bookKey: string): Promise<void> {
    const response = await fetch('/api/tts/vieneu', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice, bookKey }),
      signal: this.abortController?.signal,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }

    // Consume the response to complete the request
    await response.blob();
  }

  /**
   * Pre-cache all uncached texts
   */
  async preCacheBook(view: FoliateView, options: PreCacheOptions): Promise<void> {
    const { voice, bookKey, onProgress } = options;
    this.abortController = new AbortController();
    this.isPaused = false;

    const updateProgress = (state: PreCacheProgress['state'], current: number, total: number, message: string, error?: string) => {
      const progress: PreCacheProgress = {
        state,
        current,
        total,
        percentage: total > 0 ? Math.round((current / total) * 100) : 0,
        message,
        error,
      };
      onProgress?.(progress);
    };

    try {
      // Step 1: Extract book text
      updateProgress('extracting', 0, 0, 'Extracting book text...');
      // Detect language properly
      const lang = (view.language as any)?.code || view.language || 'vi';
      console.log('📖 [PreCache] Detected language for extraction:', lang);
      const allTexts = await this.extractBookText(view, lang);

      if (allTexts.length === 0) {
        updateProgress('failed', 0, 0, 'No text found in book', 'Book appears to be empty');
        return;
      }

      // Step 2: Check which texts are cached
      updateProgress('checking', 0, allTexts.length, `Checking cache status for ${allTexts.length} chunks...`);
      const cacheStatus = await this.checkCachedTexts(allTexts, voice, bookKey);

      const uncachedTexts = cacheStatus.results
        .filter((r) => !r.cached)
        .map((r) => r.text);

      if (uncachedTexts.length === 0) {
        updateProgress('completed', allTexts.length, allTexts.length, 'All texts already cached!');
        return;
      }

      // Step 3: Synthesize uncached texts in batches
      const BATCH_SIZE = 5; // Process 5 requests concurrently
      const totalToCache = uncachedTexts.length;
      let completed = 0;

      updateProgress('synthesizing', 0, totalToCache, `Synthesizing ${totalToCache} uncached chunks...`);

      for (let i = 0; i < uncachedTexts.length; i += BATCH_SIZE) {
        // Check if cancelled
        if (this.abortController?.signal.aborted) {
          updateProgress('cancelled', completed, totalToCache, 'Pre-caching cancelled');
          return;
        }

        // Wait if paused
        while (this.isPaused) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }

        // Process batch
        const batch = uncachedTexts.slice(i, i + BATCH_SIZE);
        const promises = batch.map((text) =>
          this.synthesizeText(text, voice, bookKey)
            .then(() => {
              completed++;
              updateProgress('synthesizing', completed, totalToCache, `Synthesized ${completed}/${totalToCache} chunks...`);
            })
            .catch((err) => {
              console.error('Failed to synthesize text:', err);
              // Continue with other texts even if one fails
            })
        );

        await Promise.all(promises);
      }

      // Step 4: Complete
      updateProgress('completed', totalToCache, totalToCache, `Successfully pre-cached ${totalToCache} chunks!`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Pre-cache error:', error);
      updateProgress('failed', 0, 0, 'Pre-caching failed', errorMessage);
      throw error;
    }
  }

  /**
   * Pause pre-caching
   */
  pause(): void {
    this.isPaused = true;
  }

  /**
   * Resume pre-caching
   */
  resume(): void {
    this.isPaused = false;
  }

  /**
   * Cancel pre-caching
   */
  cancel(): void {
    this.abortController?.abort();
    this.isPaused = false;
  }

  /**
   * Check if pre-caching is in progress
   */
  get isActive(): boolean {
    return this.abortController !== null && !this.abortController.signal.aborted;
  }
}
