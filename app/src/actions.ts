import {
  loaderSelect,
  loaderVersionSelect,
  gameVersionSelect,
  snapshotsToggle,
  refreshVersionsButton,
  createInstanceButton,
  instanceNameInput,
  rootSelect,
  playButton,
  instanceSelect,
  instanceJavaSelect,
  applyJavaOverrideButton,
  clearJavaOverrideButton,
  instanceJavaVersion,
  instanceJavaPath,
  saveSettingsButton,
  globalJavaSelect,
  globalJavaPath,
  minRamInput,
  maxRamInput,
  jvmArgsInput,
  referenceInstanceSelect,
  syncApplyNewToggle,
  syncEnabledToggle,
  syncResourcepacksToggle,
  syncShaderpacksToggle,
  syncTexturepacksToggle,
  syncServerListToggle,
  themeSelect,
  instanceCreateModal,
  microsoftClientId,
} from './dom';
import { getInvoke } from './tauri';
import { setStatus } from './logs';
import { state, loaderLabels } from './state';
import { refreshVersions } from './versions';
import { toggleOverlay, setProgress } from './overlay';
import { loadConfig } from './config';
import { resolveInstanceId, resolvePlayerName } from './instances';
import { refreshJavaSettings } from './java';

export const attachListeners = () => {
  loaderSelect?.addEventListener('change', async () => {
    const loader = loaderSelect.value;
    if (loaderVersionSelect) {
      loaderVersionSelect.disabled = loader === 'vanilla';
    }
    await refreshVersions();
  });

  gameVersionSelect?.addEventListener('change', async () => {
    await refreshVersions();
  });

  snapshotsToggle?.addEventListener('change', async () => {
    await refreshVersions();
  });

  themeSelect?.addEventListener('change', () => {
    document.body.dataset.theme = themeSelect.value || 'dark';
  });

  refreshVersionsButton?.addEventListener('click', async () => {
    await refreshVersions();
  });

  createInstanceButton?.addEventListener('click', async () => {
    const invoke = getInvoke();
    if (!invoke || state.isInstalling) return;
    const name = instanceNameInput?.value?.trim() || '';
    const loader = loaderSelect?.value || '';
    const gameVersion = gameVersionSelect?.value || '';
    const loaderVersion = loader === 'vanilla' ? null : loaderVersionSelect?.value || null;

    if (!name || !gameVersion || (loader !== 'vanilla' && !loaderVersion)) {
      setStatus('Fill in name, version, and loader.');
      return;
    }

    const request = {
      name,
      game_version: gameVersion,
      loader,
      loader_version: loaderVersion,
      show_snapshots: snapshotsToggle?.checked ?? false,
      root_id: rootSelect?.value || null,
    };

    try {
      state.isInstalling = true;
      toggleOverlay(true);
      setProgress({
        message: `Starting ${loaderLabels[loader]} install`,
        current: 0,
        total: null,
      });
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
      await invoke('create_instance', { request });
      setStatus('Instance created.');
      if (instanceCreateModal) {
        instanceCreateModal.classList.remove('is-visible');
        instanceCreateModal.setAttribute('aria-hidden', 'true');
      }
      if (instanceNameInput) {
        instanceNameInput.value = '';
      }
      await loadConfig();
    } catch (err: any) {
      const message = err?.toString?.() || 'Install failed. Check logs.';
      setStatus(message);
    } finally {
      state.isInstalling = false;
      toggleOverlay(false);
    }
  });

  playButton?.addEventListener('click', async () => {
    const invoke = getInvoke();
    if (!invoke || state.isInstalling) return;
    const instanceId = resolveInstanceId();
    if (!instanceId) {
      setStatus('No instance available.');
      return;
    }
    try {
      toggleOverlay(true);
      setProgress({
        message: 'Preparing launch',
        current: 0,
        total: null,
      });
      setStatus('Launching instance.');
      await invoke('launch_instance', {
        instanceId,
        playerName: resolvePlayerName(),
      });
    } catch (err: any) {
      const message = err?.toString?.() || 'Launch failed. Check logs.';
      setStatus(message);
      toggleOverlay(false);
    }
  });

  instanceSelect?.addEventListener('change', () => {
    state.selectedInstanceId = instanceSelect.value || null;
  });

  instanceJavaSelect?.addEventListener('change', () => {
    refreshJavaSettings();
  });

  applyJavaOverrideButton?.addEventListener('click', async () => {
    const invoke = getInvoke();
    if (!invoke || !state.config || !instanceJavaSelect) return;
    const instanceId = instanceJavaSelect.value;
    if (!instanceId) {
      setStatus('Select an instance first.');
      return;
    }
    const overrides = state.config.settings.java.overrides || [];
    const nextOverrides = overrides.filter((item: any) => item.instance_id !== instanceId);
    const versionValue = instanceJavaVersion?.value || 'inherit';
    const pathValue = instanceJavaPath?.value?.trim() || '';
    if (versionValue !== 'inherit' || pathValue) {
      nextOverrides.push({
        instance_id: instanceId,
        version: versionValue === 'inherit' ? null : versionValue,
        path: pathValue || null,
      });
    }
    state.config.settings.java.overrides = nextOverrides;
    await invoke('save_config', { config: state.config });
    setStatus('Java override saved.');
  });

  clearJavaOverrideButton?.addEventListener('click', async () => {
    const invoke = getInvoke();
    if (!invoke || !state.config || !instanceJavaSelect) return;
    const instanceId = instanceJavaSelect.value;
    if (!instanceId) return;
    state.config.settings.java.overrides = (state.config.settings.java.overrides || []).filter(
      (item: any) => item.instance_id !== instanceId
    );
    await invoke('save_config', { config: state.config });
    refreshJavaSettings();
    setStatus('Java override cleared.');
  });

  saveSettingsButton?.addEventListener('click', async () => {
    const invoke = getInvoke();
    if (!invoke || !state.config) return;
    const java = state.config.settings.java;
    if (globalJavaSelect) {
      java.runtime = java.runtime || {};
      java.runtime.version = globalJavaSelect.value === 'auto' ? null : globalJavaSelect.value;
    }
    if (globalJavaPath) {
      java.runtime.path = globalJavaPath.value.trim() || null;
    }
    if (minRamInput) {
      java.min_ram_gb = Number(minRamInput.value) || java.min_ram_gb;
    }
    if (maxRamInput) {
      java.max_ram_gb = Number(maxRamInput.value) || java.max_ram_gb;
    }
    if (jvmArgsInput) {
      java.jvm_args = jvmArgsInput.value.trim();
    }
    state.config.settings.java = java;
    if (themeSelect) {
      state.config.settings.theme = themeSelect.value || 'dark';
      document.body.dataset.theme = state.config.settings.theme;
    }
    if (microsoftClientId) {
      state.config.settings.microsoft_client_id = microsoftClientId.value.trim();
    }
    if (referenceInstanceSelect) {
      state.config.settings.reference_instance_id = referenceInstanceSelect.value || null;
    }
    state.config.settings.apply_to_new_instances = syncApplyNewToggle?.checked ?? true;
    state.config.settings.pack_sync = {
      enabled: syncEnabledToggle?.checked ?? true,
      resourcepacks: syncResourcepacksToggle?.checked ?? true,
      shaderpacks: syncShaderpacksToggle?.checked ?? false,
      texturepacks: syncTexturepacksToggle?.checked ?? true,
      server_list: syncServerListToggle?.checked ?? true,
    };
    await invoke('save_config', { config: state.config });
    refreshJavaSettings();
    setStatus('Settings saved.');
  });
};
