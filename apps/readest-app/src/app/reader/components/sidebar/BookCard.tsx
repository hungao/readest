import clsx from 'clsx';
import React, { useRef, useState, useEffect } from 'react';
import { MdInfoOutline, MdStorage } from 'react-icons/md';
import { Book } from '@/types/book';
import { useThemeStore } from '@/store/themeStore';
import { useTranslation } from '@/hooks/useTranslation';
import { eventDispatcher } from '@/utils/event';
import { useResponsiveSize } from '@/hooks/useResponsiveSize';
import { formatAuthors, formatTitle } from '@/utils/book';
import BookCover from '@/components/BookCover';
import { usePreCacheStore } from '@/store/preCacheStore';

interface BookCardProps {
  book: Book;
  bookKey?: string;
}

const BookCard = ({ book, bookKey }: BookCardProps) => {
  const { title, author } = book;
  const _ = useTranslation();
  const { isDarkMode } = useThemeStore();
  const iconSize18 = useResponsiveSize(18);
  const bookCoverRef = useRef<HTMLDivElement | null>(null);

  const { setOpenDialog, getPreCacheProgress, getBookCacheStatus, setBookCacheStatus } =
    usePreCacheStore();
  const [cachePercentage, setCachePercentage] = useState<number>(0);
  const [isLoadingCache, setIsLoadingCache] = useState(false);

  // Fetch cache status on mount and when bookKey changes
  useEffect(() => {
    if (!bookKey) return;

    const fetchCacheStatus = async () => {
      setIsLoadingCache(true);
      try {
        const response = await fetch(`/api/tts/vieneu/book-status?bookKey=${bookKey}`);
        if (response.ok) {
          const data = await response.json();
          if (data.cachedCount > 0) {
            // Store in global state
            setBookCacheStatus(bookKey, {
              bookKey,
              cachedCount: data.cachedCount,
              totalCount: data.cachedCount, // We don't know total yet
              percentage: 0, // Will be calculated during pre-cache
              lastUpdated: data.lastUpdated,
            });
            // For now, show a simple indicator that cache exists
            setCachePercentage(data.cachedCount > 0 ? 1 : 0);
          }
        }
      } catch (error) {
        console.error('Failed to fetch cache status:', error);
      } finally {
        setIsLoadingCache(false);
      }
    };

    fetchCacheStatus();
  }, [bookKey, setBookCacheStatus]);

  // Update cache percentage from active pre-cache progress
  useEffect(() => {
    if (!bookKey) return;

    const interval = setInterval(() => {
      const progress = getPreCacheProgress(bookKey);
      if (progress && progress.total > 0) {
        setCachePercentage(progress.percentage);
      }
    }, 500);

    return () => clearInterval(interval);
  }, [bookKey, getPreCacheProgress]);

  const showBookDetails = () => {
    eventDispatcher.dispatchSync('show-book-details', book);
  };

  const openPreCacheDialog = () => {
    if (bookKey) {
      setOpenDialog(bookKey);
    }
  };

  return (
    <div className='flex h-20 w-full items-center'>
      <div
        ref={bookCoverRef}
        className={clsx(
          'me-4 aspect-[28/41] max-h-16 w-[15%] max-w-12 overflow-hidden rounded-sm shadow-md',
          isDarkMode ? 'mix-blend-screen' : 'mix-blend-multiply',
        )}
      >
        <BookCover
          book={book}
          mode='list'
          coverFit='crop'
          imageClassName='rounded-sm'
          onImageError={() => (bookCoverRef.current!.style.display = 'none')}
        />
      </div>
      <div className='min-w-0 flex-1'>
        <h4 className='line-clamp-2 w-[90%] text-sm font-semibold'>{formatTitle(title)}</h4>
        <p className='truncate text-xs opacity-75'>{formatAuthors(author)}</p>
      </div>
      <div className='flex items-center gap-1'>
        {/* Pre-Cache Button - Only show if bookKey is provided */}
        {bookKey && (
          <button
            className='btn btn-ghost hover:bg-base-300 relative h-6 min-h-6 w-6 rounded-full p-0 transition-colors'
            aria-label={_('Pre-Cache Book Audio')}
            onClick={openPreCacheDialog}
            disabled={isLoadingCache}
          >
            <MdStorage
              size={iconSize18}
              className={clsx('fill-base-content', {
                'opacity-50': isLoadingCache,
                'text-primary': cachePercentage > 0,
              })}
            />
            {/* Cache percentage badge */}
            {cachePercentage > 0 && (
              <span
                className='absolute -bottom-0.5 -right-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-primary text-[8px] font-bold text-primary-content'
                style={{ fontSize: '7px', lineHeight: '1' }}
              >
                {cachePercentage >= 100 ? '✓' : cachePercentage}
              </span>
            )}
          </button>
        )}
        <button
          className='btn btn-ghost hover:bg-base-300 h-6 min-h-6 w-6 rounded-full p-0 transition-colors'
          aria-label={_('More Info')}
          onClick={showBookDetails}
        >
          <MdInfoOutline size={iconSize18} className='fill-base-content' />
        </button>
      </div>
    </div>
  );
};

export default BookCard;
