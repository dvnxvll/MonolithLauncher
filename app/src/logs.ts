import {
  copyLogButton,
  createInstanceStatus,
  globalStatus,
  logOutput,
  gameLogOutput,
} from './dom';
import { state } from './state';

const timestamp = () => {
  const now = new Date();
  return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

export const appendLauncherLog = (message: string) => {
  if (!message) return;
  const line = `[${timestamp()}] ${message}`;
  state.launcherLogs.push(line);
  if (state.launcherLogs.length > 400) {
    state.launcherLogs = state.launcherLogs.slice(-400);
  }
  if (logOutput) {
    logOutput.textContent = state.launcherLogs.join('\n');
  }
};

export const appendGameLog = (message: string) => {
  if (!message) return;
  const line = `[${timestamp()}] ${message}`;
  state.gameLogs.push(line);
  if (state.gameLogs.length > 400) {
    state.gameLogs = state.gameLogs.slice(-400);
  }
  if (gameLogOutput) {
    gameLogOutput.textContent = state.gameLogs.join('\n');
  }
};

export const appendInstanceLog = (instanceId: string, message: string) => {
  if (!message || !instanceId) return;
  const line = `[${timestamp()}] ${message}`;
  const logs = state.instanceLogs[instanceId] || [];
  logs.push(line);
  if (logs.length > 400) {
    state.instanceLogs[instanceId] = logs.slice(-400);
  } else {
    state.instanceLogs[instanceId] = logs;
  }
  if (state.detailInstanceId === instanceId) {
    const detailLog = document.getElementById('instanceDetailLog');
    if (detailLog) {
      detailLog.textContent = state.instanceLogs[instanceId].join('\n');
    }
  }
};

export const setStatus = (message: string) => {
  if (createInstanceStatus) {
    createInstanceStatus.textContent = message;
  }
  if (globalStatus) {
    globalStatus.textContent = message;
  }
  appendLauncherLog(message);
};

export const resolveActiveLogText = () => {
  const drawer = document.querySelector('.log-drawer');
  if (!drawer) return '';
  const activePanel = drawer.querySelector('.log-panel.is-active');
  const target = activePanel?.querySelector('pre');
  return target?.textContent || '';
};

export const attachCopyLog = () => {
  if (!copyLogButton) return;
  copyLogButton.addEventListener('click', async () => {
    const text = resolveActiveLogText();
    let success = false;

    try {
      await navigator.clipboard.writeText(text);
      success = true;
    } catch (err) {
      const helper = document.createElement('textarea');
      helper.value = text;
      document.body.appendChild(helper);
      helper.select();
      try {
        document.execCommand('copy');
        success = true;
      } catch (fallbackErr) {
        success = false;
      }
      document.body.removeChild(helper);
    }

    copyLogButton.textContent = success ? 'Copied' : 'Copy failed';
    window.setTimeout(() => {
      copyLogButton.textContent = 'Copy';
    }, 1200);
  });
};

let logsBound = false;
export const attachLogActions = () => {
  if (logsBound) return;
  logsBound = true;
  document.addEventListener('click', async (event) => {
    const button = event.target.closest?.('button[data-action="clear-logs"]');
    if (!button) return;
    state.launcherLogs = [];
    state.gameLogs = [];
    if (logOutput) logOutput.textContent = '';
    if (gameLogOutput) gameLogOutput.textContent = '';
    setStatus('Logs cleared.');
  });
};

let logTabsBound = false;
export const attachLogTabs = () => {
  if (logTabsBound) return;
  logTabsBound = true;
  document.addEventListener('click', (event) => {
    const tab = event.target.closest?.('button[data-log-tab]') as HTMLButtonElement | null;
    if (!tab) return;
    const target = tab.getAttribute('data-log-tab');
    if (!target) return;
    document.querySelectorAll<HTMLButtonElement>('button[data-log-tab]').forEach((button) => {
      button.classList.toggle('is-active', button === tab);
    });
    document.querySelectorAll<HTMLElement>('.log-panel').forEach((panel) => {
      panel.classList.toggle('is-active', panel.getAttribute('data-log-panel') === target);
    });
  });
};
