/**
 * AgentRegistryService – Owns agent profile loading, validation,
 * routing, and defaults.
 *
 * An AgentProfile combines an adapter with a role, skills, MCP bindings,
 * and execution constraints.
 *
 * Loading order (mirrors SkillRegistryService / McpRegistryService):
 * 1. loadFromConfig()  – reads config/agent-profiles.json (defaults)
 * 2. mergePersistedProfiles()  – overlays user-persisted overrides
 */

import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { mergeDuplicateAgentProfiles } from '../../shared/agentProfiles.js';
import type { AgentProfile, AgentRoleType } from '../../shared/domain.js';

const CONFIG_FILENAME = 'agent-profiles.json';
const LEGACY_BUILTIN_PROFILE_IDS = new Set([
  'master-claude',
  'coder-claude-opus',
  'coder-claude-sonnet',
  'coder-codex',
  'coder-codex-o3',
  'researcher-claude',
  'researcher-openai',
  'reviewer-claude',
  'tester-claude',
  'planner-claude',
  'coder-opencode',
]);

export class AgentRegistryService {
  private profiles: AgentProfile[] = [];
  private readonly configPath: string;

  constructor(private readonly rootDir: string) {
    this.configPath = path.resolve(rootDir, 'config', CONFIG_FILENAME);
  }

  /** Load agent profiles from config/agent-profiles.json. */
  public loadFromConfig(): AgentProfile[] {
    if (!existsSync(this.configPath)) {
      this.profiles = [];
      return [];
    }

    try {
      const raw = readFileSync(this.configPath, 'utf8');
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        this.profiles = [];
        return [];
      }
      this.profiles = mergeDuplicateAgentProfiles((parsed as AgentProfile[]).filter(
        (p) => typeof p.id === 'string' && p.id.trim().length > 0
      ));
      return structuredClone(this.profiles);
    } catch {
      this.profiles = [];
      return [];
    }
  }

  /** Merge persisted profiles (from AppState) with config-loaded profiles. */
  public mergePersistedProfiles(persisted: AgentProfile[]): AgentProfile[] {
    const byId = new Map(this.profiles.map((p) => [p.id, p]));
    for (const p of persisted) {
      if (!byId.has(p.id)) {
        if (LEGACY_BUILTIN_PROFILE_IDS.has(p.id)) {
          continue;
        }
        // User-created profile not in config – keep it
        byId.set(p.id, p);
      } else {
        // Persisted overrides config for mutable fields
        const existing = byId.get(p.id);
        if (!existing) continue;
        byId.set(p.id, {
          ...existing,
          enabled: p.enabled,
          model: p.model,
          systemPrompt: p.systemPrompt,
          enabledSkillIds: p.enabledSkillIds,
          enabledMcpServerIds: p.enabledMcpServerIds,
          maxParallelChildren: p.maxParallelChildren,
          retryPolicy: p.retryPolicy,
          timeoutMs: p.timeoutMs
        });
      }
    }
    this.profiles = mergeDuplicateAgentProfiles([...byId.values()]);
    return structuredClone(this.profiles);
  }

  /** Get all agent profiles. */
  public getAll(): AgentProfile[] {
    return structuredClone(this.profiles);
  }

  /** Get enabled profiles only. */
  public getEnabled(): AgentProfile[] {
    return this.profiles.filter((p) => p.enabled);
  }

  /** Find a profile by ID. */
  public getById(profileId: string): AgentProfile | null {
    return this.profiles.find((p) => p.id === profileId) ?? null;
  }

  /** Find profiles by role. */
  public getByRole(role: AgentRoleType): AgentProfile[] {
    return this.profiles.filter((p) => p.enabled && p.role === role);
  }

  /** Find the best profile for a given role. Returns the first enabled match or null. */
  public resolveForRole(role: AgentRoleType): AgentProfile | null {
    return this.profiles.find((p) => p.enabled && p.role === role) ?? null;
  }

  /** Save or update an agent profile. */
  public save(profile: AgentProfile): AgentProfile {
    const index = this.profiles.findIndex((p) => p.id === profile.id);
    if (index >= 0) {
      this.profiles[index] = structuredClone(profile);
    } else {
      this.profiles.push(structuredClone(profile));
    }
    void this.writeConfig();
    return structuredClone(profile);
  }

  /** Delete an agent profile by ID. */
  public delete(profileId: string): void {
    this.profiles = this.profiles.filter((p) => p.id !== profileId);
    void this.writeConfig();
  }

  /** Get the master agent profile (if any). */
  public getMasterProfile(): AgentProfile | null {
    return this.resolveForRole('master');
  }

  private async writeConfig(): Promise<void> {
    await mkdir(path.dirname(this.configPath), { recursive: true });
    await writeFile(this.configPath, JSON.stringify(this.profiles, null, 2) + '\n', 'utf8');
  }
}
