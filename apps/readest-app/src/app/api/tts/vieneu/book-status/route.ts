import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

// Cache directory - defaults to project root/tts-cache
const CACHE_DIR = process.env.TTS_CACHE_DIR || path.join(process.cwd(), 'tts-cache');

// Extract stable hash from bookKey (format: "hash-suffix")
// The suffix changes per session, but the hash is stable for the same book
function extractBookHash(bookKey: string): string {
  return bookKey.split('-')[0]!;
}

interface BookStatusResponse {
  bookKey: string;
  voice?: string;
  cachedCount: number;
  totalSize: number; // in bytes
  lastUpdated: number; // timestamp
  voices?: string[]; // List of voices that have cached audio for this book
}

// GET - Get cache status for a book
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const bookKey = searchParams.get('bookKey');
    const voice = searchParams.get('voice'); // Optional - if provided, only check this voice

    if (!bookKey) {
      return NextResponse.json({ error: 'Missing bookKey parameter' }, { status: 400 });
    }

    // Extract stable hash from bookKey (removes per-session suffix)
    const effectiveBookKey = extractBookHash(bookKey);
    const bookCacheDir = path.join(CACHE_DIR, effectiveBookKey);

    // Check if book cache directory exists
    try {
      await fs.access(bookCacheDir);
    } catch {
      // No cache for this book
      return NextResponse.json({
        bookKey,
        voice,
        cachedCount: 0,
        totalSize: 0,
        lastUpdated: 0,
        voices: [],
      } as BookStatusResponse);
    }

    // If voice is specified, check only that voice
    if (voice) {
      const voiceCacheDir = path.join(bookCacheDir, voice);
      try {
        await fs.access(voiceCacheDir);
        const files = await fs.readdir(voiceCacheDir);
        const mp3Files = files.filter((f) => f.endsWith('.mp3'));

        // Calculate total size and last updated
        let totalSize = 0;
        let lastUpdated = 0;
        for (const file of mp3Files) {
          const filePath = path.join(voiceCacheDir, file);
          const stats = await fs.stat(filePath);
          totalSize += stats.size;
          lastUpdated = Math.max(lastUpdated, stats.mtimeMs);
        }

        return NextResponse.json({
          bookKey,
          voice,
          cachedCount: mp3Files.length,
          totalSize,
          lastUpdated,
        } as BookStatusResponse);
      } catch {
        // Voice cache directory doesn't exist
        return NextResponse.json({
          bookKey,
          voice,
          cachedCount: 0,
          totalSize: 0,
          lastUpdated: 0,
        } as BookStatusResponse);
      }
    }

    // No voice specified, check all voices
    const voiceDirs = await fs.readdir(bookCacheDir);
    const voices: string[] = [];
    let totalCachedCount = 0;
    let totalSize = 0;
    let lastUpdated = 0;

    for (const voiceDir of voiceDirs) {
      const voicePath = path.join(bookCacheDir, voiceDir);
      const stats = await fs.stat(voicePath);
      if (!stats.isDirectory()) continue;

      try {
        const files = await fs.readdir(voicePath);
        const mp3Files = files.filter((f) => f.endsWith('.mp3'));

        if (mp3Files.length > 0) {
          voices.push(voiceDir);
          totalCachedCount += mp3Files.length;

          // Calculate size and timestamp for each file
          for (const file of mp3Files) {
            const filePath = path.join(voicePath, file);
            const fileStats = await fs.stat(filePath);
            totalSize += fileStats.size;
            lastUpdated = Math.max(lastUpdated, fileStats.mtimeMs);
          }
        }
      } catch (err) {
        console.warn(`Failed to read voice cache directory: ${voicePath}`, err);
      }
    }

    return NextResponse.json({
      bookKey,
      cachedCount: totalCachedCount,
      totalSize,
      lastUpdated,
      voices,
    } as BookStatusResponse);
  } catch (error) {
    console.error('Book status API error:', error);
    return NextResponse.json(
      {
        error: 'Failed to get book cache status',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
