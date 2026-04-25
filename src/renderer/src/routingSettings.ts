import type { RoutingSettings } from '../../shared/domain.js';
import { DEFAULT_ROUTING_SETTINGS } from '../../shared/domain.js';

export const normalizeRoutingSettings = (settings: Partial<RoutingSettings> | null | undefined): RoutingSettings => {
  const taskTypeRules = settings?.taskTypeRules ?? {};

  return {
    adapterSettings: settings?.adapterSettings ?? {},
    discoveryRoots: Array.isArray(settings?.discoveryRoots) ? [...settings.discoveryRoots] : [],
    customAdapters: Array.isArray(settings?.customAdapters)
      ? settings.customAdapters.map((adapter) => ({
          ...adapter,
          args: [...adapter.args],
          capabilities: [...adapter.capabilities],
          supportedModels: [...adapter.supportedModels],
        }))
      : [],
    taskTypeRules: {
      ...DEFAULT_ROUTING_SETTINGS.taskTypeRules,
      ...taskTypeRules,
    },
    taskProfiles: Array.isArray(settings?.taskProfiles)
      ? settings.taskProfiles.map((profile) => ({ ...profile }))
      : DEFAULT_ROUTING_SETTINGS.taskProfiles.map((profile) => ({ ...profile })),
  };
};
