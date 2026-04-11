import { describe, it, expect } from 'vitest';
import {
  formatTime,
  countEvents,
  getLatestConversationMessage,
  formatTimeoutValue,
  renderTimeoutHint,
  getRunStatusCopy,
  getRunInvocationStateCopy,
  renderNotice,
  getPlanDraftTasks
} from './helpers.js';
import type { Conversation, PlanDraft, RunSession } from '../../shared/domain.js';

const makeRun = (overrides: Partial<RunSession> = {}): RunSession => ({
  id: 'run-1',
  taskId: 'task-1',
  adapterId: 'claude',
  model: 'sonnet',
  status: 'running',
  startedAt: '2026-01-15T10:30:00Z',
  activeConversationId: 'conv-1',
  commandPreview: 'claude -p ...',
  pid: 1234,
  timeoutMs: null,
  cancelRequestedAt: null,
  exitCode: null,
  endedAt: null,
  events: [],
  transcript: [],
  ...overrides
});

describe('formatTime', () => {
  it('formats a timestamp in English locale', () => {
    const result = formatTime('en', '2026-01-15T10:30:00Z');
    expect(result).toContain('Jan');
    expect(result).toContain('15');
  });

  it('formats a timestamp in Chinese locale', () => {
    const result = formatTime('zh', '2026-01-15T10:30:00Z');
    expect(result).toContain('1');
  });
});

describe('countEvents', () => {
  it('returns 0 for empty runs', () => {
    expect(countEvents([])).toBe(0);
  });

  it('sums events across runs', () => {
    const runs = [
      makeRun({ events: [{ id: 'e1', runId: 'r1', level: 'info', timestamp: '', message: 'a' }] }),
      makeRun({ events: [{ id: 'e2', runId: 'r2', level: 'stdout', timestamp: '', message: 'b' }, { id: 'e3', runId: 'r2', level: 'stderr', timestamp: '', message: 'c' }] })
    ];
    expect(countEvents(runs)).toBe(3);
  });
});

describe('getLatestConversationMessage', () => {
  it('returns last message content', () => {
    const conv: Conversation = {
      id: 'c1', title: 'Test', createdAt: '', updatedAt: '', draftInput: '',
      messages: [
        { id: 'm1', role: 'customer', content: 'hello', createdAt: '' },
        { id: 'm2', role: 'assistant', content: 'world', createdAt: '' }
      ]
    };
    expect(getLatestConversationMessage(conv)).toBe('world');
  });

  it('returns empty string for no messages', () => {
    const conv: Conversation = {
      id: 'c1', title: 'Test', createdAt: '', updatedAt: '', draftInput: '', messages: []
    };
    expect(getLatestConversationMessage(conv)).toBe('');
  });
});

describe('formatTimeoutValue', () => {
  it('returns no-timeout label for null', () => {
    expect(formatTimeoutValue('en', null, 'No timeout')).toBe('No timeout');
  });

  it('formats a number with locale and ms suffix', () => {
    const result = formatTimeoutValue('en', 300000, 'No timeout');
    expect(result).toContain('300');
    expect(result).toContain('ms');
  });
});

describe('renderTimeoutHint', () => {
  it('returns English hint', () => {
    expect(renderTimeoutHint('en', '5000 ms')).toContain('Leave blank');
  });

  it('returns Chinese hint', () => {
    expect(renderTimeoutHint('zh', '5000 ms')).toContain('留空');
  });
});

describe('getRunStatusCopy', () => {
  it('returns running status in English', () => {
    expect(getRunStatusCopy('en', makeRun({ status: 'running' }))).toContain('active');
  });

  it('returns cancel pending status in Chinese', () => {
    expect(getRunStatusCopy('zh', makeRun({ status: 'running', cancelRequestedAt: '2026-01-15T10:31:00Z' }))).toContain('取消');
  });

  it('returns succeeded status', () => {
    expect(getRunStatusCopy('en', makeRun({ status: 'succeeded' }))).toContain('successfully');
  });
});

describe('getRunInvocationStateCopy', () => {
  it('returns ended when exitCode is set', () => {
    expect(getRunInvocationStateCopy('en', makeRun({ exitCode: 0 }))).toBe('Ended');
  });

  it('returns process observed when pid is set', () => {
    expect(getRunInvocationStateCopy('en', makeRun({ pid: 1234, exitCode: null, endedAt: null }))).toBe('Process observed');
  });

  it('returns not observed for fresh run', () => {
    expect(getRunInvocationStateCopy('en', makeRun({ pid: null, exitCode: null, endedAt: null }))).toBe('Not observed yet');
  });
});

describe('renderNotice', () => {
  it('renders loading notice', () => {
    expect(renderNotice('en', { type: 'loading' })).toContain('Loading');
  });

  it('renders ready notice with counts', () => {
    expect(renderNotice('en', { type: 'ready', adapters: 3, runs: 5 })).toContain('3 adapters');
  });

  it('renders error notice in Chinese', () => {
    expect(renderNotice('zh', { type: 'error', message: 'test error' })).toContain('错误');
  });
});

describe('getPlanDraftTasks', () => {
  it('returns plannedTasks when present', () => {
    const draft = {
      rawInput: 'test', plannerVersion: 'v1', segmentationSource: 'single_fallback',
      cleanedPrompt: 'test', taskTitle: 'Test', taskType: 'general',
      displayCategory: 'General', matchedProfileId: null,
      classificationReason: 'default', mentions: [],
      recommendedAdapterId: null, recommendedModel: null,
      routingSource: 'first_enabled_adapter', confidence: 'high', rationale: 'test',
      plannedTasks: [
        { rawInput: 'a', cleanedPrompt: 'a', taskTitle: 'A', taskType: 'code', displayCategory: 'Code', matchedProfileId: null, classificationReason: 'keyword', mentions: [], recommendedAdapterId: 'claude', recommendedModel: 'sonnet', routingSource: 'task_type_rule', confidence: 'high', rationale: 'test' }
      ]
    } as PlanDraft;
    expect(getPlanDraftTasks(draft)).toHaveLength(1);
    expect(getPlanDraftTasks(draft)[0]?.taskTitle).toBe('A');
  });

  it('creates a single fallback task when plannedTasks is empty', () => {
    const draft = {
      rawInput: 'test', plannerVersion: 'v1', segmentationSource: 'single_fallback',
      cleanedPrompt: 'test', taskTitle: 'Fallback', taskType: 'general',
      displayCategory: 'General', matchedProfileId: null,
      classificationReason: 'default', mentions: [],
      recommendedAdapterId: null, recommendedModel: null,
      routingSource: 'first_enabled_adapter', confidence: 'high', rationale: 'test',
      plannedTasks: []
    } as PlanDraft;
    const result = getPlanDraftTasks(draft);
    expect(result).toHaveLength(1);
    expect(result[0]?.taskTitle).toBe('Fallback');
  });
});
