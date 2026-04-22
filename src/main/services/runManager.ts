import { execFileSync, spawn, type ChildProcessByStdio } from 'node:child_process';
import path from 'node:path';
import type { Readable, Writable } from 'node:stream';
import type {
  AppState,
  CancelRunInput,
  CancelRunResult,
  CliAdapter,
  Conversation,
  CreateDraftConversationInput,
  CreateDraftConversationResult,
  ExecutionTranscriptEntry,
  RunEvent,
  RunSession,
  RunStatus,
  RunTerminalStatus,
  StartRunInput,
  StartRunResult,
  Task,
  TaskStatus,
} from '../../shared/domain.js';
import { stripAnsi } from '../../shared/stripAnsi.js';
import type { AgentRegistryService } from './agentRegistryService.js';
import type { AdapterManager, CliAdapterConfig } from './adapterManager.js';
import type { OrchestrationExecutionService } from './orchestrationExecutionService.js';
import type { StateManager } from './stateManager.js';

type ManagedChildProcess = ChildProcessByStdio<Writable | null, Readable | null, Readable | null>;
type MutableRunPhase = 'pending' | 'running' | 'terminating';
type RequestedTerminalStatus = Extract<RunTerminalStatus, 'cancelled' | 'timed_out'>;

interface TemplateContext {
  adapterId: string;
  conversationId: string;
  model: string;
  prompt: string;
  runId: string;
  taskId: string;
  title: string;
}

interface RunExecution {
  child: ManagedChildProcess;
  phase: MutableRunPhase;
  requestedTerminalStatus: RequestedTerminalStatus | null;
  spawnError: string | null;
  timeoutId: NodeJS.Timeout | null;
  timeoutMs: number | null;
}

interface AppendTranscriptInput {
  actor: ExecutionTranscriptEntry['actor'];
  kind: ExecutionTranscriptEntry['kind'];
  status: ExecutionTranscriptEntry['status'];
  label: string;
  summary: string;
  detail?: string | null;
  stepId?: string | null;
}

interface ParsedCodexEvent {
  type?: string;
  item?: {
    type?: string;
    command?: string;
    text?: string;
    aggregated_output?: string;
    status?: string;
  };
}

const createId = (prefix: string): string => `${prefix}-${crypto.randomUUID()}`;
const getPrimaryStepId = (runId: string): string => `step-${runId}-primary`;

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

const PLACEHOLDER_PATTERN = /{{\s*([a-zA-Z][a-zA-Z0-9]*)\s*}}/g;
const renderTemplateString = (value: string, context: TemplateContext): string => {
  return value.replaceAll(PLACEHOLDER_PATTERN, (_match, key: keyof TemplateContext) => context[key]);
};

const stripEmptyFlagValuePairs = (args: string[]): string[] => {
  const result: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const current = args[i];
    if (current === undefined) continue;
    const next = args[i + 1];
    if (current.startsWith('-') && next?.trim() === '') {
      i++;
      continue;
    }
    if (current.trim() === '') continue;
    result.push(current);
  }
  return result;
};

const shouldUseShell = (command: string): boolean => {
  if (process.platform !== 'win32') return false;
  if (command === process.execPath) return false;
  const extension = path.extname(command).toLowerCase();
  return extension !== '.exe' && extension !== '.com';
};

