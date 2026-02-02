import { initNavigation } from "./nav";
import {
  attachCopyLog,
  attachLogActions,
  attachLogTabs,
  setStatus,
} from "./logs";
import {
  attachPlaceholderActions,
  attachSubpanelActions,
  attachNavigateActions,
  attachMiscActions,
} from "./misc";
import { attachAccountActions } from "./accounts";
import { attachInstanceActions } from "./instances";
import { waitForTauri, getInvoke } from "./tauri";
import { attachTitlebarControls } from "./titlebar";
import { loadConfig } from "./config";
import { refreshVersions } from "./versions";
import { attachListeners } from "./actions";
import { attachInstallEvents } from "./overlay";

export const boot = async () => {
  initNavigation();
  attachCopyLog();
  attachPlaceholderActions();
  attachSubpanelActions();
  attachNavigateActions();
  attachLogActions();
  attachLogTabs();
  attachMiscActions();
  attachAccountActions();
  attachInstanceActions();

  const ready = await waitForTauri();
  if (!ready) {
    attachTitlebarControls();
    setStatus("Tauri backend not available.");
    return;
  }

  attachTitlebarControls();
  await loadConfig();
  try {
    const invoke = getInvoke();
    if (invoke) {
      await invoke("refresh_microsoft_accounts");
      await loadConfig();
    }
  } catch (err) {
    // ignore refresh errors on boot
  }
  await refreshVersions();
  setStatus("Ready.");
  attachListeners();
  attachInstallEvents();
};

void boot();
