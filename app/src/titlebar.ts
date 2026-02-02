import { titlebarClose, titlebarMaximize, titlebarMinimize } from './dom';
import { getTauri } from './tauri';
import { setStatus } from './logs';

const getCurrentWindow = () => {
  const tauri = getTauri();
  if (!tauri) return null;
  const windowApi = tauri.window;
  const candidates = [windowApi?.getCurrent, windowApi?.getCurrentWindow].filter(Boolean);
  for (const getter of candidates) {
    try {
      const result = getter();
      if (result && typeof result.then === 'function') {
        continue;
      }
      if (result) return result;
    } catch (err) {
      continue;
    }
  }
  if (windowApi?.appWindow) return windowApi.appWindow;
  if (tauri.appWindow) return tauri.appWindow;
  return null;
};

export const attachTitlebarControls = () => {
  const currentWindow = getCurrentWindow();
  const notAvailable = () => setStatus('Tauri backend not available.');

  if (!currentWindow) {
    titlebarMinimize?.addEventListener('click', notAvailable);
    titlebarMaximize?.addEventListener('click', notAvailable);
    titlebarClose?.addEventListener('click', notAvailable);
    return;
  }

  titlebarMinimize?.addEventListener('click', () => {
    currentWindow.minimize?.();
  });

  titlebarMaximize?.addEventListener('click', async () => {
    if (currentWindow.toggleFullscreen) {
      await currentWindow.toggleFullscreen();
      return;
    }
    if (currentWindow.isFullscreen && currentWindow.setFullscreen) {
      const isFullscreen = await currentWindow.isFullscreen();
      await currentWindow.setFullscreen(!isFullscreen);
      return;
    }
    if (currentWindow.toggleMaximize) {
      await currentWindow.toggleMaximize();
      return;
    }
    if (currentWindow.isMaximized && currentWindow.maximize && currentWindow.unmaximize) {
      const isMaximized = await currentWindow.isMaximized();
      if (isMaximized) {
        await currentWindow.unmaximize();
      } else {
        await currentWindow.maximize();
      }
      return;
    }
    currentWindow.maximize?.();
  });

  titlebarClose?.addEventListener('click', () => {
    currentWindow.close?.();
  });
};