const quoteShellArgument = (value: string): string => {
  if (value.length === 0) return '""';
  if (!/[\s"]/u.test(value)) return value;
  return `"${value.replaceAll('"', '""')}"`;
};

const buildShellCommand = (command: string, args: string[]): string => {
  return [quoteShellArgument(command), ...args.map((arg) => quoteShellArgument(arg))].join(' ');
};

const formatCommandPreview = (command: string, args: string[]): string => {
  return [command, ...args]
    .map((part) => (part === '' ? '""' : /\s/.test(part) ? JSON.stringify(part) : part))
    .join(' ');
};

const formatManualHandoffInstructions = (adapter: Pick<CliAdapter, 'displayName' | 'id'>, model: string | null, prompt: string): string => {
  const modelLine = model ? `Model: ${model}` : 'Model: use the editor tool default';
  return [
    `Manual handoff prepared for ${adapter.displayName}.`,
    '',
    '1. Open the target editor/tool.',
    '2. Open this repository root.',
    `3. Paste the task below into ${adapter.displayName}.`,
    '',
    modelLine,
    '',
    'Prompt:',
    prompt,
  ].join('\n');
};

const terminateProcessTree = (child: ManagedChildProcess): void => {
  if (process.platform === 'win32' && child.pid) {
    try {
      execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      return;
    } catch {
      // fall back below
    }
  }
  if (!child.killed) {
    child.kill();
  }
};

const tryParseJsonObject = (value: string): Record<string, unknown> | null => {
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

export class RunManager {
  private readonly executions = new Map<string, RunExecution>();

  public constructor(
    private readonly rootDir: string,
    private readonly stateManager: StateManager,
    private readonly adapterManager: AdapterManager,
    private readonly agentRegistry: AgentRegistryService,
    private readonly orchestrationExecution: OrchestrationExecutionService,
  ) {}

  public createDraftConversation(input: CreateDraftConversationInput): CreateDraftConversationResult {
    const conversation = this.buildConversation(input);
    this.stateManager.updateState((currentState) => ({
      ...currentState,
      conversations: [conversation, ...currentState.conversations],
    }));
    return { conversation: structuredClone(conversation) };
  }

  public startRun(input: StartRunInput): StartRunResult {
    const prompt = input.prompt.trim();
    const title = input.title.trim();
    if (!prompt) throw new Error('Run prompt is required.');
    if (!title) throw new Error('Run title is required.');

    const { config: adapterConfig, adapter } = this.adapterManager.resolveAdapter(input.adapterId);
    if (!this.adapterManager.canLaunchAdapter(adapter, adapterConfig)) {
      const reason = adapter.availability !== 'available'
        ? 'is not available on this machine.'
        : adapter.visibility === 'internal'
          ? 'is reserved for internal verification only.'
          : 'is disabled in routing settings.';
      throw new Error(`Adapter ${adapterConfig.displayName} ${reason}`);
    }

    if (adapter.id === 'opencode' && adapter.readiness === 'blocked_by_environment' && /session not found/i.test(adapter.readinessReason)) {
      throw new Error('Adapter OpenCode CLI cannot launch because the local OpenCode session context is currently blocked. Resolve the `Session not found` environment issue before retrying.');
    }

    const timeoutMs = normalizeTimeoutMs(input.timeoutMs ?? adapterConfig.defaultTimeoutMs, 'Run timeoutMs');
    const conversation = this.resolveConversation(input, title, prompt);
    const createdAt = new Date().toISOString();
    const taskId = createId('task');
    const runId = createId('run');
    const templateContext: TemplateContext = {
      adapterId: adapter.id,
      conversationId: conversation.id,
      model: normalizeOptionalString(input.model) ?? adapter.defaultModel ?? '',
      prompt,
      runId,
      taskId,
      title,
    };
    const args = stripEmptyFlagValuePairs(adapterConfig.args.map((value) => renderTemplateString(value, templateContext)));
    const commandPreview = adapterConfig.launchMode === 'manual_handoff'
      ? formatManualHandoffInstructions(adapter, normalizeOptionalString(templateContext.model), prompt)
      : formatCommandPreview(adapter.command, args);
    const task: Task = {
      id: taskId,
      title,
      summary: prompt,
      status: 'running',
      taskType: input.taskType ?? 'general',
      profileId: input.profileId ?? null,
      adapterId: adapter.id,
      requestedBy: 'Desktop Operator',
      sourceConversationId: conversation.id,
      cliMention: `@${adapter.id}`,
      runId,
    };
    const run: RunSession = {
      id: runId,
      taskId,
      adapterId: adapter.id,
      model: normalizeOptionalString(templateContext.model),
      status: 'pending',
      startedAt: createdAt,
      activeConversationId: conversation.id,
      commandPreview,
      pid: null,
      timeoutMs,
      cancelRequestedAt: null,
      exitCode: null,
      endedAt: null,
      events: [],
      transcript: [],
    };

    this.stateManager.updateState((currentState) => ({
      ...currentState,
      tasks: [task, ...currentState.tasks],
      runs: [run, ...currentState.runs],
      conversations: currentState.conversations.map((entry) => (entry.id !== conversation.id ? entry : { ...entry, updatedAt: createdAt, draftInput: prompt })),
    }));

    this.appendRunEvent(runId, 'info', `Starting ${adapter.displayName}.`);
    this.appendTranscriptEntry(runId, {
      actor: 'system', kind: 'run_started', status: 'completed', label: title, summary: `Queued task for ${adapter.displayName}.`, detail: prompt,
    });
    this.appendTranscriptEntry(runId, {
      actor: 'tool', kind: 'step_started', status: 'running', label: adapter.displayName,
      summary: `Launching ${adapter.displayName}${templateContext.model ? ` with model ${templateContext.model}` : ''}.`, detail: commandPreview, stepId: getPrimaryStepId(runId),
    });

    if (adapterConfig.launchMode === 'manual_handoff') {
      this.completeManualHandoffRun(runId, taskId, adapter, normalizeOptionalString(templateContext.model), prompt);
    } else {
      this.spawnRun(runId, taskId, adapterConfig, templateContext, timeoutMs);
    }

    return { run: this.stateManager.getRun(runId), task: this.stateManager.getTask(taskId) };
  }

  public cancelRun(input: CancelRunInput): CancelRunResult {
    const run = this.stateManager.getRun(input.runId);
    const task = this.stateManager.getTask(run.taskId);
    if (!this.isRunMutable(run.status)) throw new Error(`Run ${run.id} is already ${run.status}.`);
    this.requestTermination(run.id, 'cancelled', 'Cancellation requested by renderer.');
    return { run: this.stateManager.getRun(run.id), task: this.stateManager.getTask(task.id) };
  }

  public requestRunTermination(runId: string, status: RequestedTerminalStatus, message: string): void {
    this.requestTermination(runId, status, message);
  }

  public getRecentRunsByCategory(taskType: string, limit = 5): { taskType: string; recentRuns: { runId: string; adapterId: string; model: string | null; status: string; startedAt: string }[] } {
    const state = this.stateManager.getState();
    const matchingTasks = state.tasks.filter((task) => task.taskType === taskType);
    const taskRunIds = new Set(matchingTasks.map((task) => task.runId));
    const matchingRuns = state.runs.filter((run) => taskRunIds.has(run.id)).sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, limit);
    return {
      taskType,
      recentRuns: matchingRuns.map((run) => ({ runId: run.id, adapterId: run.adapterId, model: run.model, status: run.status, startedAt: run.startedAt })),
    };
  }

  private resolveConversation(input: StartRunInput, title: string, prompt: string): Conversation {
    if (input.conversationId) {
      const existing = this.stateManager.getState().conversations.find((entry) => entry.id === input.conversationId);
      if (existing) return existing;
    }

    const conversation = this.buildConversation({ title, message: prompt });
    this.stateManager.updateState((currentState) => ({ ...currentState, conversations: [conversation, ...currentState.conversations] }));
    return conversation;
  }

  private buildConversation(input: CreateDraftConversationInput): Conversation {
    const trimmedTitle = input.title.trim();
    const trimmedMessage = input.message.trim();
    if (!trimmedTitle) throw new Error('Draft title is required.');
    if (!trimmedMessage) throw new Error('Draft message is required.');
    const createdAt = new Date().toISOString();
    return {
      id: createId('conv'),
      title: trimmedTitle,
      createdAt,
      updatedAt: createdAt,
      draftInput: trimmedMessage,
      messages: [{ id: createId('msg'), role: 'customer', content: trimmedMessage, createdAt }],
    };
  }

  private pipeRunOutput(runId: string, stream: NodeJS.ReadableStream, level: Extract<RunEvent['level'], 'stdout' | 'stderr'>): void {
    let pending = '';
    stream.on('data', (chunk: Buffer | string) => {
      pending += chunk.toString();
      const normalized = pending.replaceAll('\r\n', '\n');
      const lines = normalized.split('\n');
      pending = lines.pop() ?? '';
      lines.forEach((line) => {
        const message = stripAnsi(line.trim());
        if (message) {
          this.appendRunEvent(runId, level, message);
          this.appendTranscriptFromOutput(runId, level, message);
        }
      });
    });
    stream.on('end', () => {
      const message = stripAnsi(pending.trim());
      if (message) {
        this.appendRunEvent(runId, level, message);
        this.appendTranscriptFromOutput(runId, level, message);
      }
    });
  }

  private spawnRun(runId: string, taskId: string, adapterConfig: CliAdapterConfig, templateContext: TemplateContext, timeoutMs: number | null): void {
    const command = this.adapterManager.resolveAdapter(adapterConfig.id).adapter.command;
    const args = stripEmptyFlagValuePairs(adapterConfig.args.map((value) => renderTemplateString(value, templateContext)));
    const useShell = shouldUseShell(command);
    const child = spawn(useShell ? buildShellCommand(command, args) : command, useShell ? [] : args, {
      cwd: this.rootDir,
      env: process.env,
      shell: useShell,
      windowsHide: true,
      stdio: [adapterConfig.promptTransport === 'stdin' ? 'pipe' : 'ignore', 'pipe', 'pipe'],
    });
    const execution: RunExecution = { child, phase: 'pending', requestedTerminalStatus: null, spawnError: null, timeoutId: null, timeoutMs };
    this.executions.set(runId, execution);

    if (adapterConfig.promptTransport === 'stdin' && child.stdin) {
      child.stdin.once('error', (error) => {
        if ((error as NodeJS.ErrnoException).code === 'EPIPE') {
          this.appendRunEvent(runId, 'warning', 'Process stdin closed before the prompt payload was fully written.');
          return;
        }
        this.appendRunEvent(runId, 'error', error.message);
      });
      try {
        child.stdin.write(`${templateContext.prompt}\n`);
        child.stdin.end();
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Failed to write prompt payload to stdin.';
        this.appendRunEvent(runId, 'error', message);
      }
    }

    if (child.stdout) this.pipeRunOutput(runId, child.stdout, 'stdout');
    if (child.stderr) this.pipeRunOutput(runId, child.stderr, 'stderr');

    child.once('spawn', () => {
      const current = this.executions.get(runId);
      if (!current) return;
      current.phase = current.requestedTerminalStatus ? 'terminating' : 'running';
      this.updateRun(runId, (run) => ({ ...run, status: 'running', pid: child.pid ?? null }));
      this.appendRunEvent(runId, 'success', `Process started${child.pid ? ` with pid ${child.pid}` : ''}.`);
      this.appendTranscriptEntry(runId, {
        actor: 'tool', kind: 'step_output', status: 'info', label: adapterConfig.displayName,
        summary: `Process started${child.pid ? ` with pid ${child.pid}` : ''}.`, stepId: getPrimaryStepId(runId),
      });
    });

    child.on('error', (error) => {
      const current = this.executions.get(runId);
      if (!current) return;
      current.spawnError = error.message;
      this.appendRunEvent(runId, 'error', error.message);
      this.appendTranscriptEntry(runId, {
        actor: 'tool', kind: 'step_failed', status: 'failed', label: adapterConfig.displayName, summary: error.message, stepId: getPrimaryStepId(runId),
      });
    });

    child.on('close', (code, signal) => {
      this.finalizeRunOnClose(runId, taskId, code, signal);
    });

    if (timeoutMs !== null) {
      execution.timeoutId = setTimeout(() => {
        this.requestTermination(runId, 'timed_out', `Run exceeded timeout of ${timeoutMs} ms.`);
      }, timeoutMs);
    }
  }

  private completeManualHandoffRun(runId: string, taskId: string, adapter: CliAdapter, model: string | null, prompt: string): void {
    const instructionMessage = formatManualHandoffInstructions(adapter, model, prompt);
    const completedAt = new Date().toISOString();
    this.appendRunEvent(runId, 'info', 'Manual handoff is ready. Copy the prompt into the selected tool to continue.');
    this.appendTranscriptEntry(runId, {
      actor: 'tool', kind: 'step_completed', status: 'completed', label: adapter.displayName, summary: 'Prepared a manual handoff package for the selected editor tool.', detail: instructionMessage, stepId: getPrimaryStepId(runId),
    });
    this.appendTranscriptEntry(runId, {
      actor: 'system', kind: 'run_completed', status: 'completed', label: taskId, summary: 'Manual handoff package is ready for copy/paste execution.', detail: instructionMessage,
    });
    this.stateManager.updateState((currentState) => ({
      ...currentState,
      runs: currentState.runs.map((run) => (run.id !== runId ? run : { ...run, status: 'succeeded', exitCode: 0, endedAt: completedAt })),
      tasks: currentState.tasks.map((task) => (task.id !== taskId ? task : { ...task, status: 'completed' })),
    }));
    this.orchestrationExecution.onRunCompleted(runId, 'succeeded', this.agentRegistry.getAll());
  }

  private requestTermination(runId: string, status: RequestedTerminalStatus, message: string): void {
    const execution = this.executions.get(runId);
    if (!execution || execution.requestedTerminalStatus) return;
    execution.requestedTerminalStatus = status;
    execution.phase = 'terminating';
    if (status === 'cancelled') {
      const cancelRequestedAt = new Date().toISOString();
      this.updateRun(runId, (run) => ({ ...run, cancelRequestedAt }));
    }
    this.appendRunEvent(runId, status === 'timed_out' ? 'warning' : 'info', message);
    this.appendTranscriptEntry(runId, {
      actor: 'system', kind: 'step_output', status: status === 'timed_out' ? 'failed' : 'info', label: status === 'timed_out' ? 'Timeout requested' : 'Cancellation requested', summary: message, stepId: getPrimaryStepId(runId),
    });
    terminateProcessTree(execution.child);
  }

  private finalizeRunOnClose(runId: string, taskId: string, code: number | null, signal: NodeJS.Signals | null): void {
    const execution = this.executions.get(runId);
    const existingRun = this.stateManager.getState().runs.find((run) => run.id === runId);
    if (!execution || !existingRun || !this.isRunMutable(existingRun.status)) return;
    if (execution.timeoutId) clearTimeout(execution.timeoutId);
    const status = this.resolveTerminalStatus(execution, code);
    const endedAt = new Date().toISOString();
    const taskStatus = this.mapTaskStatus(status);
    const terminalMessage = this.getTerminalMessage(existingRun, status, code, signal, execution.timeoutMs);
    this.appendRunEvent(runId, this.getTerminalLevel(status), terminalMessage);
    this.appendTranscriptEntry(runId, {
      actor: 'tool', kind: status === 'succeeded' ? 'step_completed' : 'step_failed', status: status === 'succeeded' ? 'completed' : 'failed', label: existingRun.model ? `${existingRun.adapterId} (${existingRun.model})` : existingRun.adapterId, summary: terminalMessage, stepId: getPrimaryStepId(runId),
    });
    this.appendTranscriptEntry(runId, {
      actor: 'system', kind: status === 'succeeded' ? 'run_completed' : 'run_failed', status: status === 'succeeded' ? 'completed' : 'failed', label: existingRun.taskId, summary: terminalMessage, detail: existingRun.commandPreview,
    });
    this.stateManager.updateState((currentState) => ({
      ...currentState,
      runs: currentState.runs.map((run) => (run.id !== runId ? run : { ...run, status, exitCode: code, endedAt })),
      tasks: currentState.tasks.map((task) => (task.id !== taskId ? task : { ...task, status: taskStatus })),
    }));
    this.captureHandoffArtifact(runId, status);
    this.executions.delete(runId);
    this.stateManager.refreshDerivedState();
    this.orchestrationExecution.onRunCompleted(runId, status, this.agentRegistry.getAll());
  }

  private resolveTerminalStatus(execution: RunExecution, code: number | null): RunTerminalStatus {
    if (execution.spawnError) return 'spawn_failed';
    if (execution.requestedTerminalStatus) return execution.requestedTerminalStatus;
    return code === 0 ? 'succeeded' : 'failed';
  }

  private mapTaskStatus(status: RunTerminalStatus): TaskStatus {
    switch (status) {
      case 'succeeded': return 'completed';
      case 'interrupted': return 'interrupted';
      case 'failed': return 'failed';
      case 'cancelled': return 'cancelled';
      case 'timed_out': return 'timed_out';
      case 'spawn_failed': return 'spawn_failed';
    }
  }

  private getTerminalLevel(status: RunTerminalStatus): RunEvent['level'] {
    switch (status) {
      case 'succeeded': return 'success';
      case 'interrupted':
      case 'timed_out': return 'warning';
      case 'cancelled': return 'info';
      case 'failed':
      case 'spawn_failed': return 'error';
    }
  }

  private getTerminalMessage(run: RunSession, status: RunTerminalStatus, code: number | null, signal: NodeJS.Signals | null, timeoutMs: number | null): string {
    switch (status) {
      case 'succeeded': return 'Process completed successfully.';
      case 'interrupted': return 'Process was interrupted by an application restart and cannot be resumed.';
      case 'spawn_failed': return 'Process failed to start. Check that the CLI tool is installed and accessible in your PATH.';
      case 'failed':
        if (run.adapterId === 'opencode') {
          const stderrDetail = this.getLatestStderrDetail(run);
          if (stderrDetail) {
            return `Process exited with code ${code ?? 'unknown'}${signal ? ` (signal: ${signal})` : ''}. ${stderrDetail}`;
          }
          return `Process exited with code ${code ?? 'unknown'}${signal ? ` (signal: ${signal})` : ''}. OpenCode is installed, but this environment is currently missing a usable local session/server context.`;
        }
        return `Process exited with code ${code ?? 'unknown'}${signal ? ` (signal: ${signal})` : ''}. Check the stderr output above for details.`;
      case 'cancelled': return `Process cancelled by user${signal ? ` (signal: ${signal})` : ''}.`;
      case 'timed_out':
        if (run.adapterId === 'claude') {
          return `Process timed out after ${timeoutMs ? `${Math.round(timeoutMs / 1000)}s` : 'unknown duration'}. Claude Code is installed and authenticated, but this environment is not completing the current non-interactive run path reliably.`;
        }
        return `Process timed out after ${timeoutMs ? `${Math.round(timeoutMs / 1000)}s` : 'unknown duration'}. Consider increasing the timeout or simplifying the prompt.`;
    }
  }

  private getLatestStderrDetail(run: RunSession): string | null {
    const latestStderrEvent = [...run.events].sort((left, right) => right.timestamp.localeCompare(left.timestamp)).find((event) => event.level === 'stderr');
    return latestStderrEvent?.message ?? null;
  }

  private isRunMutable(status: RunStatus): boolean {
    return status === 'pending' || status === 'running';
  }

  private updateRun(runId: string, updater: (run: RunSession) => RunSession): void {
    this.stateManager.updateState((currentState) => ({
      ...currentState,
      runs: currentState.runs.map((run) => (run.id === runId ? updater(run) : run)),
    }));
  }

  private appendRunEvent(runId: string, level: RunEvent['level'], message: string): void {
    const event: RunEvent = { id: createId('evt'), runId, level, timestamp: new Date().toISOString(), message };
    this.stateManager.updateState((currentState) => ({
      ...currentState,
      runs: currentState.runs.map((run) => (run.id !== runId ? run : { ...run, events: [...run.events, event] })),
    }));
    this.stateManager.emitRunEvent(event);
  }

  private appendTranscriptEntry(runId: string, input: AppendTranscriptInput): void {
    const entry: ExecutionTranscriptEntry = {
      id: createId('tx'),
      runId,
      stepId: input.stepId ?? null,
      actor: input.actor,
      kind: input.kind,
      status: input.status,
      timestamp: new Date().toISOString(),
      label: input.label,
      summary: input.summary,
      detail: input.detail ?? null,
    };
    this.stateManager.updateState((currentState) => ({
      ...currentState,
      runs: currentState.runs.map((run) => (run.id !== runId ? run : { ...run, transcript: [...run.transcript, entry] })),
    }));
  }

  private appendTranscriptFromOutput(runId: string, level: Extract<RunEvent['level'], 'stdout' | 'stderr'>, message: string): void {
    const run = this.stateManager.getState().runs.find((entry) => entry.id === runId);
    const parsed = level === 'stdout' ? (tryParseJsonObject(message) as ParsedCodexEvent | null) : null;
    if (run?.adapterId === 'codex' && parsed?.type === 'item.completed' && parsed.item?.type === 'agent_message') {
      this.appendTranscriptEntry(runId, { actor: 'assistant', kind: 'step_output', status: 'info', label: 'Codex response', summary: parsed.item.text ?? message, stepId: getPrimaryStepId(runId) });
      return;
    }
    if (run?.adapterId === 'codex' && parsed?.type === 'item.started' && parsed.item?.type === 'command_execution') {
      this.appendTranscriptEntry(runId, { actor: 'tool', kind: 'step_output', status: 'running', label: 'Codex command', summary: parsed.item.command ?? 'Executing command', stepId: getPrimaryStepId(runId) });
      return;
    }
    if (run?.adapterId === 'codex' && parsed?.type === 'item.completed' && parsed.item?.type === 'command_execution') {
      this.appendTranscriptEntry(runId, { actor: 'tool', kind: parsed.item.status === 'failed' ? 'step_failed' : 'step_completed', status: parsed.item.status === 'failed' ? 'failed' : 'completed', label: 'Codex command', summary: parsed.item.aggregated_output || parsed.item.command || 'Command completed', detail: parsed.item.command ?? null, stepId: getPrimaryStepId(runId) });
      return;
    }
    this.appendTranscriptEntry(runId, { actor: 'tool', kind: 'step_output', status: level === 'stderr' ? 'failed' : 'info', label: level === 'stderr' ? 'Stderr' : 'Stdout', summary: message, stepId: getPrimaryStepId(runId) });
  }

  private captureHandoffArtifact(runId: string, status: RunTerminalStatus): void {
    const state = this.stateManager.getState();
    const run = state.runs.find((entry) => entry.id === runId);
    if (!run) return;
    const currentNode = state.orchestrationNodes.find((entry) => entry.runId === runId) ?? null;
    const currentOrchestrationRun = currentNode ? (state.orchestrationRuns.find((entry) => entry.id === currentNode.orchestrationRunId) ?? null) : null;
    const changedFiles = this.getChangedFiles();
    const diffStat = this.getDiffStat();
    const transcriptSummary = run.transcript.slice(-6).map((entry) => entry.summary).filter((summary) => summary.trim().length > 0).join(' | ');
    const reviewNotes = this.deriveReviewNotes(run, currentNode, currentOrchestrationRun, changedFiles, diffStat, transcriptSummary);
    const nextClaudeTask = this.deriveNextClaudeTask(currentNode, currentOrchestrationRun, reviewNotes, changedFiles, diffStat);
    this.stateManager.updateState((currentState) => ({
      ...currentState,
      nextClaudeTask,
      orchestrationNodes: currentState.orchestrationNodes.map((node) => (node.runId !== runId ? node : {
        ...node,
        resultPayload: {
          kind: 'run_handoff',
          runId,
          adapterId: run.adapterId,
          model: run.model,
          status,
          changedFiles,
          diffStat,
          transcriptSummary: transcriptSummary.length > 0 ? transcriptSummary : null,
          reviewNotes,
          generatedAt: new Date().toISOString(),
        },
      })),
    }));
  }

  private deriveReviewNotes(
    run: RunSession,
    node: AppState['orchestrationNodes'][number] | null,
    orchestrationRun: AppState['orchestrationRuns'][number] | null,
    changedFiles: string[],
    diffStat: string | null,
    transcriptSummary: string,
  ): string[] {
    if (!node || !orchestrationRun || node.title !== 'Review and write handoff') return [];
    const notes: string[] = [];
    if (changedFiles.length > 0) notes.push(`Focus on changed files: ${changedFiles.join(', ')}`);
    if (diffStat) notes.push(`Diff stat: ${diffStat}`);
    if (transcriptSummary.trim().length > 0) notes.push(`Latest review transcript summary: ${transcriptSummary}`);
    if (run.status !== 'succeeded') notes.push(`Reviewer run ended with status ${run.status}; inspect repository artifacts before continuing.`);
    notes.push('Read debug-review-and-optimization-plan.md and optimization-results.md before the next Claude revision.');
    return notes;
  }

  private deriveNextClaudeTask(
    node: AppState['orchestrationNodes'][number] | null,
    orchestrationRun: AppState['orchestrationRuns'][number] | null,
    reviewNotes: string[],
    changedFiles: string[],
    diffStat: string | null,
  ): AppState['nextClaudeTask'] {
    if (!node || !orchestrationRun || node.title !== 'Review and write handoff' || reviewNotes.length === 0) {
      return this.stateManager.getState().nextClaudeTask;
    }
    const promptParts = [
      'Continue the task by following the latest OpenCode review results.',
      `Original goal: ${orchestrationRun.rootPrompt}`,
      'Mandatory inputs:',
      '- Read debug-review-and-optimization-plan.md',
      '- Read optimization-results.md',
      '',
      'Review-driven next steps:',
      ...reviewNotes.map((note) => `- ${note}`),
    ];
    if (changedFiles.length > 0) promptParts.push('', `Current changed files: ${changedFiles.join(', ')}`);
    if (diffStat) promptParts.push(`Current diff stat: ${diffStat}`);
    promptParts.push('', 'Do not restart the project analysis from scratch. Only address the remaining issues from the latest review and re-run the normal validation commands when finished.');
    return {
      prompt: promptParts.join('\n'),
      sourceOrchestrationRunId: orchestrationRun.id,
      generatedAt: new Date().toISOString(),
      status: 'ready',
    };
  }

  private getChangedFiles(): string[] {
    try {
      const output = execFileSync('git', ['status', '--short', '--untracked-files=all'], { cwd: this.rootDir, windowsHide: true, encoding: 'utf8' });
      return output.split(/\r?\n/).map((line) => line.trimEnd()).filter((line) => line.length > 3).map((line) => line.slice(3).trim()).filter((line) => line.length > 0);
    } catch {
      return [];
    }
  }

  private getDiffStat(): string | null {
    try {
      const output = execFileSync('git', ['diff', '--stat'], { cwd: this.rootDir, windowsHide: true, encoding: 'utf8' }).trim();
      return output.length > 0 ? output : null;
    } catch {
      return null;
    }
  }
}
