import { describe, expect, it } from 'vitest';
import type { RunSession } from '../../shared/domain.js';
import { buildAdapterReplyContent } from './workbench.js';

const createRun = (overrides: Partial<RunSession> = {}): RunSession => ({
  id: 'run-1',
  taskId: 'task-1',
  adapterId: 'cursor',
  model: 'gpt-5.4',
  workbenchThreadId: 'thread-1',
  status: 'succeeded',
  startedAt: '2026-04-24T10:00:00.000Z',
  activeConversationId: 'conv-1',
  commandPreview: 'cursor --print',
  pid: 123,
  timeoutMs: null,
  cancelRequestedAt: null,
  exitCode: 0,
  endedAt: '2026-04-24T10:01:00.000Z',
  events: [],
  transcript: [],
  ...overrides,
});

describe('buildAdapterReplyContent', () => {
  it('returns assistant transcript output without lifecycle noise', () => {
    const run = createRun({
      transcript: [
        {
          id: 'tx-1',
          runId: 'run-1',
          stepId: 'step-1',
          actor: 'tool',
          kind: 'step_output',
          status: 'info',
          timestamp: '2026-04-24T10:00:01.000Z',
          label: 'Cursor',
          summary: 'Process started with pid 123.',
          detail: null,
        },
        {
          id: 'tx-2',
          runId: 'run-1',
          stepId: 'step-1',
          actor: 'assistant',
          kind: 'step_output',
          status: 'info',
          timestamp: '2026-04-24T10:00:03.000Z',
          label: 'Cursor response',
          summary: '这里是实际回复。\n<TASK_UPDATES>{"completeTaskIds":[],"inProgressTaskIds":[],"newTasks":[]}</TASK_UPDATES>',
          detail: null,
        },
      ],
    });

    expect(buildAdapterReplyContent('zh', run, 'Process started with pid 123.\n这里是实际回复。')).toBe('这里是实际回复。');
  });

  it('falls back to stdout when no assistant transcript exists', () => {
    const run = createRun({
      transcript: [
        {
          id: 'tx-1',
          runId: 'run-1',
          stepId: 'step-1',
          actor: 'tool',
          kind: 'step_output',
          status: 'info',
          timestamp: '2026-04-24T10:00:02.000Z',
          label: 'Stdout',
          summary: 'Process started with pid 123.\nActual stdout reply\nProcess completed successfully.',
          detail: null,
        },
      ],
    });

    expect(buildAdapterReplyContent('en', run, '')).toBe('Actual stdout reply');
  });
});
