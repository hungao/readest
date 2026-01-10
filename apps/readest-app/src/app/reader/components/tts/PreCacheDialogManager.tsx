import React, { useEffect, useState } from 'react';
import { PreCacheDialog } from './PreCacheDialog';
import { usePreCacheStore } from '@/store/preCacheStore';
import { useReaderStore } from '@/store/readerStore';
import { FoliateView } from '@/types/view';

/**
 * Global manager for PreCacheDialog
 * Listens to global store state and opens dialog when requested
 */
export const PreCacheDialogManager: React.FC = () => {
  const { openDialogBookKey, setOpenDialog } = usePreCacheStore();
  const { getView } = useReaderStore();
  const [view, setView] = useState<FoliateView | undefined>(undefined);

  useEffect(() => {
    if (openDialogBookKey) {
      const bookView = getView(openDialogBookKey);
      setView(bookView);
    }
  }, [openDialogBookKey, getView]);

  if (!openDialogBookKey || !view) {
    return null;
  }

  return (
    <PreCacheDialog
      isOpen={true}
      onClose={() => setOpenDialog(null)}
      view={view}
      bookKey={openDialogBookKey}
    />
  );
};
