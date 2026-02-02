import {
  rootSelect,
  defaultRootSelect,
  rootList,
  referenceInstanceSelect,
  syncEnabledToggle,
  syncApplyNewToggle,
  syncResourcepacksToggle,
  syncShaderpacksToggle,
  syncTexturepacksToggle,
  syncServerListToggle,
  themeSelect,
  microsoftClientId,
} from './dom';
import { getInvoke } from './tauri';
import { setStatus } from './logs';
import { setSelectOptions } from './select';
import { state } from './state';
import { refreshInstanceSelect, renderInstances } from './instances';
import { renderAccounts } from './accounts';
import { refreshJavaSettings } from './java';

export const loadConfig = async () => {
  const invoke = getInvoke();
  if (!invoke) return;
  try {
    state.config = await invoke('load_config');
    if (state.config?.instance_roots) {
      const options = state.config.instance_roots.map((root: any) => ({
        value: root.id,
        label: `${root.label} - ${root.path}`,
      }));
      if (rootSelect) {
        setSelectOptions(rootSelect, options, 'Select root');
        if (state.config.default_instance_root_id) {
          rootSelect.value = state.config.default_instance_root_id;
        }
      }
      if (defaultRootSelect) {
        setSelectOptions(defaultRootSelect, options, 'Select default');
        if (state.config.default_instance_root_id) {
          defaultRootSelect.value = state.config.default_instance_root_id;
        }
      }
      if (rootList) {
        rootList.innerHTML = '';
        state.config.instance_roots.forEach((root: any) => {
          const row = document.createElement('div');
          row.className = 'list-row';
          const left = document.createElement('div');
          const title = document.createElement('div');
          title.className = 'list-title';
          title.textContent = root.label;
          const sub = document.createElement('div');
          sub.className = 'list-sub';
          sub.textContent =
            root.id === state.config.default_instance_root_id
              ? 'Default instance root'
              : 'Instance root';
          left.append(title, sub);
          const meta = document.createElement('div');
          meta.className = 'list-meta';
          meta.textContent = root.path;
          row.append(left, meta);
          rootList.append(row);
        });
      }
    }
    refreshInstanceSelect();
    renderInstances();
    renderAccounts();
    if (referenceInstanceSelect) {
      const options = (state.config.instances || []).map((instance: any) => ({
        value: instance.id,
        label: instance.name,
      }));
      setSelectOptions(referenceInstanceSelect, options, 'Select reference');
      if (state.config.settings?.reference_instance_id) {
        referenceInstanceSelect.value = state.config.settings.reference_instance_id;
      }
    }
    if (syncEnabledToggle) {
      syncEnabledToggle.checked = state.config.settings?.pack_sync?.enabled ?? true;
    }
    if (syncApplyNewToggle) {
      syncApplyNewToggle.checked = state.config.settings?.apply_to_new_instances ?? true;
    }
    if (syncResourcepacksToggle) {
      syncResourcepacksToggle.checked = state.config.settings?.pack_sync?.resourcepacks ?? true;
    }
    if (syncShaderpacksToggle) {
      syncShaderpacksToggle.checked = state.config.settings?.pack_sync?.shaderpacks ?? false;
    }
    if (syncTexturepacksToggle) {
      syncTexturepacksToggle.checked = state.config.settings?.pack_sync?.texturepacks ?? true;
    }
    if (syncServerListToggle) {
      syncServerListToggle.checked = state.config.settings?.pack_sync?.server_list ?? true;
    }
    if (themeSelect) {
      const themeValue = state.config.settings?.theme || 'dark';
      themeSelect.value = themeValue;
      document.body.dataset.theme = themeValue;
    }
    if (microsoftClientId) {
      microsoftClientId.value = state.config.settings?.microsoft_client_id || '';
    }
    refreshJavaSettings();
  } catch (err) {
    setStatus('Failed to load config.');
  }
};
