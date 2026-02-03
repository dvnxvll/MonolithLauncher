export const getTauri = () =>
  typeof window !== "undefined" ? (window as any).__TAURI__ : null;

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

export const invoke = async <T = unknown>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> => {
  const invoker = getInvoke();
  if (!invoker) {
    throw new Error("Tauri backend not available.");
  }
  return invoker(command, args);
};

export const getAppWindow = async () => {
  const tauri = getTauri();
  if (!tauri?.window) return null;
  const candidates = [
    tauri.window.getCurrentWindow?.(),
    tauri.window.getCurrent?.(),
    tauri.window.appWindow ?? null,
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (typeof (candidate as any).then === "function") {
      return await (candidate as any);
    }
    return candidate;
  }
  return null;
};

export const startDragging = async () => {
  const tauri = getTauri();
  if (!tauri?.window) return;
  if (tauri.window.startDragging) {
    await tauri.window.startDragging();
    return;
  }
  const win = await getAppWindow();
  await win?.startDragging?.();
};
