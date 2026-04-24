import type { Locale, WorkbenchTaskItem } from '../../../shared/domain.js';

export interface WorkbenchOption {
  id: string;
  label: string;
}

export type WorkbenchEntryCommand = 'default' | 'discuss' | 'orchestrate' | 'clear' | 'switchProvider';

export const FILE_CONTEXT_LIMIT = 12000;
export const TERMINAL_RUN_STATUSES = new Set(['succeeded', 'interrupted', 'spawn_failed', 'failed', 'cancelled', 'timed_out']);

export const toErrorMessage = (error: unknown, fallback: string): string => {
  return error instanceof Error ? error.message : fallback;
};

export const createWorkbenchTask = (
  title: string,
  detail: string,
  source: WorkbenchTaskItem['source'],
  agentProfileId: string | null = null,
): WorkbenchTaskItem => {
  const now = new Date().toISOString();
  return {
    id: `wb-task-${crypto.randomUUID()}`,
    title,
    detail,
    status: 'pending',
    source,
    agentProfileId,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  };
};

export const getWorkbenchFallback = (locale: Locale, zhFallback: string, enFallback: string): string => {
  return locale === 'zh' ? zhFallback : enFallback;
};

export const resolveWorkbenchEntryCommand = (value: string): { command: WorkbenchEntryCommand; prompt: string } => {
  const trimmedValue = value.trim();

  if (!trimmedValue.startsWith('/')) {
    return { command: 'default', prompt: trimmedValue };
  }

  const [rawCommand, ...rest] = trimmedValue.split(/\s+/);
  const prompt = rest.join(' ').trim();

  if (rawCommand === '/discuss') {
    return { command: 'discuss', prompt };
  }

  if (rawCommand === '/orchestrate') {
    return { command: 'orchestrate', prompt };
  }

  if (rawCommand === '/clear') {
    return { command: 'clear', prompt };
  }

  if (rawCommand === '/switchProvider') {
    return { command: 'switchProvider', prompt };
  }

  return { command: 'default', prompt: trimmedValue };
};

export const getWorkspaceLabelFromPath = (workspaceRoot: string | null): string | null => {
  const normalizedPath = workspaceRoot?.trim();
  if (!normalizedPath) {
    return null;
  }

  const segments = normalizedPath.replace(/\\/g, '/').split('/').filter(Boolean);
  return segments.at(-1) ?? normalizedPath;
};

export const resolveWorkspaceRelativePath = (workspaceRoot: string | null, absolutePath: string): string | null => {
  const normalizedRoot = workspaceRoot?.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  const normalizedFile = absolutePath.replace(/\\/g, '/');

  if (!normalizedRoot) {
    return null;
  }

  const normalizedFileLower = normalizedFile.toLowerCase();
  if (normalizedFileLower === normalizedRoot) {
    return '';
  }

  if (!normalizedFileLower.startsWith(`${normalizedRoot}/`)) {
    return null;
  }

  return normalizedFile.slice(normalizedRoot.length + 1);
};
