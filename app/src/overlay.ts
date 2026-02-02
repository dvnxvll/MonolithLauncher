import { installOverlay, installMessage, installProgress } from './dom';
import { getListen } from './tauri';
import { setStatus } from './logs';

export const toggleOverlay = (visible: boolean) => {
  if (!installOverlay) return;
  installOverlay.classList.toggle('is-visible', visible);
  installOverlay.setAttribute('aria-hidden', visible ? 'false' : 'true');
};

export const setProgress = (payload: { message?: string; current?: number; total?: number | null }) => {
  if (installMessage) {
    installMessage.textContent = payload.message || 'Working';
  }
  if (installProgress) {
    const progressBar = installProgress.parentElement;
    if (!payload.total || payload.total === 0) {
      progressBar?.classList.add('is-indeterminate');
      installProgress.style.width = '45%';
    } else {
      progressBar?.classList.remove('is-indeterminate');
      const percent = Math.min(100, Math.round((payload.current || 0) / payload.total * 100));
      installProgress.style.width = `${percent}%`;
    }
  }
};

export const attachInstallEvents = () => {
  const listen = getListen();
  if (!listen) return;
  listen('install:progress', (event: any) => {
    const payload = event.payload || {};
    setProgress({
      message: payload.message || 'Working',
      current: payload.current || 0,
      total: payload.total,
    });
  });
  listen('install:done', () => {
    toggleOverlay(false);
    setStatus('Instance created.');
  });
  listen('install:error', () => {
    toggleOverlay(false);
    setStatus('Install failed. Check logs.');
  });

  listen('launch:started', () => {
    setStatus('Game launched.');
    toggleOverlay(false);
  });
  listen('launch:error', () => {
    setStatus('Launch failed. Check logs.');
    toggleOverlay(false);
  });
};
