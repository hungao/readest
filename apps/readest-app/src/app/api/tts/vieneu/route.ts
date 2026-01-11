import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

// Cache directory - defaults to project root/tts-cache
const CACHE_DIR = process.env.TTS_CACHE_DIR || path.join(process.cwd(), 'tts-cache');

// VieNeu-TTS server URL - can be cloud GPU or localhost
const VIENEU_SERVER = process.env.VIENEU_TTS_URL || 'http://localhost:7860';

interface SynthesisRequest {
  text: string;
  voice: string;
  bookKey?: string;
}

interface CacheMetadata {
  text: string;
  voice: string;
  size: number;
  created: string;
  lastUsed: string;
  useCount: number;
  bookKey?: string;
}

// Extract stable hash from bookKey (format: "hash-suffix")
// The suffix changes per session, but the hash is stable for the same book
function extractBookHash(bookKey: string): string {
  return bookKey.split('-')[0]!;
}

// Generate cache key from text + voice
function generateCacheKey(text: string, voice: string): string {
  // Normalize text for better cache hits
  const normalized = text.trim().replace(/\s+/g, ' ');

  // Generate MD5 hash
  const hash = crypto.createHash('md5').update(normalized + voice).digest('hex');
  return hash;
}

// Ensure cache directory exists (nested: bookKey/voice/)
async function ensureCacheDir(bookKey?: string, voice?: string) {
  try {
    if (bookKey && voice) {
      // Nested structure: tts-cache/bookKey/voice/
      const nestedDir = path.join(CACHE_DIR, bookKey, voice);
      await fs.mkdir(nestedDir, { recursive: true });
    } else {
      // Root cache dir only
      await fs.mkdir(CACHE_DIR, { recursive: true });
    }
  } catch (err) {
    console.error('Failed to create cache directory:', err);
  }
}

// Get cached audio file path (nested structure)
function getCacheFilePath(bookKey: string, voice: string, cacheKey: string): string {
  return path.join(CACHE_DIR, bookKey, voice, `${cacheKey}.mp3`);
}

// Get metadata file path (nested structure)
function getMetadataFilePath(bookKey: string, voice: string, cacheKey: string): string {
  return path.join(CACHE_DIR, bookKey, voice, `${cacheKey}.meta.json`);
}

// Legacy: Get old flat cache file path (for migration)
function getLegacyCacheFilePath(cacheKey: string): string {
  return path.join(CACHE_DIR, `${cacheKey}.mp3`);
}

function getLegacyMetadataFilePath(cacheKey: string): string {
  return path.join(CACHE_DIR, `${cacheKey}.meta.json`);
}

// Check if audio is cached (with automatic migration)
async function isCached(bookKey: string, voice: string, cacheKey: string): Promise<boolean> {
  const filePath = getCacheFilePath(bookKey, voice, cacheKey);
  try {
    await fs.access(filePath);
    return true;
  } catch {
    // Check legacy flat structure
    const legacyPath = getLegacyCacheFilePath(cacheKey);
    try {
      await fs.access(legacyPath);
      // Found in legacy location - migrate it
      console.log(`📦 Migrating cache file ${cacheKey.substring(0, 8)}... to nested structure`);
      await migrateCacheFile(bookKey, voice, cacheKey);
      return true;
    } catch {
      return false;
    }
  }
}

// Get cached audio
async function getCachedAudio(bookKey: string, voice: string, cacheKey: string): Promise<Buffer> {
  const filePath = getCacheFilePath(bookKey, voice, cacheKey);
  return await fs.readFile(filePath);
}

// Save audio to cache
async function cacheAudio(
  bookKey: string,
  voice: string,
  cacheKey: string,
  audioBuffer: Buffer,
  metadata: Partial<CacheMetadata>
): Promise<void> {
  // Ensure nested directory exists
  await ensureCacheDir(bookKey, voice);

  const filePath = getCacheFilePath(bookKey, voice, cacheKey);
  const metaPath = getMetadataFilePath(bookKey, voice, cacheKey);

  // Save audio file
  await fs.writeFile(filePath, audioBuffer);

  // Save metadata
  const metaData: CacheMetadata = {
    text: metadata.text || '',
    voice: metadata.voice || '',
    size: audioBuffer.length,
    created: new Date().toISOString(),
    lastUsed: new Date().toISOString(),
    useCount: 1,
    bookKey: metadata.bookKey,
  };
  await fs.writeFile(metaPath, JSON.stringify(metaData, null, 2));
}

