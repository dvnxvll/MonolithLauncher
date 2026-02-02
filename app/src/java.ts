import {
  globalJavaPath,
  globalJavaSelect,
  javaPill,
  minRamInput,
  maxRamInput,
  jvmArgsInput,
  instanceJavaSelect,
  instanceJavaVersion,
  instanceJavaPath,
} from './dom';
import { state } from './state';

export const resolveJavaOverride = (instanceId: string) => {
  const overrides = state.config?.settings?.java?.overrides || [];
  return overrides.find((item: any) => item.instance_id === instanceId) || null;
};

export const refreshJavaSettings = () => {
  const java = state.config?.settings?.java;
  if (!java) return;
  if (globalJavaSelect) {
    globalJavaSelect.value = java.runtime?.version || 'auto';
  }
  if (javaPill) {
    const label = java.runtime?.version ? `Java ${java.runtime.version}` : 'Java Auto';
    javaPill.textContent = label;
  }
  if (globalJavaPath) {
    globalJavaPath.value = java.runtime?.path || '';
  }
  if (minRamInput) {
    minRamInput.value = java.min_ram_gb ?? 6;
  }
  if (maxRamInput) {
    maxRamInput.value = java.max_ram_gb ?? 12;
  }
  if (jvmArgsInput) {
    jvmArgsInput.value = java.jvm_args || '';
  }

  if (instanceJavaSelect) {
    const currentId = instanceJavaSelect.value;
    if (currentId) {
      const override = resolveJavaOverride(currentId);
      if (instanceJavaVersion) {
        instanceJavaVersion.value = override?.version || 'inherit';
      }
      if (instanceJavaPath) {
        instanceJavaPath.value = override?.path || '';
      }
    }
  }
};
