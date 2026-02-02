import { activateSubpanel, setActivePanel } from './nav';
import { getInvoke } from './tauri';
import { setStatus } from './logs';
import { slugify, state } from './state';
import { loadConfig } from './config';
import { defaultRootSelect, globalJavaPath, globalJavaSelect } from './dom';

let placeholderBound = false;
export const attachPlaceholderActions = () => {
  if (placeholderBound) return;
  placeholderBound = true;
  document.addEventListener('click', async (event) => {
    const button = event.target.closest?.('button[data-action="placeholder"]');
    if (!button) return;
    const label = button.textContent?.trim() || 'Action';
    setStatus(`${label} is not wired yet.`);
  });
};

let subpanelBound = false;
export const attachSubpanelActions = () => {
  if (subpanelBound) return;
  subpanelBound = true;
  document.addEventListener('click', async (event) => {
    const button = event.target.closest?.('button[data-action="subpanel"]');
    if (!button) return;
    const target = button.getAttribute('data-subtarget');
    const panel = button.closest('.panel');
    if (panel && target) {
      activateSubpanel(panel, target);
    }
  });
};

let navigateBound = false;
export const attachNavigateActions = () => {
  if (navigateBound) return;
  navigateBound = true;
  document.addEventListener('click', async (event) => {
    const button = event.target.closest?.('button[data-action="navigate"]');
    if (!button) return;
    const target = button.getAttribute('data-target');
    if (!target) return;
    setActivePanel(target);
    const subtarget = button.getAttribute('data-subtarget');
    if (!subtarget) return;
    const panel = document.querySelector(`.panel[data-section="${target}"]`);
    if (panel) {
      activateSubpanel(panel, subtarget);
    }
  });
};

let miscBound = false;
export const attachMiscActions = () => {
  if (miscBound) return;
  miscBound = true;
  document.addEventListener('click', async (event) => {
    const checkUpdates = event.target.closest?.('button[data-action="check-updates"]');
    if (checkUpdates) {
      setStatus('You are on the latest version.');
    }

    const detectJava = event.target.closest?.('button[data-action="java-detect"]');
    if (detectJava) {
      const invoke = getInvoke();
      if (!invoke || !state.config) return;
      invoke('detect_java').then((result: any) => {
        if (!result) return;
        if (globalJavaPath) {
          globalJavaPath.value = result.path || '';
        }
        if (globalJavaSelect) {
          if (result.version === '21' || result.version === '17') {
            globalJavaSelect.value = result.version;
          } else {
            globalJavaSelect.value = 'auto';
          }
        }
        state.config.settings.java.runtime = state.config.settings.java.runtime || {};
        state.config.settings.java.runtime.path = result.path || null;
        state.config.settings.java.runtime.version =
          result.version === '21' || result.version === '17' ? result.version : null;
        invoke('save_config', { config: state.config }).then(() => {
          loadConfig();
          setStatus('Java runtime detected.');
        });
      });
    }

    const browseJava = event.target.closest?.('button[data-action="java-browse"]');
    if (browseJava) {
      if (globalJavaPath) {
        globalJavaPath.focus();
      }
      setStatus('Paste the Java path, then save changes.');
    }

    const openExternal = event.target.closest?.('button[data-action="open-external"]');
    if (openExternal) {
      const url = openExternal.getAttribute('data-url');
      if (!url) return;
      const invoke = getInvoke();
      if (!invoke) return;
      invoke('open_external', { url }).catch(() => {
        setStatus('Unable to open link.');
      });
    }

    const exportConfig = event.target.closest?.('button[data-action="export-config"]');
    if (exportConfig) {
      const invoke = getInvoke();
      if (!invoke) return;
      invoke('export_config').then((path: string) => {
        if (path) {
          setStatus(`Exported config to ${path}.`);
        } else {
          setStatus('Export complete.');
        }
      });
    }

    const importInstance = event.target.closest?.('button[data-action="instance-import"]');
    if (importInstance && state.config) {
      const path = window.prompt(
        'Instance folder path',
        '/home/voxl/.monolith/instances/example'
      );
      if (!path || !path.trim()) return;
      const name =
        window.prompt(
          'Display name',
          path.trim().split('/').filter(Boolean).pop() || ''
        ) || '';
      if (!name.trim()) return;
      const loader =
        (window
          .prompt('Loader (vanilla/fabric/forge)', 'vanilla')
          ?.trim()
          .toLowerCase() || 'vanilla');
      if (!['vanilla', 'fabric', 'forge'].includes(loader)) {
        setStatus('Invalid loader. Use vanilla, fabric, or forge.');
        return;
      }
      const version = window.prompt('Game version', '1.20.4')?.trim() || '';
      if (!version) return;
      let loaderVersion: string | null = null;
      if (loader !== 'vanilla') {
        loaderVersion = window.prompt('Loader version', '')?.trim() || '';
        if (!loaderVersion) return;
      }

      const roots = state.config.instance_roots || [];
      let rootId = roots.find((root: any) => path.startsWith(root.path))?.id || null;
      if (!rootId) {
        const parent = path.split('/').slice(0, -1).join('/') || path;
        const label = window.prompt('New root label', 'Imported') || 'Imported';
        const base = slugify(label);
        let candidate = base || 'imported';
        let counter = 2;
        const existing = new Set(roots.map((root: any) => root.id));
        while (existing.has(candidate)) {
          candidate = `${base}-${counter}`;
          counter += 1;
        }
        state.config.instance_roots = [
          ...roots,
          { id: candidate, label: label.trim(), path: parent },
        ];
        rootId = candidate;
      }

      const invoke = getInvoke();
      if (!invoke) return;
      await invoke('save_config', { config: state.config });
      await invoke('import_instance', {
        path: path.trim(),
        name: name.trim(),
        version,
        loader,
        loaderVersion,
        showSnapshots: false,
        rootId,
      });
      await loadConfig();
      setStatus('Instance imported.');
    }

    const saveDefault = event.target.closest?.('button[data-action="default-root-save"]');
    if (saveDefault && state.config && defaultRootSelect) {
      const selected = defaultRootSelect.value || null;
      state.config.default_instance_root_id = selected;
      const invoke = getInvoke();
      if (!invoke) return;
      invoke('save_config', { config: state.config }).then(() => {
        loadConfig();
        setStatus('Default instance root updated.');
      });
    }

    const addRoot = event.target.closest?.('button[data-action="root-add"]');
    if (addRoot && state.config) {
      const label = window.prompt('Root label', 'Custom');
      if (!label || !label.trim()) return;
      const path = window.prompt('Root path', '/home/voxl/.monolith/instances-custom');
      if (!path || !path.trim()) return;
      const base = slugify(label);
      let candidate = base || 'root';
      let counter = 2;
      const existing = new Set((state.config.instance_roots || []).map((root: any) => root.id));
      while (existing.has(candidate)) {
        candidate = `${base}-${counter}`;
        counter += 1;
      }
      state.config.instance_roots = [
        ...(state.config.instance_roots || []),
        {
          id: candidate,
          label: label.trim(),
          path: path.trim(),
        },
      ];
      const invoke = getInvoke();
      if (!invoke) return;
      invoke('save_config', { config: state.config }).then(() => {
        loadConfig();
        setStatus('Instance root added.');
      });
    }

    const reindex = event.target.closest?.('button[data-action="root-reindex"]');
    if (reindex) {
      loadConfig();
      setStatus('Instance roots reindexed.');
    }
  });
};
