import { spawn } from 'node:child_process';
import { access, readdir, readFile, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import type {
  LocalToolCallInput,
  LocalToolCallLogEntry,
  LocalToolCallOutput,
  LocalToolCallResult,
  LocalToolDefinition,
  LocalToolKind,
  LocalToolRegistry,
  LocalToolSource,
  RoutingSettings,
  SubagentWorkStatus,
} from '../../shared/domain.js';
import { DEFAULT_LOCAL_TOOL_REGISTRY } from '../../shared/domain.js';

interface ExecutableCandidate {
  name: string;
  command: string;
  executablePath: string | null;
  source: LocalToolSource;
  wslDistro?: string | null;
  capabilities: string[];
  displayName?: string;
  kind?: LocalToolKind;
}

export interface LocalToolCallCallbacks {
  onStatus?: (status: SubagentWorkStatus, detail: string, callId: string) => void;
  onOutput?: (stream: 'stdout' | 'stderr', chunk: string, callId: string) => void;
}

const WINDOWS_EXECUTABLE_FALLBACKS = ['.com', '.exe', '.bat', '.cmd'];
const TOOL_CALL_LOG_LIMIT = 4000;
const TOOL_OUTPUT_PREVIEW_LIMIT = 4000;
const TOOL_STDIN_LIMIT = 1024 * 1024;
const TOOL_ARG_LIMIT = 128;
const DEFAULT_TOOL_TIMEOUT_MS = 120_000;
const WSL_SCAN_TIMEOUT_MS = 8000;
const WSL_SCAN_MAX_BUFFER = 2 * 1024 * 1024;
const WSL_SCAN_SCRIPT = 'for tool in claude codex opencode openai rg sg ast-grep node npm git python python3; do resolved=$(command -v "$tool" 2>/dev/null) && printf "%s\\t%s\\n" "$tool" "$resolved"; done; IFS=:; for dir in $PATH; do case "$dir" in ""|/mnt/*) continue;; esac; if [ -d "$dir" ]; then find "$dir" -maxdepth 1 -type f -perm /111 -printf "%f\\t%p\\n" 2>/dev/null; fi; done';
const KNOWN_WSL_TOOLS = ['claude', 'codex', 'opencode', 'openai', 'rg', 'sg', 'ast-grep', 'node', 'npm', 'git', 'python', 'python3'];

const AI_AGENT_NAMES = new Set(['claude', 'codex', 'opencode', 'openai']);
const PACKAGE_MANAGER_NAMES = new Set(['npm', 'pnpm', 'yarn', 'bun', 'pip', 'pip3', 'uv', 'cargo']);
const RUNTIME_NAMES = new Set(['node', 'python', 'python3', 'deno', 'go', 'rustc', 'java']);
const EDITOR_NAMES = new Set(['code', 'cursor']);
const SEARCH_NAMES = new Set(['rg', 'grep', 'sg', 'ast-grep']);
const SYSTEM_NAMES = new Set(['git', 'docker', 'wsl', 'wsl.exe', 'powershell', 'powershell.exe', 'pwsh', 'bash', 'sh']);

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const createId = (prefix: string): string => `${prefix}-${crypto.randomUUID()}`;

const hashString = (value: string): string => {
  let hash = 0;
  for (const character of value) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return hash.toString(36);
};

const normalizeDirectoryEntry = (entry: string): string => {
  const trimmed = entry.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
};

const getExecutableExtensions = (): string[] => {
  if (process.platform !== 'win32') {
    return [''];
  }

  const configured = (process.env.PATHEXT ?? '')
    .split(';')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);

  return configured.length > 0 ? configured : WINDOWS_EXECUTABLE_FALLBACKS;
};

const stripWindowsExecutableExtension = (fileName: string): string => {
  const extension = path.extname(fileName).toLowerCase();
  return getExecutableExtensions().includes(extension) ? fileName.slice(0, -extension.length) : fileName;
};

const isWindowsExecutableName = (fileName: string): boolean => {
  return getExecutableExtensions().includes(path.extname(fileName).toLowerCase());
};

