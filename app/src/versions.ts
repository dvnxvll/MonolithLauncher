import { loaderSelect, gameVersionSelect, loaderVersionSelect, snapshotsToggle } from './dom';
import { getInvoke } from './tauri';
import { setStatus } from './logs';
import { setSelectOptions } from './select';

export const fetchGameVersions = async () => {
  const invoke = getInvoke();
  if (!invoke || !loaderSelect || !gameVersionSelect) return;
  const loader = loaderSelect.value;
  const includeSnapshots = snapshotsToggle?.checked ?? false;
  gameVersionSelect.disabled = true;
  setStatus('Loading versions.');

  try {
    let versions: any[] = [];
    if (loader === 'fabric') {
      versions = await invoke('list_fabric_game_versions', {
        includeSnapshots,
      });
    } else {
      versions = await invoke('list_vanilla_versions', {
        includeSnapshots,
      });
    }

    const options = versions.map((version) => ({
      value: version.id,
      label: `${version.id}${version.stable ? '' : ' (snapshot)'}`,
    }));
    if (options.length === 0) {
      setSelectOptions(gameVersionSelect, [], 'No versions found');
      setStatus('No versions found for this loader.');
    } else {
      setSelectOptions(gameVersionSelect, options, 'Select version');
      setStatus('Versions loaded.');
    }
  } catch (err: any) {
    const message = err?.toString?.() || 'Failed to load versions.';
    setStatus(message);
  } finally {
    gameVersionSelect.disabled = false;
  }
};

export const fetchLoaderVersions = async () => {
  const invoke = getInvoke();
  if (!invoke || !loaderSelect || !loaderVersionSelect || !gameVersionSelect) return;
  const loader = loaderSelect.value;
  const gameVersion = gameVersionSelect.value;
  const includeSnapshots = snapshotsToggle?.checked ?? false;

  if (loader === 'vanilla') {
    setSelectOptions(loaderVersionSelect, [], 'Not required');
    loaderVersionSelect.disabled = true;
    return;
  }

  loaderVersionSelect.disabled = true;

  if (!gameVersion) {
    setSelectOptions(loaderVersionSelect, [], 'Select loader');
    loaderVersionSelect.disabled = loader !== 'vanilla';
    return;
  }

  try {
    let options: { value: string; label: string }[] = [];
    if (loader === 'fabric') {
      const versions = await invoke('list_fabric_loader_versions', {
        gameVersion,
        includeSnapshots,
      });
      options = versions.map((version: any) => ({
        value: version.version,
        label: version.version,
      }));
    } else if (loader === 'forge') {
      const versions = await invoke('list_forge_versions', {
        gameVersion,
      });
      options = versions.map((version: any) => ({
        value: version.version,
        label: version.version,
      }));
    } else {
      options = [];
    }
    if (loader !== 'vanilla' && options.length === 0) {
      setSelectOptions(loaderVersionSelect, [], 'No loader versions');
      setStatus('No loader versions found.');
    } else {
      setSelectOptions(loaderVersionSelect, options, 'Select loader');
    }
  } catch (err: any) {
    const message = err?.toString?.() || 'Failed to load loader versions.';
    setStatus(message);
  } finally {
    loaderVersionSelect.disabled = loader === 'vanilla';
  }
};

export const refreshVersions = async () => {
  if (loaderSelect && !loaderSelect.value) {
    loaderSelect.value = 'vanilla';
  }
  await fetchGameVersions();
  await fetchLoaderVersions();
};
