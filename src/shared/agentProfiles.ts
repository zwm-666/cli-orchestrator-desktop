import type { AgentProfile, CliAdapter } from './domain.js';

type ModelSource = Pick<CliAdapter, 'defaultModel' | 'supportedModels'>;

const normalizeModel = (model: string | null | undefined): string => model?.trim() ?? '';

const appendUniqueModel = (models: string[], model: string | null | undefined): void => {
  const normalized = normalizeModel(model);
  if (normalized && !models.includes(normalized)) {
    models.push(normalized);
  }
};

export const getAgentProfileDisplayName = (profile: Pick<AgentProfile, 'name'>): string => {
  return profile.name.replace(/\s*\([^)]*\)\s*$/u, '').trim() || profile.name;
};

export const resolveAgentProfileModelOptions = (
  profile: Pick<AgentProfile, 'model' | 'modelOptions'>,
  source: ModelSource | null | undefined,
): string[] => {
  const options: string[] = [];
  appendUniqueModel(options, source?.defaultModel ?? null);
  (profile.modelOptions ?? []).forEach((model) => { appendUniqueModel(options, model); });
  appendUniqueModel(options, profile.model);
  (source?.supportedModels ?? []).forEach((model) => { appendUniqueModel(options, model); });
  return options;
};

export const resolveAgentProfileModel = (
  profile: Pick<AgentProfile, 'model' | 'modelOptions'>,
  source: ModelSource | null | undefined,
): string => {
  const requestedModel = normalizeModel(profile.model);
  const supportedModels = source?.supportedModels.filter((model) => model.trim().length > 0) ?? [];
  if (requestedModel && (supportedModels.length === 0 || supportedModels.includes(requestedModel))) {
    return requestedModel;
  }

  const options = resolveAgentProfileModelOptions(profile, source);
  if (supportedModels.length === 0) {
    return options[0] ?? '';
  }

  return options.find((model) => supportedModels.includes(model)) ?? supportedModels[0] ?? '';
};

const mergeStringLists = (left: readonly string[], right: readonly string[]): string[] => {
  const merged: string[] = [];
  left.forEach((entry) => { appendUniqueModel(merged, entry); });
  right.forEach((entry) => { appendUniqueModel(merged, entry); });
  return merged;
};

const getProfileMergeKey = (profile: AgentProfile): string => JSON.stringify({
  name: getAgentProfileDisplayName(profile).toLowerCase(),
  role: profile.role,
  targetKind: profile.targetKind ?? 'adapter',
  targetId: profile.targetId ?? profile.adapterId,
  adapterId: profile.adapterId,
  systemPrompt: profile.systemPrompt,
  enabledSkillIds: [...profile.enabledSkillIds].sort(),
  enabledMcpServerIds: [...profile.enabledMcpServerIds].sort(),
  maxParallelChildren: profile.maxParallelChildren,
  retryPolicy: profile.retryPolicy,
  timeoutMs: profile.timeoutMs,
});

export const mergeDuplicateAgentProfiles = (profiles: AgentProfile[]): AgentProfile[] => {
  const byKey = new Map<string, AgentProfile>();

  profiles.forEach((profile) => {
    const key = getProfileMergeKey(profile);
    const existing = byKey.get(key);
    const displayName = getAgentProfileDisplayName(profile);
    if (!existing) {
      byKey.set(key, {
        ...profile,
        name: displayName,
        modelOptions: resolveAgentProfileModelOptions(profile, null),
      });
      return;
    }

    const modelOptions = mergeStringLists(resolveAgentProfileModelOptions(existing, null), resolveAgentProfileModelOptions(profile, null));
    byKey.set(key, {
      ...existing,
      enabled: existing.enabled || profile.enabled,
      model: existing.model || profile.model || modelOptions[0] || '',
      modelOptions,
    });
  });

  return [...byKey.values()];
};
