import { execFileSync } from 'node:child_process';
import { accessSync, constants, readFileSync } from 'node:fs';
import path from 'node:path';
import type { AdapterRoutingSettings, CliAdapter, CliAdapterLaunchMode, RoutingSettings, RunSession } from '../../shared/domain.js';
import type { LocalPersistenceStore } from '../persistence.js';

const ADAPTER_HEALTHS = new Set<CliAdapter['health']>(['healthy', 'idle', 'attention']);
const ADAPTER_VISIBILITIES = new Set<CliAdapter['visibility']>(['user', 'internal']);
const EXECUTABLE_TOKENS = {
  nodeExecPath: '$NODE_EXEC_PATH',
} as const;
const PLACEHOLDER_PATTERN = /{{\s*([a-zA-Z][a-zA-Z0-9]*)\s*}}/g;
const EXECUTABLE_PATTERN = /^(?:[A-Za-z]:)?[A-Za-z0-9_./\\:() -]+$/;
const WINDOWS_PATH_PATTERN = /^(?:[A-Za-z]:)?[\\/]/;
const WINDOWS_PATHEXT_FALLBACK = ['.com', '.exe', '.bat', '.cmd'];
const TERMINAL_STATUS_MESSAGE_PATTERNS = [
  /^Process completed successfully\.$/i,
  /^Process was interrupted by an application restart and cannot be resumed\.$/i,
  /^Process failed to start\./i,
  /^Process exited with code /i,
  /^Process cancelled by user/i,
  /^Process timed out after /i,
];
const BLOCKED_ENVIRONMENT_PATTERNS = [
  /not completing the current non-interactive run path reliably/i,
  /missing a usable local session\/server context/i,
  /session not found/i,
];

type JsonObject = Record<string, unknown>;

interface TemplateContext {
  adapterId: string;
  conversationId: string;
  model: string;
  prompt: string;
  runId: string;
  taskId: string;
  title: string;
}

export interface CliAdapterConfig {
  id: string;
  displayName: string;
  visibility: CliAdapter['visibility'];
  requiresDiscovery: boolean;
  launchMode: CliAdapterLaunchMode;
  command: string;
  args: string[];
  promptTransport: 'arg' | 'stdin';
  description: string;
  capabilities: string[];
  health: CliAdapter['health'];
  enabled: boolean;
  defaultTimeoutMs: number | null;
  defaultModel: string | null;
  supportedModels: string[];
}

const hasControlCharacters = (value: string): boolean => {
  return Array.from(value).some((character) => character < ' ');
};

const isJsonObject = (value: unknown): value is JsonObject => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const isAdapterHealth = (value: unknown): value is CliAdapter['health'] => {
  return typeof value === 'string' && ADAPTER_HEALTHS.has(value as CliAdapter['health']);
};

const isAdapterVisibility = (value: unknown): value is CliAdapter['visibility'] => {
  return typeof value === 'string' && ADAPTER_VISIBILITIES.has(value as CliAdapter['visibility']);
};

const isStringArray = (value: unknown): value is string[] => {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
};

const isNonEmptyString = (value: unknown): value is string => {
  return typeof value === 'string' && value.trim().length > 0;
};

const normalizeOptionalString = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizeTimeoutMs = (value: unknown, fieldName: string): number | null => {
  if (value === undefined || value === null) {
    return null;
  }

  if (!Number.isInteger(value) || (value as number) <= 0) {
    throw new Error(`${fieldName} must be a positive integer when provided.`);
  }

  return value as number;
};

const validateExecutable = (command: string, index: number): string => {
  if (Object.values(EXECUTABLE_TOKENS).includes(command as (typeof EXECUTABLE_TOKENS)[keyof typeof EXECUTABLE_TOKENS])) {
    return command;
  }

  if (!isNonEmptyString(command)) {
    throw new Error(`Adapter config entry ${index} command must be a non-empty string.`);
  }

  if (command.trim() !== command) {
    throw new Error(`Adapter config entry ${index} command must not have surrounding whitespace.`);
  }

  if (hasControlCharacters(command) || command.includes('{{') || !EXECUTABLE_PATTERN.test(command)) {
    throw new Error(`Adapter config entry ${index} command is not a valid executable string.`);
  }

  return command;
};