const deriveToolKind = (name: string): LocalToolKind => {
  const normalized = name.toLowerCase();
  if (AI_AGENT_NAMES.has(normalized)) return 'ai_agent';
  if (PACKAGE_MANAGER_NAMES.has(normalized)) return 'package_manager';
  if (RUNTIME_NAMES.has(normalized)) return 'runtime';
  if (EDITOR_NAMES.has(normalized)) return 'editor';
  if (SEARCH_NAMES.has(normalized)) return 'search';
  if (SYSTEM_NAMES.has(normalized)) return 'system';
  return 'cli';
};

const deriveCapabilities = (name: string, configuredCapabilities: string[] = []): string[] => {
  const normalized = name.toLowerCase();
  const capabilities = new Set(configuredCapabilities);
  if (AI_AGENT_NAMES.has(normalized)) capabilities.add('ai agent');
  if (SEARCH_NAMES.has(normalized)) capabilities.add('code search');
  if (PACKAGE_MANAGER_NAMES.has(normalized)) capabilities.add('package management');
  if (RUNTIME_NAMES.has(normalized)) capabilities.add('runtime');
  if (SYSTEM_NAMES.has(normalized)) capabilities.add('system cli');
  capabilities.add('local execution');
  return [...capabilities];
};

const formatCommandPreview = (command: string, args: string[]): string => {
  return [command, ...args]
    .map((part) => (part === '' ? '""' : /\s/u.test(part) ? JSON.stringify(part) : part))
    .join(' ');
};

const trimPreview = (value: string): string => {
  return value.length > TOOL_OUTPUT_PREVIEW_LIMIT ? `${value.slice(0, TOOL_OUTPUT_PREVIEW_LIMIT)}…` : value;
};

const shouldUseShell = (command: string): boolean => {
  if (process.platform !== 'win32') {
    return false;
  }

  const extension = path.extname(command).toLowerCase();
  return extension === '.cmd' || extension === '.bat';
};

