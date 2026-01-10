import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

// Cache directory - defaults to project root/tts-cache
const CACHE_DIR = process.env.TTS_CACHE_DIR || path.join(process.cwd(), 'tts-cache');

interface CacheMetadata {
  text: string;
  voice: string;
  size: number;
  created: string;
  lastUsed: string;
  useCount: number;
  bookKey?: string;
}

interface ClearCacheRequest {
  bookKey?: string; // Clear specific book, or all if not provided
  voice?: string; // Clear specific voice only
}

// Get cache file path
function getCacheFilePath(cacheKey: string): string {
  return path.join(CACHE_DIR, `${cacheKey}.mp3`);
}

// Get metadata file path
function getMetadataFilePath(cacheKey: string): string {
  return path.join(CACHE_DIR, `${cacheKey}.meta.json`);
}

// Ensure cache directory exists
async function ensureCacheDir() {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
  } catch (err) {
    console.error('Failed to create cache directory:', err);
  }
}

// GET - Detailed cache statistics
export async function GET(request: NextRequest) {
  try {
    await ensureCacheDir();

    // Read all files in cache directory
    const files = await fs.readdir(CACHE_DIR);
    const audioFiles = files.filter((f) => f.endsWith('.mp3'));
    const metaFiles = files.filter((f) => f.endsWith('.meta.json'));

    // Calculate total size and collect all metadata
    let totalSize = 0;
    const allMetadata: (CacheMetadata & { cacheKey: string })[] = [];

    for (const audioFile of audioFiles) {
      const cacheKey = audioFile.replace('.mp3', '');
      const audioPath = path.join(CACHE_DIR, audioFile);
      const metaPath = getMetadataFilePath(cacheKey);

      try {
        const stats = await fs.stat(audioPath);
        totalSize += stats.size;

        // Try to read metadata
        try {
          const metaData = await fs.readFile(metaPath, 'utf-8');
          const meta: CacheMetadata = JSON.parse(metaData);
          allMetadata.push({ ...meta, cacheKey });
        } catch {
          // Metadata doesn't exist - skip
        }
      } catch {
        // File doesn't exist - skip
      }
    }

    // Group by book
    const bookStats: Record<
      string,
      {
        bookKey: string;
        title?: string;
        cachedParagraphs: number;
        totalSize: number;
        voices: Set<string>;
        lastUsed?: string;
      }
    > = {};

    for (const meta of allMetadata) {
      if (meta.bookKey) {
        if (!bookStats[meta.bookKey]) {
          bookStats[meta.bookKey] = {
            bookKey: meta.bookKey,
            cachedParagraphs: 0,
            totalSize: 0,
            voices: new Set(),
            lastUsed: meta.lastUsed,
          };
        }
        bookStats[meta.bookKey].cachedParagraphs++;
        bookStats[meta.bookKey].totalSize += meta.size;
        bookStats[meta.bookKey].voices.add(meta.voice);

        // Update last used if newer
        if (
          !bookStats[meta.bookKey].lastUsed ||
          new Date(meta.lastUsed) > new Date(bookStats[meta.bookKey].lastUsed!)
        ) {
          bookStats[meta.bookKey].lastUsed = meta.lastUsed;
        }
      }
    }

    // Group by voice
    const voiceStats: Record<string, { voice: string; count: number; totalSize: number }> = {};
    for (const meta of allMetadata) {
      if (!voiceStats[meta.voice]) {
        voiceStats[meta.voice] = { voice: meta.voice, count: 0, totalSize: 0 };
      }
      voiceStats[meta.voice].count++;
      voiceStats[meta.voice].totalSize += meta.size;
    }

    // Convert to arrays
    const books = Object.values(bookStats).map((book) => ({
      ...book,
      voices: Array.from(book.voices),
      totalSizeMB: (book.totalSize / 1024 / 1024).toFixed(2),
    }));

    const voices = Object.values(voiceStats).map((voice) => ({
      ...voice,
      totalSizeMB: (voice.totalSize / 1024 / 1024).toFixed(2),
    }));

    // Most used entries
    const topUsed = [...allMetadata]
      .sort((a, b) => b.useCount - a.useCount)
      .slice(0, 10)
      .map((meta) => ({
        text: meta.text.substring(0, 100) + (meta.text.length > 100 ? '...' : ''),
        voice: meta.voice,
        useCount: meta.useCount,
        lastUsed: meta.lastUsed,
        sizeMB: (meta.size / 1024 / 1024).toFixed(2),
      }));

    // Recent entries
    const recent = [...allMetadata]
      .sort((a, b) => new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime())
      .slice(0, 10)
      .map((meta) => ({
        text: meta.text.substring(0, 100) + (meta.text.length > 100 ? '...' : ''),
        voice: meta.voice,
        useCount: meta.useCount,
        lastUsed: meta.lastUsed,
        sizeMB: (meta.size / 1024 / 1024).toFixed(2),
      }));

    return NextResponse.json({
      cacheDir: CACHE_DIR,
      summary: {
        fileCount: audioFiles.length,
        totalSize: totalSize,
        totalSizeMB: (totalSize / 1024 / 1024).toFixed(2),
        totalSizeGB: (totalSize / 1024 / 1024 / 1024).toFixed(2),
      },
      books: books,
      voices: voices,
      topUsed: topUsed,
      recent: recent,
    });
  } catch (error) {
    console.error('Failed to get detailed cache statistics:', error);
    return NextResponse.json(
      {
        error: 'Failed to get cache statistics',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

// POST - Clear cache (all or selective)
export async function POST(request: NextRequest) {
  try {
    await ensureCacheDir();

    const body: ClearCacheRequest = await request.json().catch(() => ({}));
    const { bookKey, voice } = body;

    // Read all files
    const files = await fs.readdir(CACHE_DIR);
    const audioFiles = files.filter((f) => f.endsWith('.mp3'));

    let deletedCount = 0;
    let deletedSize = 0;

    for (const audioFile of audioFiles) {
      const cacheKey = audioFile.replace('.mp3', '');
      const audioPath = path.join(CACHE_DIR, audioFile);
      const metaPath = getMetadataFilePath(cacheKey);

      let shouldDelete = false;

      // If no filters, delete all
      if (!bookKey && !voice) {
        shouldDelete = true;
      } else {
        // Check metadata for filters
        try {
          const metaData = await fs.readFile(metaPath, 'utf-8');
          const meta: CacheMetadata = JSON.parse(metaData);

          if (bookKey && meta.bookKey === bookKey) {
            if (!voice || meta.voice === voice) {
              shouldDelete = true;
            }
          } else if (voice && !bookKey && meta.voice === voice) {
            shouldDelete = true;
          }
        } catch {
          // If metadata doesn't exist and no filters, delete
          if (!bookKey && !voice) {
            shouldDelete = true;
          }
        }
      }

      if (shouldDelete) {
        try {
          // Get size before deleting
          const stats = await fs.stat(audioPath);
          deletedSize += stats.size;

          // Delete audio file
          await fs.unlink(audioPath);
          deletedCount++;

          // Delete metadata file if exists
          try {
            await fs.unlink(metaPath);
          } catch {
            // Metadata file doesn't exist - ignore
          }
        } catch (err) {
          console.error(`Failed to delete ${audioFile}:`, err);
        }
      }
    }

    return NextResponse.json({
      success: true,
      deletedCount: deletedCount,
      deletedSizeMB: (deletedSize / 1024 / 1024).toFixed(2),
      filter: {
        bookKey: bookKey || 'all',
        voice: voice || 'all',
      },
    });
  } catch (error) {
    console.error('Failed to clear cache:', error);
    return NextResponse.json(
      {
        error: 'Failed to clear cache',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