const validateCustomExecutableOverride = (command: string): string => {
  if (!isNonEmptyString(command)) {
    throw new Error('Adapter customCommand must be a non-empty string.');
  }

  const trimmedCommand = command.trim();

  if (trimmedCommand !== command) {
    throw new Error('Adapter customCommand must not have surrounding whitespace.');
  }

  if (hasControlCharacters(trimmedCommand) || trimmedCommand.includes('{{') || !EXECUTABLE_PATTERN.test(trimmedCommand)) {
    throw new Error('Adapter customCommand is not a valid executable string.');
  }

  return trimmedCommand;
};

const validateTemplateString = (value: string, index: number, field: string): string => {
  PLACEHOLDER_PATTERN.lastIndex = 0;

  const allowedKeys = new Set<keyof TemplateContext>(['adapterId', 'conversationId', 'model', 'prompt', 'runId', 'taskId', 'title']);

  for (const match of value.matchAll(PLACEHOLDER_PATTERN)) {
    const key = match[1] as keyof TemplateContext;
    if (!allowedKeys.has(key)) {
      throw new Error(`Adapter config entry ${index} ${field} uses unsupported placeholder {{${match[1]}}}.`);
    }
  }

  const residual = value.replaceAll(PLACEHOLDER_PATTERN, '');
  if (residual.includes('{{') || residual.includes('}}')) {
    throw new Error(`Adapter config entry ${index} ${field} has malformed placeholder syntax.`);
  }

  return value;
};

const isPathLikeExecutable = (command: string): boolean => {
  return path.isAbsolute(command) || command.includes('/') || command.includes('\\') || WINDOWS_PATH_PATTERN.test(command);
};

const getExecutableExtensions = (): string[] => {
  if (process.platform !== 'win32') {
    return [''];
  }

  const configuredExtensions = (process.env.PATHEXT ?? '')
    .split(';')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);

  return configuredExtensions.length > 0 ? configuredExtensions : WINDOWS_PATHEXT_FALLBACK;
};

