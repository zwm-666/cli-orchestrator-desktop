import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AgentProfile, CliAdapter } from '../../shared/domain.js';
import {
  getAgentProfileDisplayName,
  mergeDuplicateAgentProfiles,
  resolveAgentProfileModel,
  resolveAgentProfileModelOptions,
} from '../../shared/agentProfiles.js';

const createProfile = (overrides: Partial<AgentProfile> = {}): AgentProfile => ({
  id: 'coder-claude-sonnet',
  name: 'Coder (Claude Sonnet)',
  role: 'coder',
  adapterId: 'claude',
  model: 'sonnet',
  systemPrompt: 'Code well.',
  enabledSkillIds: ['code-implementation'],
  enabledMcpServerIds: [],
  maxParallelChildren: 1,
  retryPolicy: { maxRetries: 1, delayMs: 1000, backoffMultiplier: 2 },
  timeoutMs: null,
  enabled: true,
  ...overrides,
});

const createAdapter = (overrides: Partial<CliAdapter> = {}): CliAdapter => ({
  id: 'claude',
  displayName: 'Claude Code',
  command: 'claude',
  launchMode: 'cli',
  description: 'Claude adapter',
  capabilities: [],
  health: 'idle',
  visibility: 'user',
  availability: 'available',
  readiness: 'ready',
  readinessReason: 'ready',
  discoveryReason: 'found',
  enabled: true,
  defaultTimeoutMs: null,
  defaultModel: 'sonnet',
  supportedModels: ['sonnet', 'opus'],
  ...overrides,
});

describe('agent profile helpers', () => {
  it('removes trailing model/provider suffixes from display names', () => {
    expect(getAgentProfileDisplayName(createProfile())).toBe('Coder');
  });

  it('merges duplicate agents that only differ by model', () => {
    const profiles = mergeDuplicateAgentProfiles([
      createProfile({ id: 'coder-claude-opus', name: 'Coder (Claude Opus)', model: 'opus' }),
      createProfile({ id: 'coder-claude-sonnet', name: 'Coder (Claude Sonnet)', model: 'sonnet' }),
    ]);

    expect(profiles).toHaveLength(1);
    expect(profiles[0]?.name).toBe('Coder');
    expect(profiles[0]?.modelOptions).toEqual(['opus', 'sonnet']);
  });

  it('falls back to a selectable adapter model when the profile model is unavailable', () => {
    const profile = createProfile({ model: 'o3-pro', modelOptions: ['o3-pro', 'opus'] });
    const adapter = createAdapter({ defaultModel: 'sonnet', supportedModels: ['sonnet', 'opus'] });

    expect(resolveAgentProfileModel(profile, adapter)).toBe('sonnet');
    expect(resolveAgentProfileModelOptions(profile, adapter)).toEqual(['sonnet', 'o3-pro', 'opus']);
  });

  it('keeps bundled agent profile display names unique and suffix-free', () => {
    const configPath = path.resolve(process.cwd(), 'config', 'agent-profiles.json');
    const profiles = JSON.parse(readFileSync(configPath, 'utf8')) as AgentProfile[];
    const displayNames = profiles.map((profile) => getAgentProfileDisplayName(profile));

    expect(new Set(displayNames).size).toBe(displayNames.length);
    expect(displayNames.every((name) => !/\([^)]*\)$/u.test(name))).toBe(true);
  });
});
