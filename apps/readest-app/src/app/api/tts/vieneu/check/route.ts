import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

// Cache directory - defaults to project root/tts-cache
const CACHE_DIR = process.env.TTS_CACHE_DIR || path.join(process.cwd(), 'tts-cache');

interface CheckRequest {
  texts: string[];
  voice: string;
  bookKey?: string; // Optional for backwards compatibility
}

interface CheckResult {
  text: string;
  cached: boolean;
  cacheKey: string;
}

interface CheckResponse {
  results: CheckResult[];
  cachedCount: number;
  totalCount: number;
  cacheRate: number;
}

// Extract stable hash from bookKey (format: "hash-suffix")
// The suffix changes per session, but the hash is stable for the same book
function extractBookHash(bookKey: string): string {
  return bookKey.split('-')[0]!;
}

// Generate cache key from text + voice (same logic as main route)
function generateCacheKey(text: string, voice: string): string {
  // Normalize text for better cache hits
  const normalized = text.trim().replace(/\s+/g, ' ');

  // Generate MD5 hash
  const hash = crypto.createHash('md5').update(normalized + voice).digest('hex');
  return hash;
}

// Get cached audio file path (supports nested structure)
function getCacheFilePath(bookKey: string | undefined, voice: string, cacheKey: string): string {
  if (bookKey) {
    // Nested structure: tts-cache/bookKey/voice/hash.mp3
    return path.join(CACHE_DIR, bookKey, voice, `${cacheKey}.mp3`);
  } else {
    // Legacy flat structure
    return path.join(CACHE_DIR, `${cacheKey}.mp3`);
  }
}

// Legacy: Get old flat cache file path
function getLegacyCacheFilePath(cacheKey: string): string {
  return path.join(CACHE_DIR, `${cacheKey}.mp3`);
}

// Check if audio is cached (checks both nested and flat structures)
async function isCached(bookKey: string | undefined, voice: string, cacheKey: string): Promise<boolean> {
  // Check nested structure first
  if (bookKey) {
    const nestedPath = getCacheFilePath(bookKey, voice, cacheKey);
    try {
      await fs.access(nestedPath);
      return true;
    } catch {
      // Not in nested structure, fall through to check legacy
    }
  }

  // Check legacy flat structure
  const legacyPath = getLegacyCacheFilePath(cacheKey);
  try {
    await fs.access(legacyPath);
    return true;
  } catch {
    return false;
  }
}

// POST - Check if texts are cached
export async function POST(request: NextRequest) {
  try {
    const body: CheckRequest = await request.json();
    const { texts, voice, bookKey } = body;

    if (!texts || !Array.isArray(texts) || !voice) {
      return NextResponse.json(
        { error: 'Missing or invalid texts array or voice parameter' },
        { status: 400 }
      );
    }

    // Extract stable hash from bookKey (removes per-session suffix)
    const effectiveBookKey = bookKey ? extractBookHash(bookKey) : undefined;

    // Check each text (supports both nested and legacy flat structure)
    const results: CheckResult[] = await Promise.all(
      texts.map(async (text) => {
        const cacheKey = generateCacheKey(text, voice);
        const cached = await isCached(effectiveBookKey, voice, cacheKey);

        return {
          text,
          cached,
          cacheKey: cacheKey.substring(0, 12), // Return truncated key
        };
      })
    );

    const cachedCount = results.filter((r) => r.cached).length;
    const totalCount = results.length;
    const cacheRate = totalCount > 0 ? cachedCount / totalCount : 0;

    const response: CheckResponse = {
      results,
      cachedCount,
      totalCount,
      cacheRate: Math.round(cacheRate * 100) / 100, // Round to 2 decimal places
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Cache check API error:', error);
    return NextResponse.json(
      {
        error: 'Cache check failed',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