const canAccessExecutablePath = (candidatePath: string): boolean => {
  try {
    accessSync(candidatePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
};

const normalizeDirectoryEntry = (entry: string): string => {
  const trimmed = entry.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
};

const getWindowsFallbackExecutableDirectories = (): string[] => {
  if (process.platform !== 'win32') {
    return [];
  }

  const candidates = [
    process.env.APPDATA ? path.join(process.env.APPDATA, 'npm') : null,
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Links') : null,
    process.env.USERPROFILE ? path.join(process.env.USERPROFILE, '.bun', 'bin') : null,
    process.env.USERPROFILE ? path.join(process.env.USERPROFILE, 'scoop', 'shims') : null,
    process.env.ChocolateyInstall ? path.join(process.env.ChocolateyInstall, 'bin') : null,
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Programs', 'Microsoft VS Code', 'bin') : null,
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Programs', 'Cursor', 'resources', 'app', 'bin') : null,
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Programs', 'Cursor', 'bin') : null,
    process.env.ProgramFiles ? path.join(process.env.ProgramFiles, 'Microsoft VS Code', 'bin') : null,
    process.env.ProgramFiles ? path.join(process.env.ProgramFiles, 'Cursor', 'resources', 'app', 'bin') : null,
    process.env['ProgramFiles(x86)'] ? path.join(process.env['ProgramFiles(x86)'], 'Microsoft VS Code', 'bin') : null,
  ];

  return [...new Set(candidates.filter((entry): entry is string => Boolean(entry && entry.trim().length > 0)).map(normalizeDirectoryEntry))];
};

const canResolveViaWhere = (command: string): boolean => {
  if (process.platform !== 'win32' || isPathLikeExecutable(command)) {
    return false;
  }

  try {
    const output = execFileSync('where', [command], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
    }).trim();
    return output.length > 0;
  } catch {
    return false;
  }
};

const isExecutableAvailableInDirectories = (command: string, directories: string[]): boolean => {
  const hasKnownExtension = path.extname(command).length > 0;
  const executableExtensions = getExecutableExtensions();
  const candidateSuffixes = hasKnownExtension || process.platform !== 'win32' ? [''] : executableExtensions;

  for (const directory of directories) {
    const normalizedDirectory = normalizeDirectoryEntry(directory);
    if (!normalizedDirectory) continue;
    const basePath = path.join(normalizedDirectory, command);
    for (const suffix of candidateSuffixes) {
      const candidatePath = suffix && !basePath.toLowerCase().endsWith(suffix) ? `${basePath}${suffix}` : basePath;
      if (canAccessExecutablePath(candidatePath)) return true;
    }
  }

  return false;
};

const isExecutableAvailable = (command: string): boolean => {
  if (!command) return false;

  const resolvedCommand = Object.values(EXECUTABLE_TOKENS).includes(command as (typeof EXECUTABLE_TOKENS)[keyof typeof EXECUTABLE_TOKENS])
    ? process.execPath
    : command;
  const hasKnownExtension = path.extname(resolvedCommand).length > 0;
  const executableExtensions = getExecutableExtensions();
  const candidateSuffixes = hasKnownExtension || process.platform !== 'win32' ? [''] : executableExtensions;
  const candidateDirectories = isPathLikeExecutable(resolvedCommand)
    ? ['']
    : (process.env.PATH ?? '').split(path.delimiter).map(normalizeDirectoryEntry).filter((entry) => entry.length > 0);

  for (const directory of candidateDirectories) {
    const basePath = directory ? path.join(directory, resolvedCommand) : resolvedCommand;
    for (const suffix of candidateSuffixes) {
      const candidatePath = suffix && !basePath.toLowerCase().endsWith(suffix) ? `${basePath}${suffix}` : basePath;
      if (canAccessExecutablePath(candidatePath)) return true;
    }
  }

  return canResolveViaWhere(resolvedCommand) || isExecutableAvailableInDirectories(resolvedCommand, getWindowsFallbackExecutableDirectories());
};

const extractWslDiscoveryProbe = (args: string[]): { distro: string | null; command: string | null } | null => {
  const separatorIndex = args.indexOf('--');
  if (separatorIndex < 0 || separatorIndex === args.length - 1) {
    return null;
  }

  const command = args[separatorIndex + 1] ?? null;
  if (!command || command.includes('{{')) {
    return null;
  }

  const distroIndex = args.indexOf('-d');
  const distro = distroIndex >= 0 ? args[distroIndex + 1] ?? null : null;
  return { distro, command };
};

const isWslInnerCommandAvailable = (wslCommand: string, args: string[]): boolean => {
  const probe = extractWslDiscoveryProbe(args);
  if (!probe?.command) {
    return isExecutableAvailable(wslCommand);
  }

  const validatedProbeCommand = validateCustomExecutableOverride(probe.command);

  try {
    const wslArgs = [
      ...(probe.distro ? ['-d', probe.distro] : []),
      '--',
      'sh',
      '-lc',
      'command -v -- "$1" >/dev/null 2>&1',
      'sh',
      validatedProbeCommand,
    ];
    execFileSync(wslCommand, wslArgs, { windowsHide: true, stdio: 'ignore', timeout: 4000 });
    return true;
  } catch {
    return false;
  }
};

const parseAdapterConfig = (value: unknown): CliAdapterConfig[] => {
  if (!Array.isArray(value)) {
    throw new Error('Adapter config must be an array.');
  }

  return value.map((entry, index) => {
    if (!isJsonObject(entry)) throw new Error(`Adapter config entry ${index} must be an object.`);

    if (
      !isNonEmptyString(entry.id) ||
      !isNonEmptyString(entry.displayName) ||
      !isNonEmptyString(entry.description) ||
      !isAdapterVisibility(entry.visibility) ||
      typeof entry.requiresDiscovery !== 'boolean' ||
      (entry.launchMode !== 'cli' && entry.launchMode !== 'manual_handoff') ||
      typeof entry.enabled !== 'boolean' ||
      !isStringArray(entry.args) ||
      !isStringArray(entry.capabilities) ||
      !isAdapterHealth(entry.health) ||
      typeof entry.command !== 'string'
    ) {
      throw new Error(`Adapter config entry ${index} is missing required fields.`);
    }

    const command = validateExecutable(entry.command, index);
    const args = entry.args.map((arg, argIndex) => validateTemplateString(arg, index, `args[${argIndex}]`));
    const defaultTimeoutMs = normalizeTimeoutMs(entry.defaultTimeoutMs, `Adapter ${entry.id} defaultTimeoutMs`);
    const defaultModel = normalizeOptionalString(entry.defaultModel);

    return {
      id: entry.id.trim(),
      displayName: entry.displayName.trim(),
      visibility: entry.visibility,
      requiresDiscovery: entry.requiresDiscovery,
      launchMode: entry.launchMode,
      command,
      args,
      promptTransport: entry.promptTransport === 'stdin' ? 'stdin' : 'arg',
      description: entry.description.trim(),
      capabilities: entry.capabilities.map((capability) => capability.trim()).filter((capability) => capability.length > 0),
      health: entry.health,
      enabled: entry.enabled,
      defaultTimeoutMs,
      defaultModel,
      supportedModels: Array.isArray(entry.supportedModels)
        ? entry.supportedModels.filter((model): model is string => typeof model === 'string')
        : [],
    };
  });
};

const getAdapterDiscoveryReason = (adapterId: string, command: string, available: boolean): string => {
  if (!available) {
    return `"${command}" was not found in PATH. Ensure it is installed globally (e.g. npm install -g ${adapterId}).`;
  }

  switch (adapterId) {
    case 'claude':
      return `Found "${command}" in PATH. Current Windows non-interactive runs may still depend on terminal/TTY behavior even when auth is valid.`;
    case 'codex':
      return `Found "${command}" in PATH. Non-interactive JSON mode is available and currently the most reliable integration path.`;
    case 'opencode':
      return `Found "${command}" in PATH. Non-interactive run mode may still depend on local session/server state in this environment.`;
    default:
      return `Found "${command}" in PATH.`;
  }
};

const isTerminalStatusMessage = (message: string): boolean => {
  return TERMINAL_STATUS_MESSAGE_PATTERNS.some((pattern) => pattern.test(message));
};

const isEnvironmentBlockedMessage = (message: string): boolean => {
  return BLOCKED_ENVIRONMENT_PATTERNS.some((pattern) => pattern.test(message));
};

const getAdapterSetting = (
  routingSettings: RoutingSettings,
  adapterConfig: Pick<CliAdapterConfig, 'id' | 'enabled' | 'defaultModel'>,
): AdapterRoutingSettings => {
  const override = routingSettings.adapterSettings[adapterConfig.id];
  const customCommand = normalizeOptionalString(override?.customCommand);

  return {
    enabled: override?.enabled ?? adapterConfig.enabled,
    defaultModel: override?.defaultModel ?? adapterConfig.defaultModel ?? '',
    customCommand: customCommand ? validateCustomExecutableOverride(customCommand) : '',
  };
};

export class AdapterManager {
  private readonly adapterConfigs: CliAdapterConfig[];
  private readonly discoveredAdapterIds = new Set<string>();
  private readonly discoveryReasons = new Map<string, { available: boolean; reason: string }>();
  private routingSettings: RoutingSettings;

  public constructor(
    private readonly rootDir: string,
    private readonly persistenceStore: LocalPersistenceStore,
    routingSettings: RoutingSettings,
    private readonly getRuns: () => RunSession[],
  ) {
    this.adapterConfigs = this.loadAdapters();
    this.routingSettings = routingSettings;
    this.syncDiscoveredAdapterIds(this.routingSettings);
    this.routingSettings = this.sanitizeRoutingSettings(this.routingSettings);
  }

  public getAdapters(): CliAdapter[] {
    return this.adapterConfigs.map((adapter) => this.toAdapter(adapter));
  }

  public getRoutingSettings(): RoutingSettings {
    return structuredClone(this.routingSettings);
  }

  public refreshAdapters(): RoutingSettings {
    this.syncDiscoveredAdapterIds(this.routingSettings);
    this.routingSettings = this.persistenceStore.saveRoutingSettings(this.sanitizeRoutingSettings(this.routingSettings));
    return this.getRoutingSettings();
  }

  public updateRoutingSettings(settings: RoutingSettings): RoutingSettings {
    this.syncDiscoveredAdapterIds(settings);
    this.routingSettings = this.persistenceStore.saveRoutingSettings(this.sanitizeRoutingSettings(settings));
    return this.getRoutingSettings();
  }

  public getEnabledUserFacingAdapters(): CliAdapter[] {
    return this.getAdapters().filter((adapter) => adapter.visibility === 'user' && adapter.enabled && adapter.availability === 'available');
  }

  public resolveAdapter(adapterId: string): { config: CliAdapterConfig; adapter: CliAdapter } {
    const adapterConfig = this.adapterConfigs.find((entry) => entry.id === adapterId);
    if (!adapterConfig) {
      throw new Error(`Adapter ${adapterId} is not configured.`);
    }

    return { config: adapterConfig, adapter: this.toAdapter(adapterConfig) };
  }

  public canLaunchAdapter(adapter: CliAdapter, adapterConfig: CliAdapterConfig): boolean {
    if (adapter.availability !== 'available') {
      return false;
    }

    return adapter.visibility === 'internal' ? adapterConfig.enabled : adapter.enabled;
  }

  private loadAdapters(): CliAdapterConfig[] {
    const configPath = path.resolve(this.rootDir, 'config/adapters.json');
    const file = readFileSync(configPath, 'utf8');
    return parseAdapterConfig(JSON.parse(file) as unknown);
  }

  private syncDiscoveredAdapterIds(settings: RoutingSettings): void {
    this.discoveredAdapterIds.clear();
    this.discoveryReasons.clear();

    for (const adapterId of this.discoverAvailableAdapters(this.adapterConfigs, settings)) {
      this.discoveredAdapterIds.add(adapterId);
    }
  }

  private toAdapter(config: CliAdapterConfig): CliAdapter {
    const routingOverride = getAdapterSetting(this.routingSettings, config);
    const command = normalizeOptionalString(routingOverride.customCommand) ?? this.resolveExecutable(config.command);
    const discoveryInfo = this.discoveryReasons.get(config.id);
    const availability: CliAdapter['availability'] = this.discoveredAdapterIds.has(config.id) ? 'available' : 'unavailable';
    const discoveryReason = discoveryInfo?.reason ?? (availability === 'available' ? 'Found in PATH.' : 'Not checked.');
    const enabled = config.visibility === 'user' && availability === 'available' && routingOverride.enabled;
    const readiness = this.deriveAdapterReadiness(config.id, availability, discoveryReason);

    return {
      id: config.id,
      displayName: config.displayName,
      command,
      launchMode: config.launchMode,
      description: config.description,
      capabilities: config.capabilities,
      health: config.health,
      visibility: config.visibility,
      availability,
      readiness: readiness.state,
      readinessReason: readiness.reason,
      discoveryReason,
      enabled,
      defaultTimeoutMs: config.defaultTimeoutMs,
      defaultModel: normalizeOptionalString(routingOverride.defaultModel) ?? config.defaultModel,
      supportedModels: config.supportedModels,
    };
  }

  private discoverAvailableAdapters(configs: CliAdapterConfig[], routingSettings: RoutingSettings): Set<string> {
    const available = new Set<string>();

    for (const config of configs) {
      const routingOverride = getAdapterSetting(routingSettings, config);
      const command = normalizeOptionalString(routingOverride.customCommand) ?? this.resolveExecutable(config.command);

      if (!config.requiresDiscovery || config.launchMode === 'manual_handoff') {
        available.add(config.id);
        this.discoveryReasons.set(config.id, {
          available: true,
          reason: config.launchMode === 'manual_handoff' ? 'Manual handoff adapter is always available for copy/paste workflows.' : 'Discovery not required (internal adapter).',
        });
      } else if (path.basename(command).toLowerCase() === 'wsl.exe' || path.basename(command).toLowerCase() === 'wsl') {
        if (isExecutableAvailable(command) && isWslInnerCommandAvailable(command, config.args)) {
          available.add(config.id);
          this.discoveryReasons.set(config.id, { available: true, reason: getAdapterDiscoveryReason(config.id, command, true) });
        } else {
          this.discoveryReasons.set(config.id, {
            available: false,
            reason: `"${command}" is available, but the configured command inside WSL could not be verified. Check the distro/tool installation and any custom command override.`,
          });
        }
      } else if (isExecutableAvailable(command)) {
        available.add(config.id);
        this.discoveryReasons.set(config.id, { available: true, reason: getAdapterDiscoveryReason(config.id, command, true) });
      } else {
        this.discoveryReasons.set(config.id, { available: false, reason: getAdapterDiscoveryReason(config.id, command, false) });
      }
    }

    return available;
  }

  private deriveAdapterReadiness(adapterId: string, availability: CliAdapter['availability'], discoveryReason: string): { state: CliAdapter['readiness']; reason: string } {
    if (availability === 'unavailable') {
      return { state: 'unavailable', reason: discoveryReason };
    }

    const recentRuns = this.getRuns().filter((run) => run.adapterId === adapterId).sort((left, right) => right.startedAt.localeCompare(left.startedAt));
    for (const run of recentRuns) {
      const terminalMessages = [...run.events]
        .sort((left, right) => right.timestamp.localeCompare(left.timestamp))
        .filter((event) => isTerminalStatusMessage(event.message))
        .map((event) => event.message);

      const latestTerminalMessage = terminalMessages[0];
      if (!latestTerminalMessage) continue;

      if (isEnvironmentBlockedMessage(latestTerminalMessage)) {
        return { state: 'blocked_by_environment', reason: latestTerminalMessage };
      }

      if (run.status === 'succeeded') {
        return { state: 'ready', reason: latestTerminalMessage };
      }
    }

    return { state: 'ready', reason: discoveryReason };
  }

  private sanitizeRoutingSettings(settings: RoutingSettings): RoutingSettings {
    const availableUserFacingAdapterIds = new Set(
      this.adapterConfigs.filter((config) => config.visibility === 'user' && this.discoveredAdapterIds.has(config.id)).map((config) => config.id),
    );

    return {
      adapterSettings: { ...settings.adapterSettings },
      taskTypeRules: Object.fromEntries(
        Object.entries(settings.taskTypeRules).map(([taskType, rule]) => {
          const nextAdapterId = rule.adapterId && availableUserFacingAdapterIds.has(rule.adapterId) ? rule.adapterId : null;
          return [taskType, { adapterId: nextAdapterId, model: rule.model }];
        }),
      ) as RoutingSettings['taskTypeRules'],
      taskProfiles: settings.taskProfiles
        .filter((profile) => profile.id.trim().length > 0)
        .map((profile) => ({
          ...profile,
          adapterId: profile.adapterId && availableUserFacingAdapterIds.has(profile.adapterId) ? profile.adapterId : null,
          model: profile.model,
        })),
    };
  }

  private resolveExecutable(command: string): string {
    return command === EXECUTABLE_TOKENS.nodeExecPath ? process.execPath : command;
  }
}
