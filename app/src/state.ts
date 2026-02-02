export const state = {
  config: null as any,
  includeSnapshots: false,
  isInstalling: false,
  selectedInstanceId: null as string | null,
  launcherLogs: [] as string[],
  gameLogs: [] as string[],
  detailInstanceId: null as string | null,
  instanceLogs: {} as Record<string, string[]>,
  instanceMetrics: {} as Record<string, number[]>,
  metricsIntervalId: null as number | null,
};

export const loaderLabels: Record<string, string> = {
  vanilla: 'Vanilla',
  fabric: 'Fabric',
  forge: 'Forge',
};

export const resolveLoaderLabel = (loader: string) => loaderLabels[loader] || loader || 'Unknown';

export const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '') || 'offline';

export const resolveAccountKind = (kind: string) => (kind === 'microsoft' ? 'Microsoft' : 'Offline');