// Update metadata (for cache hits)
async function updateMetadata(bookKey: string, voice: string, cacheKey: string): Promise<void> {
  const metaPath = getMetadataFilePath(bookKey, voice, cacheKey);
  try {
    const data = await fs.readFile(metaPath, 'utf-8');
    const meta: CacheMetadata = JSON.parse(data);
    meta.lastUsed = new Date().toISOString();
    meta.useCount++;
    await fs.writeFile(metaPath, JSON.stringify(meta, null, 2));
  } catch (err) {
    // Metadata file doesn't exist or is corrupted - ignore
    console.warn('Failed to update metadata:', err);
  }
}

// Migrate a single cache file from flat to nested structure
async function migrateCacheFile(bookKey: string, voice: string, cacheKey: string): Promise<void> {
  try {
    const legacyAudioPath = getLegacyCacheFilePath(cacheKey);
    const legacyMetaPath = getLegacyMetadataFilePath(cacheKey);

    // Ensure nested directory exists
    await ensureCacheDir(bookKey, voice);

    // Copy audio file
    const audioBuffer = await fs.readFile(legacyAudioPath);
    const newAudioPath = getCacheFilePath(bookKey, voice, cacheKey);
    await fs.writeFile(newAudioPath, audioBuffer);

    // Copy metadata if exists
    try {
      const metaBuffer = await fs.readFile(legacyMetaPath);
      const newMetaPath = getMetadataFilePath(bookKey, voice, cacheKey);
      await fs.writeFile(newMetaPath, metaBuffer);
    } catch {
      // Metadata doesn't exist - that's ok
    }

    // Delete legacy files
    await fs.unlink(legacyAudioPath);
    try {
      await fs.unlink(legacyMetaPath);
    } catch {
      // Metadata might not exist
    }

    console.log(`✅ Migrated ${cacheKey.substring(0, 8)}... from flat to nested structure`);
  } catch (err) {
    console.error(`❌ Failed to migrate cache file ${cacheKey}:`, err);
    throw err;
  }
}

