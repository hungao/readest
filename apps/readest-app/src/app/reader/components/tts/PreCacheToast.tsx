import React, { useEffect, useState } from 'react';
import { MdStorage, MdCheckCircle, MdError, MdExpandLess, MdExpandMore } from 'react-icons/md';
import { usePreCacheStore } from '@/store/preCacheStore';
import { useTranslation } from '@/hooks/useTranslation';
import { useBookDataStore } from '@/store/bookDataStore';

interface PreCacheToastProps {
  onExpand?: (bookKey: string) => void;
}

export const PreCacheToast: React.FC<PreCacheToastProps> = ({ onExpand }) => {
  const _ = useTranslation();
  const { activePreCaches, setOpenDialog } = usePreCacheStore();
  const { getBookData } = useBookDataStore();
  const [isMinimized, setIsMinimized] = useState(false);

  // Convert Map to array for rendering
  const activeJobs = Array.from(activePreCaches.entries()).filter(([_, progress]) => {
    return (
      progress.state !== 'idle' &&
      progress.state !== 'completed' &&
      progress.state !== 'cancelled' &&
      progress.state !== 'failed'
    );
  });

  // Don't render if no active jobs
  if (activeJobs.length === 0) {
    return null;
  }

  const handleExpand = (bookKey: string) => {
    if (onExpand) {
      onExpand(bookKey);
    } else {
      setOpenDialog(bookKey);
    }
  };

  const getStateIcon = (state: string) => {
    switch (state) {
      case 'completed':
        return <MdCheckCircle className='text-green-500' size={20} />;
      case 'failed':
      case 'cancelled':
        return <MdError className='text-red-500' size={20} />;
      case 'synthesizing':
      case 'extracting':
      case 'checking':
        return <MdStorage className='text-blue-500 animate-pulse' size={20} />;
      default:
        return <MdStorage className='text-gray-500' size={20} />;
    }
  };

  const getStateColor = (state: string) => {
    switch (state) {
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
    <div className='fixed bottom-0 left-0 right-0 z-50 flex flex-col gap-2 p-2 sm:p-4'>
      {activeJobs.map(([bookKey, progress]) => {
        const bookData = getBookData(bookKey);
        const bookTitle = bookData?.title || 'Unknown Book';

        return (
          <div
            key={bookKey}
            className='bg-base-200/95 backdrop-blur-sm rounded-lg shadow-lg border border-base-300 overflow-hidden'
          >
            {/* Header */}
            <div className='flex items-center gap-3 p-3'>
              {getStateIcon(progress.state)}

              <div className='flex-1 min-w-0'>
                {!isMinimized && (
                  <>
                    <p className='font-medium text-sm truncate'>{bookTitle}</p>
                    <p className='text-xs text-base-content/70'>{progress.message}</p>
                    {progress.total > 0 && (
                      <p className='text-xs text-base-content/60'>
                        {progress.current} / {progress.total} {_('chunks')} ({progress.percentage}
                        %)
                      </p>
                    )}
                  </>
                )}
                {isMinimized && (
                  <div className='flex items-center gap-2'>
                    <p className='font-medium text-sm truncate'>{bookTitle}</p>
                    <span className='text-xs text-base-content/70'>
                      {progress.percentage}%
                    </span>
                  </div>
                )}
              </div>

              <div className='flex items-center gap-1'>
                <button
                  onClick={() => handleExpand(bookKey)}
                  className='btn btn-ghost btn-sm h-8 w-8 min-h-0 p-0'
                  aria-label={_('Expand')}
                  title={_('Open pre-cache dialog')}
                >
                  <MdExpandLess size={20} />
                </button>
                <button
                  onClick={() => setIsMinimized(!isMinimized)}
                  className='btn btn-ghost btn-sm h-8 w-8 min-h-0 p-0'
                  aria-label={isMinimized ? _('Expand') : _('Minimize')}
                >
                  {isMinimized ? <MdExpandMore size={20} /> : <MdExpandLess size={20} />}
                </button>
              </div>
            </div>

            {/* Progress Bar */}
            {!isMinimized && progress.total > 0 && (
              <div className='w-full bg-base-300 h-2'>
                <div
                  className={`h-full ${getStateColor(progress.state)} transition-all duration-300`}
                  style={{ width: `${progress.percentage}%` }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
