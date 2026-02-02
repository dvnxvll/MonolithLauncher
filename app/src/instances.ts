import {
  activeInstanceDirectory,
  activeInstanceMeta,
  activeInstanceName,
  activeInstanceTag,
  instanceJavaSelect,
  instanceSelect,
  instancesGrid,
  overviewInstanceList,
  instancesListView,
  instanceDetailView,
  instanceDetailName,
  instanceDetailMeta,
  instanceDetailLog,
  instanceMemoryGraph,
  instanceMemoryLabel,
  modsTable,
  resourcepacksTable,
  shadersTable,
  texturepacksTable,
  serversTable,
  worldsTable,
  modsSummary,
  resourcepacksSummary,
  shadersSummary,
  texturepacksSummary,
  instanceMinRam,
  instanceMaxRam,
  instanceJvmArgs,
  instanceDeleteModal,
  instanceDeleteInput,
  instanceDeleteConfirm,
  instanceDeletePrompt,
  logDrawer,
} from './dom';
import { getInvoke } from './tauri';
import { appendInstanceLog, setStatus } from './logs';
import { state, resolveLoaderLabel } from './state';
import { setSelectOptions } from './select';
import { loadConfig } from './config';
import { toggleOverlay, setProgress } from './overlay';

export const resolvePlayerName = () => {
  const activeId = state.config?.active_account_id;
  if (activeId && state.config?.accounts) {
    const account = state.config.accounts.find((item: any) => item.id === activeId);
    if (account?.display_name) {
      return account.display_name;
    }
  }
  return 'Player';
};

export const resolveInstanceId = () => {
  if (state.selectedInstanceId) {
    return state.selectedInstanceId;
  }
  if (state.config?.settings?.reference_instance_id) {
    return state.config.settings.reference_instance_id;
  }
  return state.config?.instances?.[0]?.id || null;
};

const showInstanceDetail = (visible: boolean) => {
  if (!instanceDetailView) return;
  instanceDetailView.classList.toggle('is-active', visible);
  instanceDetailView.setAttribute('aria-hidden', visible ? 'false' : 'true');
  if (instancesListView) {
    instancesListView.style.display = visible ? 'none' : '';
  }
};

const setActiveInstanceTab = (tab: string) => {
  document.querySelectorAll<HTMLButtonElement>('.instance-tab').forEach((button) => {
    button.classList.toggle('is-active', button.getAttribute('data-instance-tab') === tab);
  });
  document.querySelectorAll<HTMLElement>('.instance-panel').forEach((panel) => {
    panel.classList.toggle('is-active', panel.getAttribute('data-instance-panel') === tab);
  });
};

const renderInstanceLog = (instanceId: string) => {
  if (!instanceDetailLog) return;
  const logs = state.instanceLogs[instanceId] || [];
  instanceDetailLog.textContent = logs.join('\n');
};

const buildTable = (
  container: HTMLElement | null,
  entries: any[],
  kind: string,
  withToggle: boolean
) => {
  if (!container) return;
  container.innerHTML = '';
  const header = document.createElement('div');
  header.className = 'instance-table-header';
  header.innerHTML = `<div>Name</div><div>Version</div><div>${withToggle ? 'Enabled' : 'Info'}</div>`;
  container.appendChild(header);

  if (!entries.length) {
    const empty = document.createElement('div');
    empty.className = 'instance-table-row';
    empty.innerHTML = '<div class="cell-muted">No items found</div><div></div><div></div>';
    container.appendChild(empty);
    return;
  }

  entries.forEach((entry) => {
    const row = document.createElement('div');
    row.className = 'instance-table-row';
    const name = document.createElement('div');
    name.textContent = entry.name;
    const version = document.createElement('div');
    version.textContent = entry.version || '—';
    const cell = document.createElement('div');
    if (withToggle) {
      const toggle = document.createElement('label');
      toggle.className = 'switch';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = Boolean(entry.enabled);
      input.setAttribute('data-action', 'toggle-pack');
      input.setAttribute('data-pack-kind', kind);
      input.setAttribute('data-pack-file', entry.filename);
      toggle.appendChild(input);
      const track = document.createElement('span');
      track.className = 'track';
      toggle.appendChild(track);
      cell.appendChild(toggle);
    } else {
      cell.textContent = entry.info || '—';
      cell.className = 'cell-muted';
    }
    row.append(name, version, cell);
    container.appendChild(row);
  });
};