// Synthesize audio via VieNeu-TTS
async function synthesizeAudio(text: string, voice: string, apiKey?: string): Promise<Buffer> {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  // Add API key if provided
  if (apiKey) {
    headers['X-API-Key'] = apiKey;
  }

  const response = await fetch(`${VIENEU_SERVER}/api/synthesize`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      text,
      voice,
      mode: 'standard',
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`VieNeu-TTS synthesis failed: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// POST - Synthesize audio with caching
export async function POST(request: NextRequest) {
  try {
    const body: SynthesisRequest = await request.json();
    const { text, voice, bookKey } = body;

    // Extract API key from request headers
    const apiKey = request.headers.get('X-VieNeu-API-Key');

    if (!text || !voice) {
      return NextResponse.json(
        { error: 'Missing text or voice parameter' },
        { status: 400 }
      );
    }

    // Use default bookKey if not provided (for backwards compatibility)
    // Extract stable hash from bookKey (removes per-session suffix)
    const effectiveBookKey = bookKey ? extractBookHash(bookKey) : '_default';

    // Generate cache key
    const cacheKey = generateCacheKey(text, voice);

    // Check cache first (with automatic migration)
    if (await isCached(effectiveBookKey, voice, cacheKey)) {
      console.log(`✓ VieNeu-TTS Cache HIT: ${cacheKey.substring(0, 8)}... [${effectiveBookKey}/${voice}]`);

      // Update metadata
      await updateMetadata(effectiveBookKey, voice, cacheKey);

      // Return cached audio
      const audioBuffer = await getCachedAudio(effectiveBookKey, voice, cacheKey);

      return new NextResponse(audioBuffer, {
        headers: {
          'Content-Type': 'audio/mpeg',
          'X-Cache-Status': 'HIT',
          'X-Cache-Key': cacheKey,
          'Cache-Control': 'public, max-age=31536000', // Cache for 1 year
        },
      });
    }

    // Cache MISS - synthesize
    console.log(`✗ VieNeu-TTS Cache MISS: ${cacheKey.substring(0, 8)}... [${effectiveBookKey}/${voice}] - synthesizing...`);

    const audioBuffer = await synthesizeAudio(text, voice, apiKey || undefined);

    // Save to cache with nested structure
    await cacheAudio(effectiveBookKey, voice, cacheKey, audioBuffer, { text, voice, bookKey: effectiveBookKey });
    console.log(`✓ Cached to: ${getCacheFilePath(effectiveBookKey, voice, cacheKey)}`);

    return new NextResponse(audioBuffer, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'X-Cache-Status': 'MISS',
        'X-Cache-Key': cacheKey,
      },
    });
  } catch (error) {
    console.error('VieNeu-TTS API error:', error);

    // Check if it's a connection error to VieNeu-TTS server
    if (error instanceof Error && error.message.includes('fetch failed')) {
      return NextResponse.json(
        {
          error: 'VieNeu-TTS server not reachable',
          details: `Cannot connect to ${VIENEU_SERVER}. Please ensure VieNeu-TTS server is running.`,
          serverUrl: VIENEU_SERVER,
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      {
        error: 'Synthesis failed',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

// GET - Cache statistics (supports nested structure)
export async function GET(request: NextRequest) {
  try {
    await ensureCacheDir();

    let totalSize = 0;
    let totalFiles = 0;

    // Read metadata for book grouping
    const bookStats: Record<
      string,
      {
        bookKey: string;
        title?: string;
        cachedParagraphs: number;
        totalSize: number;
        voices: Record<string, number>; // voice -> file count
      }
    > = {};

    // Check if cache directory exists
    try {
      await fs.access(CACHE_DIR);
    } catch {
      // Cache directory doesn't exist yet
      return NextResponse.json({
        cacheDir: CACHE_DIR,
        fileCount: 0,
        totalSize: 0,
        totalSizeMB: '0.00',
        serverUrl: VIENEU_SERVER,
        books: [],
      });
    }

    // Scan nested structure: bookKey/voice/files
    const bookDirs = await fs.readdir(CACHE_DIR);

    for (const bookDir of bookDirs) {
      const bookPath = path.join(CACHE_DIR, bookDir);
      const stat = await fs.stat(bookPath);

      if (!stat.isDirectory()) continue; // Skip non-directories (legacy files)

      const bookKey = bookDir;

      // Scan voice directories
      const voiceDirs = await fs.readdir(bookPath);

      for (const voiceDir of voiceDirs) {
        const voicePath = path.join(bookPath, voiceDir);
        const voiceStat = await fs.stat(voicePath);

        if (!voiceStat.isDirectory()) continue;

        const voice = voiceDir;

        // Scan files in voice directory
        const files = await fs.readdir(voicePath);
        const audioFiles = files.filter((f) => f.endsWith('.mp3'));

        // Initialize book stats if not exists
        if (!bookStats[bookKey]) {
          bookStats[bookKey] = {
            bookKey,
            cachedParagraphs: 0,
            totalSize: 0,
            voices: {},
          };
        }

        // Count files for this voice
        bookStats[bookKey].voices[voice] = (bookStats[bookKey].voices[voice] || 0) + audioFiles.length;

        // Calculate sizes
        for (const audioFile of audioFiles) {
          const filePath = path.join(voicePath, audioFile);
          const fileStats = await fs.stat(filePath);
          totalSize += fileStats.size;
          bookStats[bookKey].totalSize += fileStats.size;
          bookStats[bookKey].cachedParagraphs++;
          totalFiles++;
        }
      }
    }

    // Convert to array
    const books = Object.values(bookStats).map((book) => ({
      ...book,
      voices: Object.entries(book.voices).map(([voice, count]) => ({
        voice,
        fileCount: count,
      })),
    }));

    return NextResponse.json({
      cacheDir: CACHE_DIR,
      fileCount: totalFiles,
      totalSize: totalSize,
      totalSizeMB: (totalSize / 1024 / 1024).toFixed(2),
      serverUrl: VIENEU_SERVER,
      books: books,
    });
  } catch (error) {
    console.error('Failed to get cache statistics:', error);
    return NextResponse.json(
      {
        error: 'Failed to get cache statistics',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
