export const getTauri = () => (window as any).__TAURI__ || null;

export const getInvoke = () => {
  const tauri = getTauri();
  return tauri?.core?.invoke || tauri?.invoke || null;
};

export const getListen = () => {
  const tauri = getTauri();
  return tauri?.event?.listen || tauri?.listen || null;
};

export const waitForTauri = async (retries = 60, delay = 100) => {
  for (let attempt = 0; attempt < retries; attempt += 1) {
    if (getInvoke()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  return false;
};