const loadMods = async (instanceId: string) => {
  const invoke = getInvoke();
  if (!invoke) return;
  try {
    const mods = await invoke('list_instance_mods', { instanceId });
    buildTable(modsTable, mods || [], 'mods', true);
    const enabled = (mods || []).filter((mod: any) => mod.enabled).length;
    if (modsSummary) {
      modsSummary.textContent = `${enabled} enabled`;
    }
  } catch (err) {
    setStatus(err?.toString?.() || 'Failed to load mods.');
  }
};

const loadPacks = async (instanceId: string, kind: string, summaryEl: HTMLElement | null, table: HTMLElement | null) => {
  const invoke = getInvoke();
  if (!invoke) return;
  try {
    const packs = await invoke('list_instance_packs', { instanceId, kind });
    buildTable(table, packs || [], kind, true);
    const enabled = (packs || []).filter((pack: any) => pack.enabled).length;
    if (summaryEl) {
      summaryEl.textContent = `${enabled} enabled`;
    }
  } catch (err) {
    setStatus(err?.toString?.() || 'Failed to load packs.');
  }
};

const loadWorlds = async (instanceId: string) => {
  const invoke = getInvoke();
  if (!invoke) return;
  try {
    const worlds = await invoke('list_instance_worlds', { instanceId });
    buildTable(worldsTable, worlds || [], 'worlds', false);
  } catch (err) {
    setStatus(err?.toString?.() || 'Failed to load worlds.');
  }
};

const loadServers = async (instanceId: string) => {
  const invoke = getInvoke();
  if (!invoke) return;
  try {
    const servers = await invoke('list_instance_servers', { instanceId });
    buildTable(serversTable, servers || [], 'servers', false);
  } catch (err) {
    setStatus(err?.toString?.() || 'Failed to load servers.');
  }
};

