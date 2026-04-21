/**
 * McpRegistryService – Phase 5: MCP server definitions, health checks,
 * capability loading, and connection policy.
 *
 * MCP answers "which tools are accessible during execution" and is
 * independent of adapters which answer "which model or CLI executes this."
 */

import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import type { McpHealthStatus, McpServerDefinition } from '../../shared/domain.js';

const CONFIG_FILENAME = 'mcp-servers.json';
const HEALTH_CHECK_TIMEOUT_MS = 5000;

export class McpRegistryService {
  private servers: McpServerDefinition[] = [];
  private readonly configPath: string;

  constructor(private readonly rootDir: string) {
    this.configPath = path.resolve(rootDir, 'config', CONFIG_FILENAME);
  }

  /** Load MCP server definitions from config/mcp-servers.json. */
  public loadFromConfig(): McpServerDefinition[] {
    if (!existsSync(this.configPath)) {
      this.servers = [];
      return [];
    }

    try {
      const raw = readFileSync(this.configPath, 'utf8');
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        this.servers = [];
        return [];
      }
      this.servers = (parsed as McpServerDefinition[]).filter(
        (s) => typeof s.id === 'string' && s.id.trim().length > 0
      );
      return structuredClone(this.servers);
    } catch {
      this.servers = [];
      return [];
    }
  }

  /** Merge persisted MCP servers (from AppState) with config-loaded servers. */
  public mergePersistedServers(persisted: McpServerDefinition[]): McpServerDefinition[] {
    const byId = new Map(this.servers.map((s) => [s.id, s]));
    for (const s of persisted) {
      if (!byId.has(s.id)) {
        byId.set(s.id, s);
      } else {
        const existing = byId.get(s.id);
        if (!existing) continue;
        byId.set(s.id, {
          ...existing,
          enabled: s.enabled,
          healthStatus: s.healthStatus,
          healthReason: s.healthReason
        });
      }
    }
    this.servers = [...byId.values()];
    return structuredClone(this.servers);
  }

  /** Get all MCP servers. */
  public getAll(): McpServerDefinition[] {
    return structuredClone(this.servers);
  }

  /** Get enabled MCP servers only. */
  public getEnabled(): McpServerDefinition[] {
    return this.servers.filter((s) => s.enabled);
  }

  /** Get a specific MCP server by ID. */
  public getById(serverId: string): McpServerDefinition | null {
    return this.servers.find((s) => s.id === serverId) ?? null;
  }

  /** Save or update an MCP server definition. */
  public save(server: McpServerDefinition): McpServerDefinition {
    const index = this.servers.findIndex((s) => s.id === server.id);
    if (index >= 0) {
      this.servers[index] = structuredClone(server);
    } else {
      this.servers.push(structuredClone(server));
    }
    void this.writeConfig();
    return structuredClone(server);
  }

  /** Delete an MCP server definition by ID. */
  public delete(serverId: string): void {
    this.servers = this.servers.filter((s) => s.id !== serverId);
    void this.writeConfig();
  }

  /**
   * Run a health check for a given MCP server.
   * For stdio-based servers, this tries to spawn the command and checks if it starts successfully.
   */
  public async checkHealth(serverId: string): Promise<{ status: McpHealthStatus; reason: string }> {
    const server = this.servers.find((s) => s.id === serverId);
    if (!server) {
      return { status: 'unknown', reason: 'Server not found.' };
    }

    if (!server.command) {
      return { status: 'unhealthy', reason: 'No command configured.' };
    }

    if (server.transport === 'stdio') {
      return this.checkStdioHealth(server);
    }

    // For HTTP-based transports, mark as unknown until runtime verification
    return { status: 'unknown', reason: `Health check for ${server.transport} transport not yet implemented.` };
  }

  /**
   * Run health checks for all enabled servers and update their status.
   */
  public async checkAllHealth(): Promise<McpServerDefinition[]> {
    const results = await Promise.allSettled(
      this.servers.filter((s) => s.enabled).map(async (server) => {
        const result = await this.checkHealth(server.id);
        return { serverId: server.id, ...result };
      })
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        const { serverId, status, reason } = result.value;
        const index = this.servers.findIndex((s) => s.id === serverId);
        if (index >= 0) {
          const server = this.servers[index];
          if (!server) continue;
          this.servers[index] = {
            ...server,
            healthStatus: status,
            healthReason: reason
          };
        }
      }
    }

    return structuredClone(this.servers);
  }

  /**
   * Compute the effective MCP binding set for a node.
   * Combines agent profile MCP set + skill-level MCP dependencies,
   * filtered to only enabled servers.
   */
  public computeEffectiveBindings(
    agentProfileMcpIds: string[],
    skillMcpIds: string[]
  ): McpServerDefinition[] {
    const allIds = new Set([...agentProfileMcpIds, ...skillMcpIds]);
    return this.servers.filter((s) => s.enabled && allIds.has(s.id));
  }

  private checkStdioHealth(server: McpServerDefinition): Promise<{ status: McpHealthStatus; reason: string }> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        child.kill();
        resolve({ status: 'unhealthy', reason: `Health check timed out after ${HEALTH_CHECK_TIMEOUT_MS}ms.` });
      }, HEALTH_CHECK_TIMEOUT_MS);

      const env = { ...process.env, ...server.env };
      const child = spawn(server.command, server.args, {
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true
      });

      child.on('spawn', () => {
        clearTimeout(timeout);
        child.kill();
        resolve({ status: 'healthy', reason: `Process "${server.command}" started successfully.` });
      });

      child.on('error', (error) => {
        clearTimeout(timeout);
        resolve({ status: 'unhealthy', reason: `Failed to spawn: ${error.message}` });
      });
    });
  }

  private async writeConfig(): Promise<void> {
    await mkdir(path.dirname(this.configPath), { recursive: true });
    await writeFile(this.configPath, JSON.stringify(this.servers, null, 2) + '\n', 'utf8');
  }
}
