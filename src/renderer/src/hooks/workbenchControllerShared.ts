import type { Locale, WorkbenchTaskItem } from '../../../shared/domain.js';

export interface WorkbenchOption {
  id: string;
  label: string;
}

export const FILE_CONTEXT_LIMIT = 12000;
export const TERMINAL_RUN_STATUSES = new Set(['succeeded', 'interrupted', 'spawn_failed', 'failed', 'cancelled', 'timed_out']);

export const toErrorMessage = (error: unknown, fallback: string): string => {
  return error instanceof Error ? error.message : fallback;
};

export const createWorkbenchTask = (title: string, detail: string, source: WorkbenchTaskItem['source']): WorkbenchTaskItem => {
  const now = new Date().toISOString();
  return {
    id: `wb-task-${crypto.randomUUID()}`,
    title,
    detail,
    status: 'pending',
    source,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  };
};

export const getWorkbenchFallback = (locale: Locale, zhFallback: string, enFallback: string): string => {
  return locale === 'zh' ? zhFallback : enFallback;
};