const updateMemoryGraph = (instanceId: string, value: number | null) => {
  if (!instanceMemoryGraph || !instanceMemoryLabel) return;
  const history = state.instanceMetrics[instanceId] || [];
  if (value !== null) {
    history.push(value);
    if (history.length > 60) {
      history.splice(0, history.length - 60);
    }
    state.instanceMetrics[instanceId] = history;
  }
  const targetWidth = instanceMemoryGraph.clientWidth || instanceMemoryGraph.width;
  if (targetWidth && instanceMemoryGraph.width !== targetWidth) {
    instanceMemoryGraph.width = targetWidth;
  }
  const ctx = instanceMemoryGraph.getContext('2d');
  if (!ctx) return;
  const width = instanceMemoryGraph.width;
  const height = instanceMemoryGraph.height;
  ctx.clearRect(0, 0, width, height);
  ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--text-1').trim();
  ctx.lineWidth = 2;
  if (history.length > 1) {
    const max = Math.max(...history, 1);
    ctx.beginPath();
    history.forEach((point, idx) => {
      const x = (idx / (history.length - 1)) * width;
      const y = height - (point / max) * (height - 8) - 4;
      if (idx === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();
    instanceMemoryLabel.textContent = `${history[history.length - 1].toFixed(1)} MB used`;
  } else {
    instanceMemoryLabel.textContent = 'Waiting for telemetry…';
  }
};

const startMemoryPoll = (instanceId: string) => {
  const invoke = getInvoke();
  if (!invoke) return;
  if (state.metricsIntervalId) {
    window.clearInterval(state.metricsIntervalId);
    state.metricsIntervalId = null;
  }
  state.metricsIntervalId = window.setInterval(async () => {
    if (state.detailInstanceId !== instanceId) return;
    try {
      const metrics = await invoke('get_instance_metrics', { instanceId });
      if (metrics && typeof metrics.rss_mb === 'number') {
        updateMemoryGraph(instanceId, metrics.rss_mb);
      } else {
        updateMemoryGraph(instanceId, null);
      }
    } catch {
      updateMemoryGraph(instanceId, null);
    }
  }, 1000);
};

const openInstanceDetail = async (instanceId: string) => {
  const instance = state.config?.instances?.find((item: any) => item.id === instanceId);
  if (!instance) return;
  state.detailInstanceId = instanceId;
  if (instanceDetailName) {
    instanceDetailName.textContent = instance.name;
  }
  if (instanceDetailMeta) {
    instanceDetailMeta.textContent = `${resolveLoaderLabel(instance.loader)} ${instance.version}`;
  }
  if (instanceMinRam) {
    instanceMinRam.value = instance.java_min_ram_gb || '';
  }
  if (instanceMaxRam) {
    instanceMaxRam.value = instance.java_max_ram_gb || '';
  }
  if (instanceJvmArgs) {
    instanceJvmArgs.value = instance.jvm_args || '';
  }
  renderInstanceLog(instanceId);
  await loadMods(instanceId);
  await loadPacks(instanceId, 'resourcepacks', resourcepacksSummary, resourcepacksTable);
  await loadPacks(instanceId, 'shaderpacks', shadersSummary, shadersTable);
  await loadPacks(instanceId, 'texturepacks', texturepacksSummary, texturepacksTable);
  await loadWorlds(instanceId);
  await loadServers(instanceId);
  showInstanceDetail(true);
  setActiveInstanceTab('overview');
  startMemoryPoll(instanceId);
};

const closeInstanceDetail = () => {
  showInstanceDetail(false);
  state.detailInstanceId = null;
  if (state.metricsIntervalId) {
    window.clearInterval(state.metricsIntervalId);
    state.metricsIntervalId = null;
  }
};

export const refreshInstanceSelect = () => {
  if (!state.config?.instances) return;
  const options = state.config.instances.map((instance: any) => ({
    value: instance.id,
    label: instance.name,
  }));
  if (instanceSelect) {
    setSelectOptions(instanceSelect, options, 'Select instance');
    const preferred =
      state.selectedInstanceId ||
      state.config?.settings?.reference_instance_id ||
      state.config?.instances?.[0]?.id ||
      '';
    if (preferred) {
      instanceSelect.value = preferred;
    }
    state.selectedInstanceId = instanceSelect.value || preferred || null;
  }
  if (instanceJavaSelect) {
    setSelectOptions(instanceJavaSelect, options, 'Select instance');
    const preferred =
      state.selectedInstanceId ||
      state.config?.settings?.reference_instance_id ||
      state.config?.instances?.[0]?.id ||
      '';
    if (preferred) {
      instanceJavaSelect.value = preferred;
    }
  }
};

export const renderInstances = () => {
  const instances = state.config?.instances || [];
  const activeId = resolveInstanceId();
  const activeInstance =
    instances.find((instance: any) => instance.id === activeId) || instances[0] || null;

  if (activeInstanceName) {
    activeInstanceName.textContent = activeInstance?.name || 'No instances yet';
  }
  if (activeInstanceMeta) {
    if (activeInstance) {
      const loaderLabel = resolveLoaderLabel(activeInstance.loader);
      const snapshotLabel = activeInstance.show_snapshots ? 'snapshots enabled' : 'snapshots off';
      activeInstanceMeta.textContent = `${loaderLabel} ${activeInstance.version}, ${snapshotLabel}`;
    } else {
      activeInstanceMeta.textContent = 'Create an instance to get started.';
    }
  }
  if (activeInstanceDirectory) {
    activeInstanceDirectory.textContent = activeInstance?.directory || '—';
  }
  if (activeInstanceTag) {
    activeInstanceTag.textContent = activeInstance ? 'Ready' : 'Empty';
  }

  if (overviewInstanceList) {
    overviewInstanceList.innerHTML = '';
    if (!instances.length) {
      const row = document.createElement('div');
      row.className = 'list-row';
      const title = document.createElement('div');
      title.className = 'list-title';
      title.textContent = 'No instances yet';
      const sub = document.createElement('div');
      sub.className = 'list-sub';
      sub.textContent = 'Create a new instance to see it here.';
      const left = document.createElement('div');
      left.append(title, sub);
      row.append(left);
      overviewInstanceList.append(row);
    } else {
      instances.slice(0, 3).forEach((instance: any) => {
        const row = document.createElement('div');
        row.className = 'list-row';
        const left = document.createElement('div');
        const title = document.createElement('div');
        title.className = 'list-title';
        title.textContent = instance.name;
        const sub = document.createElement('div');
        sub.className = 'list-sub';
        sub.textContent = `${resolveLoaderLabel(instance.loader)} ${instance.version}`;
        left.append(title, sub);
        const meta = document.createElement('div');
        meta.className = 'list-meta';
        meta.textContent = instance.directory;
        row.append(left, meta);
        overviewInstanceList.append(row);
      });
    }
  }

  if (instancesGrid) {
    instancesGrid.innerHTML = '';
    if (!instances.length) {
      const emptyCard = document.createElement('article');
      emptyCard.className = 'card instance-card';
      const header = document.createElement('div');
      header.className = 'card-header';
      const title = document.createElement('h3');
      title.textContent = 'No instances yet';
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = 'Empty';
      header.append(title, tag);
      const body = document.createElement('div');
      body.className = 'card-body';
      const message = document.createElement('div');
      message.className = 'metric-label';
      message.textContent = 'Create a new instance to get started.';
      body.append(message);
      emptyCard.append(header, body);
      instancesGrid.append(emptyCard);
      return;
    }

    instances.forEach((instance: any) => {
      const card = document.createElement('article');
      card.className = 'card instance-card';
      const header = document.createElement('div');
      header.className = 'card-header';
      const title = document.createElement('h3');
      title.textContent = instance.name;
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent =
        instance.id === activeId ? 'Active' : resolveLoaderLabel(instance.loader);
      header.append(title, tag);

      const body = document.createElement('div');
      body.className = 'card-body';

      const loaderRow = document.createElement('div');
      loaderRow.className = 'meta-row';
      const loaderLabel = document.createElement('span');
      loaderLabel.className = 'meta-label';
      loaderLabel.textContent = 'Loader';
      const loaderValue = document.createElement('span');
      loaderValue.className = 'meta-value';
      loaderValue.textContent = resolveLoaderLabel(instance.loader);
      loaderRow.append(loaderLabel, loaderValue);

      const snapshotsRow = document.createElement('div');
      snapshotsRow.className = 'meta-row';
      const snapshotsLabel = document.createElement('span');
      snapshotsLabel.className = 'meta-label';
      snapshotsLabel.textContent = 'Snapshots';
      const snapshotsValue = document.createElement('span');
      snapshotsValue.className = 'meta-value';
      snapshotsValue.textContent = instance.show_snapshots ? 'Enabled' : 'Disabled';
      snapshotsRow.append(snapshotsLabel, snapshotsValue);

      const directoryRow = document.createElement('div');
      directoryRow.className = 'meta-row';
      const directoryLabel = document.createElement('span');
      directoryLabel.className = 'meta-label';
      directoryLabel.textContent = 'Directory';
      const directoryValue = document.createElement('span');
      directoryValue.className = 'meta-value';
      directoryValue.textContent = instance.directory;
      directoryRow.append(directoryLabel, directoryValue);

      const actions = document.createElement('div');
      actions.className = 'actions-row';
      const openButton = document.createElement('button');
      openButton.className = 'secondary';
      openButton.textContent = 'Open';
      openButton.setAttribute('data-action', 'instance-open-detail');
      openButton.setAttribute('data-instance-id', instance.id);
      const openFolder = document.createElement('button');
      openFolder.className = 'ghost';
      openFolder.textContent = 'Open folder';
      openFolder.setAttribute('data-action', 'instance-open');
      openFolder.setAttribute('data-instance-id', instance.id);
      const editButton = document.createElement('button');
      editButton.className = 'ghost';
      editButton.textContent = 'Edit';
      editButton.setAttribute('data-action', 'instance-edit');
      editButton.setAttribute('data-instance-id', instance.id);
      actions.append(openButton, openFolder, editButton);

      body.append(loaderRow, snapshotsRow, directoryRow, actions);
      card.append(header, body);
      instancesGrid.append(card);
    });
  }
};

let instanceBound = false;
export const attachInstanceActions = () => {
  if (instanceBound) return;
  instanceBound = true;
  document.addEventListener('click', async (event) => {
    const openCreateModal = event.target.closest?.('button[data-action="open-create-modal"]');
    if (openCreateModal) {
      const modal = document.getElementById('instanceCreateModal');
      if (modal) {
        modal.classList.add('is-visible');
        modal.setAttribute('aria-hidden', 'false');
      }
    }

    const closeCreateModal = event.target.closest?.('[data-action="close-create-modal"]');
    if (closeCreateModal) {
      const modal = document.getElementById('instanceCreateModal');
      if (modal) {
        modal.classList.remove('is-visible');
        modal.setAttribute('aria-hidden', 'true');
      }
    }

    const back = event.target.closest?.('[data-action="instance-back"]');
    if (back) {
      closeInstanceDetail();
    }

    const openDetail = event.target.closest?.('[data-action="instance-open-detail"]');
    if (openDetail) {
      const instanceId = openDetail.getAttribute('data-instance-id');
      if (instanceId) {
        await openInstanceDetail(instanceId);
      }
    }

    const openPath = event.target.closest?.('[data-action="instance-open-paths"]');
    if (openPath) {
      const instanceId = state.detailInstanceId;
      if (!instanceId) return;
      const invoke = getInvoke();
      if (!invoke) return;
      await invoke('open_instance_folder', { instanceId });
    }

    const openFolder = event.target.closest?.('[data-action="instance-open-folder"]');
    if (openFolder) {
      const instanceId = state.detailInstanceId || resolveInstanceId();
      if (!instanceId) return;
      const invoke = getInvoke();
      if (!invoke) return;
      await invoke('open_instance_folder', { instanceId });
    }

    const openResourcepacks = event.target.closest?.('[data-action="instance-open-resourcepacks"]');
    if (openResourcepacks) {
      const instanceId = state.detailInstanceId;
      if (!instanceId) return;
      const invoke = getInvoke();
      if (!invoke) return;
      await invoke('open_instance_path', { instanceId, kind: 'resourcepacks' });
    }

    const openShaderpacks = event.target.closest?.('[data-action="instance-open-shaderpacks"]');
    if (openShaderpacks) {
      const instanceId = state.detailInstanceId;
      if (!instanceId) return;
      const invoke = getInvoke();
      if (!invoke) return;
      await invoke('open_instance_path', { instanceId, kind: 'shaderpacks' });
    }

    const openTexturepacks = event.target.closest?.('[data-action="instance-open-texturepacks"]');
    if (openTexturepacks) {
      const instanceId = state.detailInstanceId;
      if (!instanceId) return;
      const invoke = getInvoke();
      if (!invoke) return;
      await invoke('open_instance_path', { instanceId, kind: 'texturepacks' });
    }

    const openLogDrawer = event.target.closest?.('[data-action="open-log-drawer"]');
    if (openLogDrawer && logDrawer) {
      logDrawer.classList.add('is-open');
      logDrawer.setAttribute('aria-hidden', 'false');
    }

    const closeLogDrawer = event.target.closest?.('[data-action="close-log-drawer"]');
    if (closeLogDrawer && logDrawer) {
      logDrawer.classList.remove('is-open');
      logDrawer.setAttribute('aria-hidden', 'true');
    }

    const startInstance = event.target.closest?.('[data-action="instance-start"]');
    if (startInstance) {
      const instanceId = state.detailInstanceId || resolveInstanceId();
      if (!instanceId) return;
      const invoke = getInvoke();
      if (!invoke) return;
      try {
        toggleOverlay(true);
        setProgress({ message: 'Preparing launch', current: 0, total: null });
        appendInstanceLog(instanceId, 'Launching instance.');
        await invoke('launch_instance', { instanceId, playerName: resolvePlayerName() });
        setStatus('Launch requested.');
      } catch (err: any) {
        const message = err?.toString?.() || 'Launch failed.';
        appendInstanceLog(instanceId, message);
        setStatus(message);
        toggleOverlay(false);
      } finally {
        renderInstanceLog(instanceId);
      }
      return;
    }

    const stopInstance = event.target.closest?.('[data-action="instance-stop"]');
    if (stopInstance) {
      const instanceId = state.detailInstanceId || resolveInstanceId();
      if (!instanceId) return;
      const invoke = getInvoke();
      if (!invoke) return;
      try {
        await invoke('stop_instance', { instanceId });
        appendInstanceLog(instanceId, 'Stop signal sent.');
        setStatus('Stop signal sent.');
      } catch (err: any) {
        const message = err?.toString?.() || 'Stop failed.';
        appendInstanceLog(instanceId, message);
        setStatus(message);
      } finally {
        renderInstanceLog(instanceId);
      }
      return;
    }

    const killInstance = event.target.closest?.('[data-action="instance-kill"]');
    if (killInstance) {
      const instanceId = state.detailInstanceId || resolveInstanceId();
      if (!instanceId) return;
      const invoke = getInvoke();
      if (!invoke) return;
      try {
        await invoke('kill_instance', { instanceId });
        appendInstanceLog(instanceId, 'Kill signal sent.');
        setStatus('Kill signal sent.');
      } catch (err: any) {
        const message = err?.toString?.() || 'Kill failed.';
        appendInstanceLog(instanceId, message);
        setStatus(message);
      } finally {
        renderInstanceLog(instanceId);
      }
      return;
    }

    const openButton = event.target.closest?.('button[data-action="instance-open"]');
    if (openButton) {
      const instanceId = openButton.getAttribute('data-instance-id');
      if (!instanceId) return;
      const invoke = getInvoke();
      if (!invoke) return;
      await invoke('open_instance_folder', { instanceId });
      return;
    }

    const editButton = event.target.closest?.('button[data-action="instance-edit"]');
    if (editButton) {
      const instanceId = editButton.getAttribute('data-instance-id');
      if (!instanceId) return;
      const current = state.config?.instances?.find((item: any) => item.id === instanceId);
      const nextName = window.prompt('Rename instance', current?.name || '');
      if (!nextName || !nextName.trim()) return;
      const invoke = getInvoke();
      if (!invoke) return;
      await invoke('rename_instance', { instanceId, newName: nextName.trim() });
      await loadConfig();
      setStatus('Instance updated.');
      return;
    }

    const deleteInstance = event.target.closest?.('[data-action="instance-delete"]');
    if (deleteInstance && instanceDeleteModal) {
      const instance = state.config?.instances?.find((item: any) => item.id === state.detailInstanceId);
      if (!instance) return;
      if (instanceDeletePrompt) {
        instanceDeletePrompt.textContent = `Type "${instance.name}" to confirm.`;
      }
      if (instanceDeleteInput) {
        instanceDeleteInput.value = '';
      }
      if (instanceDeleteConfirm) {
        instanceDeleteConfirm.disabled = true;
      }
      instanceDeleteModal.classList.add('is-visible');
      instanceDeleteModal.setAttribute('aria-hidden', 'false');
    }

    const closeDelete = event.target.closest?.('[data-action="close-delete-modal"]');
    if (closeDelete && instanceDeleteModal) {
      instanceDeleteModal.classList.remove('is-visible');
      instanceDeleteModal.setAttribute('aria-hidden', 'true');
    }

    const confirmDelete = event.target.closest?.('#instanceDeleteConfirm');
    if (confirmDelete) {
      const instanceId = state.detailInstanceId;
      if (!instanceId) return;
      const invoke = getInvoke();
      if (!invoke) return;
      await invoke('remove_instance', { instanceId });
      await loadConfig();
      closeInstanceDetail();
      if (instanceDeleteModal) {
        instanceDeleteModal.classList.remove('is-visible');
        instanceDeleteModal.setAttribute('aria-hidden', 'true');
      }
      setStatus('Instance removed from launcher.');
    }

    const saveSettings = event.target.closest?.('[data-action="instance-save-settings"]');
    if (saveSettings) {
      const instanceId = state.detailInstanceId;
      if (!instanceId) return;
      const invoke = getInvoke();
      if (!invoke) return;
      await invoke('update_instance_settings', {
        instanceId,
        minRam: instanceMinRam?.value ? Number(instanceMinRam.value) : null,
        maxRam: instanceMaxRam?.value ? Number(instanceMaxRam.value) : null,
        jvmArgs: instanceJvmArgs?.value?.trim() || null,
      });
      await loadConfig();
      setStatus('Instance settings saved.');
    }

    const resetSettings = event.target.closest?.('[data-action="instance-reset-settings"]');
    if (resetSettings) {
      const instanceId = state.detailInstanceId;
      if (!instanceId) return;
      const invoke = getInvoke();
      if (!invoke) return;
      await invoke('update_instance_settings', {
        instanceId,
        minRam: null,
        maxRam: null,
        jvmArgs: null,
      });
      await loadConfig();
      setStatus('Instance settings reset.');
    }
  });

  document.addEventListener('input', () => {
    if (!instanceDeleteModal || instanceDeleteModal.getAttribute('aria-hidden') === 'true') return;
    const instance = state.config?.instances?.find((item: any) => item.id === state.detailInstanceId);
    if (!instance || !instanceDeleteInput || !instanceDeleteConfirm) return;
    instanceDeleteConfirm.disabled = instanceDeleteInput.value.trim() !== instance.name;
  });

  document.addEventListener('change', async (event) => {
    const toggle = event.target as HTMLInputElement | null;
    if (!toggle || toggle.getAttribute('data-action') !== 'toggle-pack') return;
    const filename = toggle.getAttribute('data-pack-file');
    const kind = toggle.getAttribute('data-pack-kind');
    const instanceId = state.detailInstanceId;
    if (!filename || !kind || !instanceId) return;
    const invoke = getInvoke();
    if (!invoke) return;
    try {
      if (kind === 'mods') {
        await invoke('toggle_mod', { instanceId, filename, enabled: toggle.checked });
        await loadMods(instanceId);
      } else {
        await invoke('toggle_instance_pack', {
          instanceId,
          kind,
          filename,
          enabled: toggle.checked,
        });
        await loadPacks(instanceId, kind, kind === 'resourcepacks' ? resourcepacksSummary : kind === 'shaderpacks' ? shadersSummary : texturepacksSummary, kind === 'resourcepacks' ? resourcepacksTable : kind === 'shaderpacks' ? shadersTable : texturepacksTable);
      }
      setStatus('Item updated.');
    } catch (err: any) {
      setStatus(err?.toString?.() || 'Failed to update item.');
    }
  });

  document.addEventListener('click', (event) => {
    const tab = event.target.closest?.('button[data-instance-tab]');
    if (!tab) return;
    const target = tab.getAttribute('data-instance-tab');
    if (target) {
      setActiveInstanceTab(target);
    }
  });
};