const quoteShellArgument = (value: string): string => {
  if (value.length === 0) return '""';
  if (!/[\s"]/u.test(value)) return value;
  return `"${value.replaceAll('"', '""')}"`;
};

const buildShellCommand = (command: string, args: string[]): string => {
  return [quoteShellArgument(command), ...args.map((arg) => quoteShellArgument(arg))].join(' ');
};

const isSubpathOrSame = (parentPath: string, candidatePath: string): boolean => {
  const relativePath = path.relative(parentPath, candidatePath);
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
};

const windowsPathToWslPath = (value: string): string => {
  const normalized = path.resolve(value);
  const driveMatch = /^([A-Za-z]):\\?(.*)$/u.exec(normalized);
  if (!driveMatch) {
    return normalized.replaceAll('\\', '/');
  }

  const driveLetter = (driveMatch[1] ?? '').toLowerCase();
  const rest = (driveMatch[2] ?? '').replaceAll('\\', '/');
  return `/mnt/${driveLetter}${rest ? `/${rest}` : ''}`;
};

const sanitizeToolEnvironment = (env: Record<string, string> | undefined): Record<string, string> => {
  if (!env) {
    return {};
  }

  const allowedPattern = /^(?:CI|NO_COLOR|FORCE_COLOR|TERM|LANG|LC_[A-Z_]+)$/u;
  return Object.fromEntries(Object.entries(env).filter(([key]) => allowedPattern.test(key)));
};

export class LocalToolRegistryService {
  private registry: LocalToolRegistry = structuredClone(DEFAULT_LOCAL_TOOL_REGISTRY);

  public constructor(private readonly rootDir: string) {}

  public getRegistry(): LocalToolRegistry {
    return structuredClone(this.registry);
  }

  public async refreshRegistry(routingSettings?: RoutingSettings): Promise<LocalToolRegistry> {
    const scannedAt = new Date().toISOString();
    const discoveryRoots = routingSettings?.discoveryRoots ?? [];
    const [pathCandidates, customRootCandidates, wslCandidates, adapterCandidates] = await Promise.all([
      this.scanHostPathTools(),
      this.scanCustomRootTools(discoveryRoots),
      this.scanWslTools(),
      this.scanAdapterConfigTools(),
    ]);
    const customAdapterCandidates = this.scanCustomAdapterTools(routingSettings);
    const nodeRuntime: ExecutableCandidate = {
      name: 'node',
      displayName: 'Node.js runtime',
      command: process.execPath,
      executablePath: process.execPath,
      source: 'node_runtime',
      kind: 'runtime',
      capabilities: ['runtime', 'local execution'],
    };
    const allCandidates = [nodeRuntime, ...pathCandidates, ...customRootCandidates, ...wslCandidates, ...adapterCandidates, ...customAdapterCandidates];
    const toolsById = new Map<string, LocalToolDefinition>();

    for (const candidate of allCandidates) {
      const tool = this.toToolDefinition(candidate, scannedAt);
      toolsById.set(tool.id, tool);
    }

    const scanRoots = [
      ...(process.env.PATH ?? '').split(path.delimiter).map(normalizeDirectoryEntry).filter((entry) => entry.length > 0),
      ...discoveryRoots,
      ...[...new Set(wslCandidates.map((candidate) => candidate.wslDistro ? `WSL:${candidate.wslDistro}:$PATH` : 'WSL:$PATH'))],
      path.resolve(this.rootDir, 'config', 'adapters.json'),
    ];

    this.registry = {
      tools: [...toolsById.values()].sort((left, right) => left.name.localeCompare(right.name) || left.source.localeCompare(right.source)),
      scannedAt,
      scanRoots: [...new Set(scanRoots)],
    };

    return this.getRegistry();
  }

  public resolveTool(toolName: string): LocalToolDefinition | null {
    const normalizedName = toolName.trim().toLowerCase();
    if (!normalizedName) {
      return null;
    }

    const candidates = this.registry.tools.filter((tool) => {
      return tool.availability === 'available' && (tool.name.toLowerCase() === normalizedName || tool.displayName.toLowerCase() === normalizedName);
    });

    return candidates.sort((left, right) => this.getToolPreference(right) - this.getToolPreference(left))[0] ?? null;
  }

  public async callLocalTool(input: LocalToolCallInput, callbacks: LocalToolCallCallbacks = {}): Promise<LocalToolCallResult> {
    if (this.registry.scannedAt === null) {
      await this.refreshRegistry();
    }

    const tool = this.resolveTool(input.toolName);
    const callId = createId('tool-call');
    const startedAt = new Date().toISOString();
    const startedAtMs = Date.now();
    const args = input.args ?? [];
    if (args.length > TOOL_ARG_LIMIT) {
      throw new Error(`Local tool calls support at most ${TOOL_ARG_LIMIT} arguments.`);
    }
    if (input.stdin && Buffer.byteLength(input.stdin, 'utf8') > TOOL_STDIN_LIMIT) {
      throw new Error('Local tool stdin is limited to 1 MB.');
    }
    const cwd = this.resolveSafeCwd(input.cwd);
    const timeoutMs = input.timeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS;

    if (!tool) {
      const endedAt = new Date().toISOString();
      const logEntry = this.createLogEntry({
        callId,
        toolName: input.toolName,
        command: input.toolName,
        args,
        cwd,
        startedAt,
        endedAt,
        success: false,
        exitCode: null,
        signal: null,
        error: `Local tool "${input.toolName}" was not found in the registry.`,
        stdout: '',
        stderr: '',
        input,
      });
      callbacks.onStatus?.('error', logEntry.error ?? 'Local tool was not found.', callId);
      return { success: false, result: null, error: logEntry.error, logEntry };
    }

    const commandSpec = this.buildCommandSpec(tool, args, cwd);
    const commandPreview = formatCommandPreview(commandSpec.command, commandSpec.args);
    callbacks.onStatus?.('tool_calling', `Calling ${tool.displayName}.`, callId);

    return new Promise<LocalToolCallResult>((resolve) => {
      let stdout = '';
      let stderr = '';
      let settled = false;
      let spawnError: string | null = null;
      let didTimeOut = false;

      const child = spawn(commandSpec.command, commandSpec.args, {
        cwd: commandSpec.cwd,
        env: { ...process.env, ...sanitizeToolEnvironment(input.env) },
        shell: commandSpec.shell,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const timeout = timeoutMs > 0
        ? setTimeout(() => {
            didTimeOut = true;
            child.kill();
          }, timeoutMs)
        : null;

      const finish = (exitCode: number | null, signal: NodeJS.Signals | null): void => {
        if (settled) {
          return;
        }
        settled = true;
        if (timeout) {
          clearTimeout(timeout);
        }

        const endedAt = new Date().toISOString();
        const error = spawnError ?? (didTimeOut ? `Local tool timed out after ${timeoutMs} ms.` : exitCode === 0 ? null : `Local tool exited with code ${exitCode ?? 'unknown'}.`);
        const success = error === null;
        const output: LocalToolCallOutput = {
          stdout,
          stderr,
          exitCode,
          signal,
          durationMs: Date.now() - startedAtMs,
          commandPreview,
        };
        const logEntry = this.createLogEntry({
          callId,
          toolName: tool.name,
          command: commandSpec.command,
          args: commandSpec.args,
          cwd,
          startedAt,
          endedAt,
          success,
          exitCode,
          signal,
          error,
          stdout,
          stderr,
          input,
        });
        callbacks.onStatus?.(success ? 'completed' : 'error', success ? `${tool.displayName} completed.` : error, callId);
        resolve({ success, result: output, error, logEntry });
      };

      child.stdout.on('data', (chunk: Buffer) => {
        const text = chunk.toString('utf8');
        stdout += text;
        callbacks.onOutput?.('stdout', text, callId);
      });

      child.stderr.on('data', (chunk: Buffer) => {
        const text = chunk.toString('utf8');
        stderr += text;
        callbacks.onOutput?.('stderr', text, callId);
      });

      child.on('error', (error) => {
        spawnError = error.message;
        finish(null, null);
      });

      child.on('close', (code, signal) => {
        finish(code, signal);
      });

      try {
        if (input.stdin) {
          child.stdin.write(input.stdin);
        }
        child.stdin.end();
      } catch (error: unknown) {
        spawnError = error instanceof Error ? error.message : 'Failed to write to local tool stdin.';
      }
    });
  }

  public trimCallLogs(logs: LocalToolCallLogEntry[]): LocalToolCallLogEntry[] {
    return logs.slice(0, TOOL_CALL_LOG_LIMIT);
  }

  private resolveSafeCwd(value: string | null | undefined): string {
    const candidate = value?.trim() ? path.resolve(value) : this.rootDir;
    const root = path.resolve(this.rootDir);
    if (!isSubpathOrSame(root, candidate)) {
      throw new Error('Local tool cwd must stay inside the current workspace root.');
    }

    return candidate;
  }

  private async scanHostPathTools(): Promise<ExecutableCandidate[]> {
    const source: LocalToolSource = process.platform === 'win32' ? 'windows_path' : 'posix_path';
    return this.scanDirectoriesBySource((process.env.PATH ?? '').split(path.delimiter), source);
  }

  private async scanCustomRootTools(discoveryRoots: string[]): Promise<ExecutableCandidate[]> {
    return this.scanDirectoriesBySource(discoveryRoots, 'custom_root');
  }

  private async scanDirectoriesBySource(rawDirectories: string[], source: LocalToolSource): Promise<ExecutableCandidate[]> {
    const directories = [...new Set(rawDirectories.map(normalizeDirectoryEntry).filter((entry) => entry.length > 0))];
    const candidateGroups = await Promise.all(directories.map((directory) => this.scanDirectory(directory, source)));
    return candidateGroups.flat();
  }

  private async scanDirectory(directory: string, source: LocalToolSource): Promise<ExecutableCandidate[]> {
    try {
      const entries = await readdir(directory, { withFileTypes: true });
      const candidates = await Promise.all(entries.map(async (entry): Promise<ExecutableCandidate | null> => {
        if (!entry.isFile() && !entry.isSymbolicLink()) {
          return null;
        }

        const executablePath = path.join(directory, entry.name);
        if (process.platform === 'win32') {
          if (!isWindowsExecutableName(entry.name)) {
            return null;
          }

          const name = stripWindowsExecutableExtension(entry.name);
          return {
            name,
            command: executablePath,
            executablePath,
            source,
            capabilities: deriveCapabilities(name),
          };
        }

        try {
          await access(executablePath, constants.X_OK);
        } catch {
          return null;
        }

        return {
          name: entry.name,
          command: executablePath,
          executablePath,
          source,
          capabilities: deriveCapabilities(entry.name),
        };
      }));

      return candidates.filter((candidate): candidate is ExecutableCandidate => candidate !== null);
    } catch {
      return [];
    }
  }

  private async scanWslTools(): Promise<ExecutableCandidate[]> {
    if (process.platform !== 'win32' || !await this.hostCommandExists('wsl.exe')) {
      return [];
    }

    const distros = await this.listWslDistributions();
    const targets = distros.length > 0 ? distros : [null];
    const scanned = await Promise.all(targets.map((distro) => this.scanWslTarget(distro)));
    return scanned.flat();
  }

  private async scanWslTarget(distro: string | null): Promise<ExecutableCandidate[]> {
    const knownCandidates = await this.scanKnownWslTools(distro);
    const output = await this.executeWslCommand(distro, WSL_SCAN_SCRIPT);
    const pathCandidates = output
      .split(/\r?\n/u)
      .map((line): ExecutableCandidate | null => {
        const [name, executablePath] = line.split('\t');
        if (!name || !executablePath) {
          return null;
        }

        return {
          name,
          command: executablePath,
          executablePath,
          source: 'wsl_path',
          wslDistro: distro,
          capabilities: deriveCapabilities(name),
        };
      })
      .filter((candidate): candidate is ExecutableCandidate => candidate !== null);

    return [...knownCandidates, ...pathCandidates];
  }

  private async scanKnownWslTools(distro: string | null): Promise<ExecutableCandidate[]> {
    const candidates = await Promise.all(KNOWN_WSL_TOOLS.map((toolName) => this.resolveKnownWslTool(distro, toolName)));
    return candidates.filter((candidate): candidate is ExecutableCandidate => candidate !== null);
  }

  private async resolveKnownWslTool(distro: string | null, toolName: string): Promise<ExecutableCandidate | null> {
    const output = await this.executeWslCommand(distro, `command -v ${toolName}`);
    const executablePath = output.split(/\r?\n/u)[0]?.trim() ?? '';
    if (!executablePath) {
      return null;
    }

    return {
      name: toolName,
      command: executablePath,
      executablePath,
      source: 'wsl_path',
      wslDistro: distro,
      capabilities: deriveCapabilities(toolName),
    };
  }

  private async listWslDistributions(): Promise<string[]> {
    const decoded = await this.executeWslProcess(['--list', '--quiet']);
    const distros = decoded
      .split(/\r?\n/u)
      .map((line) => line.replaceAll('\u0000', '').trim())
      .filter((line) => line.length > 0);
    return [...new Set(distros)];
  }

  private async executeWslCommand(distro: string | null, command: string): Promise<string> {
    return this.executeWslProcess([...(distro ? ['-d', distro] : []), '--', 'sh', '-lc', command]);
  }

  private async executeWslProcess(args: string[]): Promise<string> {
    return new Promise((resolve) => {
      const child = spawn('wsl.exe', args, {
        cwd: this.rootDir,
        env: process.env,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      const chunks: Buffer[] = [];
      let bufferedLength = 0;
      const timeout = setTimeout(() => {
        child.kill();
      }, WSL_SCAN_TIMEOUT_MS);

      child.stdout.on('data', (chunk: Buffer) => {
        if (bufferedLength >= WSL_SCAN_MAX_BUFFER) {
          return;
        }

        const remainingLength = WSL_SCAN_MAX_BUFFER - bufferedLength;
        const nextChunk = chunk.length > remainingLength ? chunk.subarray(0, remainingLength) : chunk;
        chunks.push(nextChunk);
        bufferedLength += nextChunk.length;
      });

      child.on('error', () => {
        clearTimeout(timeout);
        resolve('');
      });

      child.on('close', () => {
        clearTimeout(timeout);
        const buffer = Buffer.concat(chunks);
        const utf8 = buffer.toString('utf8');
        resolve(utf8.includes('\u0000') ? buffer.toString('utf16le') : utf8);
      });
    });
  }

  private async scanAdapterConfigTools(): Promise<ExecutableCandidate[]> {
    const configPath = path.resolve(this.rootDir, 'config', 'adapters.json');
    try {
      const parsed = JSON.parse(await readFile(configPath, 'utf8')) as unknown;
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed
        .map((entry): ExecutableCandidate | null => {
          if (!isRecord(entry) || typeof entry.id !== 'string' || typeof entry.command !== 'string') {
            return null;
          }

          const capabilities = Array.isArray(entry.capabilities)
            ? entry.capabilities.filter((capability): capability is string => typeof capability === 'string')
            : [];

          return {
            name: entry.id,
            displayName: typeof entry.displayName === 'string' ? entry.displayName : entry.id,
            command: entry.command === '$NODE_EXEC_PATH' ? process.execPath : entry.command,
            executablePath: null,
            source: 'adapter_config',
            capabilities: deriveCapabilities(entry.id, capabilities),
            kind: deriveToolKind(entry.id),
          };
        })
        .filter((candidate): candidate is ExecutableCandidate => candidate !== null);
    } catch {
      return [];
    }
  }

  private scanCustomAdapterTools(routingSettings: RoutingSettings | undefined): ExecutableCandidate[] {
    return (routingSettings?.customAdapters ?? []).map((adapter): ExecutableCandidate => ({
      name: adapter.id,
      displayName: adapter.displayName,
      command: adapter.command,
      executablePath: null,
      source: 'custom_adapter',
      capabilities: deriveCapabilities(adapter.id, adapter.capabilities),
      kind: 'ai_agent',
    }));
  }

  private async hostCommandExists(command: string): Promise<boolean> {
    const directories = (process.env.PATH ?? '').split(path.delimiter).map(normalizeDirectoryEntry).filter((entry) => entry.length > 0);
    const candidateNames = process.platform === 'win32' && !path.extname(command)
      ? getExecutableExtensions().map((extension) => `${command}${extension}`)
      : [command];

    for (const directory of directories) {
      for (const candidateName of candidateNames) {
        try {
          const candidatePath = path.join(directory, candidateName);
          const candidateStat = await stat(candidatePath);
          if (candidateStat.isFile()) {
            return true;
          }
        } catch {
          // keep checking other PATH entries
        }
      }
    }

    return false;
  }

  private toToolDefinition(candidate: ExecutableCandidate, discoveredAt: string): LocalToolDefinition {
    const name = candidate.name.trim();
    const sourceKey = `${candidate.source}|${name.toLowerCase()}|${candidate.executablePath ?? candidate.command}`;
    const kind = candidate.kind ?? deriveToolKind(name);
    return {
      id: `tool-${hashString(sourceKey)}`,
      name,
      displayName: candidate.displayName ?? name,
      command: candidate.command,
      executablePath: candidate.executablePath,
      wslDistro: candidate.wslDistro ?? null,
      source: candidate.source,
      kind,
      availability: 'available',
      version: candidate.source === 'node_runtime' ? process.version : null,
      capabilities: deriveCapabilities(name, candidate.capabilities),
      discoveredAt,
    };
  }

  private getToolPreference(tool: LocalToolDefinition): number {
    if (tool.source === 'windows_path' || tool.source === 'posix_path') return 60;
    if (tool.source === 'wsl_path') return 50;
    if (tool.source === 'node_runtime') return 30;
    if (tool.source === 'adapter_config') return 20;
    return 0;
  }

  private buildCommandSpec(tool: LocalToolDefinition, args: string[], cwd: string): { command: string; args: string[]; cwd: string; shell: boolean } {
    if (tool.source === 'wsl_path') {
      return {
        command: 'wsl.exe',
        args: [...(tool.wslDistro ? ['-d', tool.wslDistro] : []), '--cd', windowsPathToWslPath(cwd), '--', tool.executablePath ?? tool.command, ...args],
        cwd: this.rootDir,
        shell: false,
      };
    }

    const command = tool.executablePath ?? tool.command;
    const useShell = shouldUseShell(command);
    return {
      command: useShell ? buildShellCommand(command, args) : command,
      args: useShell ? [] : args,
      cwd,
      shell: useShell,
    };
  }

  private createLogEntry(input: {
    callId: string;
    toolName: string;
    command: string;
    args: string[];
    cwd: string;
    startedAt: string;
    endedAt: string;
    success: boolean;
    exitCode: number | null;
    signal: NodeJS.Signals | null;
    error: string | null;
    stdout: string;
    stderr: string;
    input: LocalToolCallInput;
  }): LocalToolCallLogEntry {
    return {
      id: input.callId,
      toolName: input.toolName,
      command: input.command,
      args: input.args,
      cwd: input.cwd,
      startedAt: input.startedAt,
      endedAt: input.endedAt,
      success: input.success,
      exitCode: input.exitCode,
      signal: input.signal,
      error: input.error,
      stdoutPreview: trimPreview(input.stdout),
      stderrPreview: trimPreview(input.stderr),
      profileId: input.input.profileId ?? null,
      runId: input.input.runId ?? null,
      orchestrationNodeId: input.input.orchestrationNodeId ?? null,
    };
  }
}
