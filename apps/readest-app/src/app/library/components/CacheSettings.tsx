import React, { useState, useEffect } from 'react';
import { HiTrash, HiRefresh } from 'react-icons/hi';
import { FiDatabase, FiHardDrive } from 'react-icons/fi';
import { useTranslation } from '@/hooks/useTranslation';

interface CacheStats {
  cacheDir: string;
  summary: {
    fileCount: number;
    totalSize: number;
    totalSizeMB: string;
    totalSizeGB: string;
  };
  books: Array<{
    bookKey: string;
    title?: string;
    cachedParagraphs: number;
    totalSize: number;
    totalSizeMB: string;
    voices: string[];
    lastUsed?: string;
  }>;
  voices: Array<{
    voice: string;
    count: number;
    totalSize: number;
    totalSizeMB: string;
  }>;
  topUsed: Array<{
    text: string;
    voice: string;
    useCount: number;
    lastUsed: string;
    sizeMB: string;
  }>;
  recent: Array<{
    text: string;
    voice: string;
    useCount: number;
    lastUsed: string;
    sizeMB: string;
  }>;
}

interface CacheSettingsProps {
  onClose?: () => void;
}

const CacheSettings: React.FC<CacheSettingsProps> = ({ onClose }) => {
  const _ = useTranslation();
  const [stats, setStats] = useState<CacheStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'books' | 'voices'>('overview');

  const fetchStats = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/tts/vieneu/stats');

      if (!response.ok) {
        throw new Error(`Failed to fetch cache stats: ${response.statusText}`);
      }

      const data = await response.json();
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      console.error('Failed to fetch cache stats:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const handleClearCache = async (bookKey?: string, voice?: string) => {
    const confirmMessage = bookKey
      ? `Clear cache for book "${bookKey}"?`
      : voice
        ? `Clear cache for voice "${voice}"?`
        : 'Clear all cache? This cannot be undone.';

    if (!confirm(confirmMessage)) {
      return;
    }

    try {
      setClearing(true);
      const response = await fetch('/api/tts/vieneu/stats', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ bookKey, voice }),
      });

      if (!response.ok) {
        throw new Error(`Failed to clear cache: ${response.statusText}`);
      }

      const result = await response.json();
      alert(`Successfully cleared ${result.deletedCount} items (${result.deletedSizeMB} MB)`);

      // Refresh stats
      await fetchStats();
    } catch (err) {
      alert(`Failed to clear cache: ${err instanceof Error ? err.message : String(err)}`);
      console.error('Failed to clear cache:', err);
    } finally {
      setClearing(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  if (loading) {
    return (
      <div className='flex items-center justify-center p-8'>
        <div className='loading loading-spinner loading-lg'></div>
        <span className='ml-4'>Loading cache statistics...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className='alert alert-error'>
        <span>Error: {error}</span>
        <button className='btn btn-sm' onClick={fetchStats}>
          Retry
        </button>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className='alert alert-info'>
        <span>No cache data available</span>
      </div>
    );
  }

  return (
    <div className='flex flex-col gap-4 p-4'>
      {/* Header */}
      <div className='flex items-center justify-between'>
        <h2 className='text-2xl font-bold flex items-center gap-2'>
          <FiDatabase className='text-primary' />
          VieNeu-TTS Cache Settings
        </h2>
        <div className='flex gap-2'>
          <button className='btn btn-sm btn-ghost' onClick={fetchStats} disabled={loading}>
            <HiRefresh className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          {onClose && (
            <button className='btn btn-sm btn-ghost' onClick={onClose}>
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
        <div className='stat bg-base-200 rounded-lg'>
          <div className='stat-figure text-primary'>
            <FiHardDrive size={32} />
          </div>
          <div className='stat-title'>Total Size</div>
          <div className='stat-value text-primary'>{stats.summary.totalSizeMB} MB</div>
          <div className='stat-desc'>{stats.summary.totalSizeGB} GB</div>
        </div>

        <div className='stat bg-base-200 rounded-lg'>
          <div className='stat-title'>Cached Files</div>
          <div className='stat-value text-secondary'>{stats.summary.fileCount}</div>
          <div className='stat-desc'>{stats.books.length} books</div>
        </div>

        <div className='stat bg-base-200 rounded-lg'>
          <div className='stat-title'>Cache Directory</div>
          <div className='stat-value text-xs break-all'>{stats.cacheDir}</div>
          <div className='stat-actions mt-2'>
            <button
              className='btn btn-sm btn-error'
              onClick={() => handleClearCache()}
              disabled={clearing}
            >
              <HiTrash />
              Clear All Cache
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className='tabs tabs-boxed'>
        <a
          className={`tab ${activeTab === 'overview' ? 'tab-active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </a>
        <a
          className={`tab ${activeTab === 'books' ? 'tab-active' : ''}`}
          onClick={() => setActiveTab('books')}
        >
          Books ({stats.books.length})
        </a>
        <a
          className={`tab ${activeTab === 'voices' ? 'tab-active' : ''}`}
          onClick={() => setActiveTab('voices')}
        >
          Voices ({stats.voices.length})
        </a>
      </div>

      {/* Tab Content */}
      <div className='overflow-auto max-h-96'>
        {activeTab === 'overview' && (
          <div className='space-y-4'>
            {/* Most Used */}
            <div>
              <h3 className='text-lg font-semibold mb-2'>Most Used Cache Entries</h3>
              <div className='overflow-x-auto'>
                <table className='table table-zebra table-sm'>
                  <thead>
                    <tr>
                      <th>Text</th>
                      <th>Voice</th>
                      <th>Use Count</th>
                      <th>Size (MB)</th>
                      <th>Last Used</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.topUsed.map((entry, idx) => (
                      <tr key={idx}>
                        <td className='max-w-xs truncate' title={entry.text}>
                          {entry.text}
                        </td>
                        <td>{entry.voice}</td>
                        <td>{entry.useCount}</td>
                        <td>{entry.sizeMB}</td>
                        <td className='text-sm'>{formatDate(entry.lastUsed)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Recent */}
            <div>
              <h3 className='text-lg font-semibold mb-2'>Recently Used</h3>
              <div className='overflow-x-auto'>
                <table className='table table-zebra table-sm'>
                  <thead>
                    <tr>
                      <th>Text</th>
                      <th>Voice</th>
                      <th>Use Count</th>
                      <th>Size (MB)</th>
                      <th>Last Used</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.recent.map((entry, idx) => (
                      <tr key={idx}>
                        <td className='max-w-xs truncate' title={entry.text}>
                          {entry.text}
                        </td>
                        <td>{entry.voice}</td>
                        <td>{entry.useCount}</td>
                        <td>{entry.sizeMB}</td>
                        <td className='text-sm'>{formatDate(entry.lastUsed)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'books' && (
          <div className='overflow-x-auto'>
            <table className='table table-zebra'>
              <thead>
                <tr>
                  <th>Book Key</th>
                  <th>Cached Paragraphs</th>
                  <th>Size (MB)</th>
                  <th>Voices</th>
                  <th>Last Used</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {stats.books.map((book, idx) => (
                  <tr key={idx}>
                    <td className='font-mono text-sm'>{book.bookKey}</td>
                    <td>{book.cachedParagraphs}</td>
                    <td>{book.totalSizeMB}</td>
                    <td>
                      <div className='flex flex-wrap gap-1'>
                        {book.voices.map((voice, vidx) => (
                          <span key={vidx} className='badge badge-sm'>
                            {voice}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className='text-sm'>{book.lastUsed ? formatDate(book.lastUsed) : 'N/A'}</td>
                    <td>
                      <button
                        className='btn btn-xs btn-error'
                        onClick={() => handleClearCache(book.bookKey)}
                        disabled={clearing}
                      >
                        <HiTrash size={12} />
                        Clear
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'voices' && (
          <div className='overflow-x-auto'>
            <table className='table table-zebra'>
              <thead>
                <tr>
                  <th>Voice</th>
                  <th>Cached Items</th>
                  <th>Total Size (MB)</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {stats.voices.map((voice, idx) => (
                  <tr key={idx}>
                    <td className='font-semibold'>{voice.voice}</td>
                    <td>{voice.count}</td>
                    <td>{voice.totalSizeMB}</td>
                    <td>
                      <button
                        className='btn btn-xs btn-error'
                        onClick={() => handleClearCache(undefined, voice.voice)}
                        disabled={clearing}
                      >
                        <HiTrash size={12} />
                        Clear
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Info Footer */}
      <div className='alert alert-info text-sm'>
        <span>
          💡 Cached audio files are stored permanently until manually cleared. Pre-cache entire
          books before destroying your GPU server to save costs.
        </span>
      </div>
    </div>
  );
};

export default CacheSettings;
