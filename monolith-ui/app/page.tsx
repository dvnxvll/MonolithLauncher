'use client';

import { useEffect, useState } from 'react';
import Sidebar from '@/components/sidebar';
import Overview from '@/components/overview';
import Account from '@/components/account';
import Settings from '@/components/settings';
import Titlebar from '@/components/titlebar';
import { LauncherProvider } from '@/components/launcher-provider';
import { Toaster } from '@/components/ui/toaster';
import InstallOverlay from '@/components/install-overlay';

export default function Home() {
  const [currentPage, setCurrentPage] = useState('overview');
  const useNativeTitlebar = process.env.NEXT_PUBLIC_USE_NATIVE_TITLEBAR === '1';

  useEffect(() => {
    const disableContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };
    document.addEventListener('contextmenu', disableContextMenu);
    return () => {
      document.removeEventListener('contextmenu', disableContextMenu);
    };
  }, []);

  return (
    <LauncherProvider>
      <div className="flex h-full flex-col bg-background text-foreground dark">
        {useNativeTitlebar ? null : <Titlebar />}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <Sidebar currentPage={currentPage} setCurrentPage={setCurrentPage} />
          <main className="flex-1 min-h-0 overflow-hidden flex flex-col">
            {currentPage === 'overview' && <Overview />}
            {currentPage === 'account' && <Account />}
            {currentPage === 'settings' && <Settings />}
          </main>
        </div>
        <InstallOverlay />
        <Toaster />
      </div>
    </LauncherProvider>
  );
}
