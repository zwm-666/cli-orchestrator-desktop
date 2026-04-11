/**
 * SkillRegistryService – Phase 4: Skill manifest loading, validation,
 * enablement, and matching.
 *
 * Skills are reusable task-handling templates that define:
 * 1. When they should trigger
 * 2. How they rewrite or enrich the prompt
 * 3. What MCP capabilities they require
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import type { SkillDefinition, TaskType } from '../../shared/domain.js';

const CONFIG_FILENAME = 'skills.json';

export class SkillRegistryService {
  private skills: SkillDefinition[] = [];
  private readonly configPath: string;

  constructor(private readonly rootDir: string) {
    this.configPath = path.resolve(rootDir, 'config', CONFIG_FILENAME);
  }

  /** Load skills from config/skills.json and merge with persisted state. */
  public loadFromConfig(): SkillDefinition[] {
    if (!existsSync(this.configPath)) {
      this.skills = [];
      return [];
    }

    try {
      const raw = readFileSync(this.configPath, 'utf8');
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        this.skills = [];
        return [];
      }
      this.skills = (parsed as SkillDefinition[]).filter(
        (s) => typeof s.id === 'string' && s.id.trim().length > 0
      );
      return structuredClone(this.skills);
    } catch {
      this.skills = [];
      return [];
    }
  }

  /** Merge persisted skills (from AppState) with config-loaded skills. */
  public mergePersistedSkills(persisted: SkillDefinition[]): SkillDefinition[] {
    const byId = new Map(this.skills.map((s) => [s.id, s]));
    for (const s of persisted) {
      if (!byId.has(s.id)) {
        byId.set(s.id, s);
      } else {
        // Persisted overrides config for enabled state
        const existing = byId.get(s.id)!;
        byId.set(s.id, { ...existing, enabled: s.enabled });
      }
    }
    this.skills = [...byId.values()];
    return structuredClone(this.skills);
  }

  /** Get all skills. */
  public getAll(): SkillDefinition[] {
    return structuredClone(this.skills);
  }

  /** Get enabled skills only. */
  public getEnabled(): SkillDefinition[] {
    return this.skills.filter((s) => s.enabled);
  }

  /** Find skills that match a given task type and prompt. */
  public matchSkills(taskType: TaskType, prompt: string): SkillDefinition[] {
    const normalizedPrompt = prompt.toLowerCase();
    return this.skills.filter((skill) => {
      if (!skill.enabled) return false;
      // Check task type constraints
      if (skill.allowedTaskTypes.length > 0 && !skill.allowedTaskTypes.includes(taskType)) return false;
      if (skill.trigger.taskTypes.length > 0 && !skill.trigger.taskTypes.includes(taskType)) return false;
      // Check keyword trigger
      if (skill.trigger.keywords.length > 0) {
        return skill.trigger.keywords.some((kw) => normalizedPrompt.includes(kw.toLowerCase()));
      }
      // No keyword constraint – matches by task type alone
      return true;
    });
  }

  /** Save or update a skill. */
  public save(skill: SkillDefinition): SkillDefinition {
    const index = this.skills.findIndex((s) => s.id === skill.id);
    if (index >= 0) {
      this.skills[index] = structuredClone(skill);
    } else {
      this.skills.push(structuredClone(skill));
    }
    this.writeConfig();
    return structuredClone(skill);
  }

  /** Delete a skill by id. */
  public delete(skillId: string): void {
    this.skills = this.skills.filter((s) => s.id !== skillId);
    this.writeConfig();
  }

  /**
   * Assemble the skill prompt injection for a given set of skill IDs.
   *
   * Prompt assembly order (per agent.md §7.3):
   * 1. Global system instruction
   * 2. AgentProfile.systemPrompt
   * 3. SkillDefinition.promptTemplate  <-- this method provides #3
   * 4. Original user task segment
   * 5. Upstream node result summaries
   * 6. MCP tool instructions
   * 7. Output format constraints
   */
  public assembleSkillPrompts(skillIds: string[]): string {
    const parts: string[] = [];
    for (const id of skillIds) {
      const skill = this.skills.find((s) => s.id === id);
      if (skill?.promptTemplate) {
        parts.push(`[Skill: ${skill.name}]\n${skill.promptTemplate}`);
      }
    }
    return parts.join('\n\n');
  }

  private writeConfig(): void {
    mkdirSync(path.dirname(this.configPath), { recursive: true });
    writeFileSync(this.configPath, JSON.stringify(this.skills, null, 2) + '\n', 'utf8');
  }
}
