import type {
  BrowseWorkspaceInput,
  ApplyWorkspaceFileInput,
  CallCliAgentInput,
  CliAgentContext,
  CancelOrchestrationInput,
  CancelRunInput,
  CreateDraftConversationInput,
  DeleteAgentProfileInput,
  DeleteMcpServerInput,
  DeleteSkillInput,
  GetOrchestrationRunInput,
  LocalToolCallInput,
  PlanDraftInput,
  ReadWorkspaceFileInput,
  RendererContinuityState,
  SaveProjectContextInput,
  SaveWorkbenchStateInput,
  StartOrchestrationInput,
  StartRunInput,
  StartTerminalInput,
  StopTerminalInput,
  WriteTerminalInput,
  UpdateRoutingSettingsInput,
  WriteWorkspaceFileInput,
} from '../shared/domain.js';
import type { SavePromptBuilderConfigInput } from '../shared/promptBuilder.js';
import type { SaveAiConfigInput } from '../shared/ipc.js';

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

export class IpcValidationError extends Error {
  public readonly code = 'IPC_VALIDATION_ERROR';

  public constructor(message: string) {
    super(message);
    this.name = 'IpcValidationError';
  }
}

const assertRecord = (value: unknown, label: string): Record<string, unknown> => {
  if (!isRecord(value)) {
    throw new IpcValidationError(`${label} must be an object.`);
  }

  return value;
};

const assertString = (value: unknown, label: string): string => {
  if (typeof value !== 'string') {
    throw new IpcValidationError(`${label} must be a string.`);
  }

  return value;
};

const assertOptionalString = (value: unknown, label: string): string | null => {
  if (value === undefined || value === null) {
    return null;
  }

  return assertString(value, label);
};

const assertOptionalNumber = (value: unknown, label: string): number | null => {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new IpcValidationError(`${label} must be a number.`);
  }

  return value;
};

const assertOptionalBoolean = (value: unknown, label: string): boolean | null => {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== 'boolean') {
    throw new IpcValidationError(`${label} must be a boolean.`);
  }

  return value;
};

type ValidatorField<T> = {
  [K in keyof T]: {
    name: K;
    assert: (value: unknown, label: string) => T[K];
    label: string;
  };
}[keyof T];

const createValidator = <T extends object>(
  objectLabel: string,
  fields: ValidatorField<T>[],
  options: { allowUndefinedInput?: boolean } = {},
): (value: unknown) => T => {
  return (value: unknown): T => {
    const input = value === undefined && options.allowUndefinedInput ? {} : assertRecord(value, objectLabel);
    const output: Partial<T> = {};

    fields.forEach((field) => {
      output[field.name] = field.assert(input[field.name as string], field.label) as T[keyof T];
    });

    return output as T;
  };
};

export const validateObjectInput = (value: unknown, label: string): Record<string, unknown> => {
  return assertRecord(value, label);
};

export const validateSaveContinuityStateInput = (value: unknown): RendererContinuityState => {
  const input = assertRecord(value, 'continuity state');
  if ('locale' in input && input.locale !== 'en' && input.locale !== 'zh') {
    throw new IpcValidationError('continuity state locale must be "en" or "zh".');
  }

  return input as unknown as RendererContinuityState;
};

export const validateRoutingSettingsInput = (value: unknown): UpdateRoutingSettingsInput => {
  const input = assertRecord(value, 'routing settings input');
  assertRecord(input.settings, 'routing settings input.settings');
  return input as unknown as UpdateRoutingSettingsInput;
};

export const validateProjectContextInput = createValidator<SaveProjectContextInput>('project context input', [
  { name: 'summary', assert: assertString, label: 'project context input.summary' },
]);

export const validateWorkbenchStateInput = (value: unknown): SaveWorkbenchStateInput => {
  const input = assertRecord(value, 'workbench state input');
  assertRecord(input.state, 'workbench state input.state');
  return input as unknown as SaveWorkbenchStateInput;
};

export const validatePromptBuilderSaveInput = (value: unknown): SavePromptBuilderConfigInput => {
  const input = assertRecord(value, 'prompt builder save input');
  assertRecord(input.config, 'prompt builder save input.config');
  return input as unknown as SavePromptBuilderConfigInput;
};

export const validateSaveAiConfigInput = (value: unknown): SaveAiConfigInput => {
  const input = assertRecord(value, 'save ai config input');
  assertRecord(input.config, 'save ai config input.config');
  return input as unknown as SaveAiConfigInput;
};

export const validateDraftConversationInput = createValidator<CreateDraftConversationInput>('draft conversation input', [
  { name: 'title', assert: assertString, label: 'draft conversation input.title' },
  { name: 'message', assert: assertString, label: 'draft conversation input.message' },
]);

export const validatePlanDraftInput = createValidator<PlanDraftInput>('plan draft input', [
  { name: 'rawInput', assert: assertString, label: 'plan draft input.rawInput' },
]);

export const validateStartRunInput = (value: unknown): StartRunInput => {
  const input = assertRecord(value, 'start run input');
  assertString(input.title, 'start run input.title');
  assertString(input.prompt, 'start run input.prompt');
  assertString(input.adapterId, 'start run input.adapterId');
  assertOptionalString(input.model, 'start run input.model');
  assertOptionalString(input.conversationId, 'start run input.conversationId');
  assertOptionalNumber(input.timeoutMs, 'start run input.timeoutMs');
  return input as unknown as StartRunInput;
};

export const validateCancelRunInput = createValidator<CancelRunInput>('cancel run input', [
  { name: 'runId', assert: assertString, label: 'cancel run input.runId' },
]);

export const validateRecentRunsInput = (value: unknown): { taskType: string; limit?: number } => {
  const input = assertRecord(value, 'recent runs input');
  const taskType = assertString(input.taskType, 'recent runs input.taskType');
  const limit = input.limit === undefined ? undefined : assertOptionalNumber(input.limit, 'recent runs input.limit') ?? undefined;
  return { taskType, ...(limit !== undefined ? { limit } : {}) };
};

export const validateStartTerminalInput = createValidator<StartTerminalInput>('start terminal input', [
  { name: 'cwd', assert: assertOptionalString, label: 'start terminal input.cwd' },
], { allowUndefinedInput: true });

export const validateWriteTerminalInput = (value: unknown): WriteTerminalInput => {
  const input = assertRecord(value, 'write terminal input');
  const data = assertString(input.data, 'write terminal input.data');
  if (data.length > 64 * 1024) {
    throw new IpcValidationError('write terminal input.data must be at most 64KB.');
  }

  return {
    sessionId: assertString(input.sessionId, 'write terminal input.sessionId'),
    data,
  };
};

export const validateStopTerminalInput = createValidator<StopTerminalInput>('stop terminal input', [
  { name: 'sessionId', assert: assertString, label: 'stop terminal input.sessionId' },
]);

const assertOptionalStringArray = (value: unknown, label: string): string[] | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    throw new IpcValidationError(`${label} must be a string array.`);
  }

  return value.filter((entry): entry is string => typeof entry === 'string');
};

const assertOptionalStringRecord = (value: unknown, label: string): Record<string, string> | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }

  const record = assertRecord(value, label);
  return Object.fromEntries(
    Object.entries(record).map(([key, entry]) => {
      if (typeof entry !== 'string') {
        throw new IpcValidationError(`${label}.${key} must be a string.`);
      }

      return [key, entry];
    }),
  );
};

export const validateLocalToolCallInput = (value: unknown): LocalToolCallInput => {
  const input = assertRecord(value, 'local tool call input');
  const args = assertOptionalStringArray(input.args, 'local tool call input.args');
  const env = assertOptionalStringRecord(input.env, 'local tool call input.env');
  const timeoutMs = assertOptionalNumber(input.timeoutMs, 'local tool call input.timeoutMs');
  if (timeoutMs !== null && timeoutMs <= 0) {
    throw new IpcValidationError('local tool call input.timeoutMs must be positive when provided.');
  }

  return {
    toolName: assertString(input.toolName, 'local tool call input.toolName'),
    ...(args ? { args } : {}),
    cwd: assertOptionalString(input.cwd, 'local tool call input.cwd'),
    stdin: assertOptionalString(input.stdin, 'local tool call input.stdin'),
    timeoutMs,
    ...(env ? { env } : {}),
    profileId: assertOptionalString(input.profileId, 'local tool call input.profileId'),
    runId: assertOptionalString(input.runId, 'local tool call input.runId'),
    orchestrationNodeId: assertOptionalString(input.orchestrationNodeId, 'local tool call input.orchestrationNodeId'),
  };
};

const validateCliAgentContext = (value: unknown): CliAgentContext | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }

  const input = assertRecord(value, 'cli agent context');
  const taskType = input.taskType;
  const validTaskTypes = new Set(['general', 'planning', 'code', 'frontend', 'research', 'git', 'ops']);
  if (taskType !== undefined && taskType !== null && (typeof taskType !== 'string' || !validTaskTypes.has(taskType))) {
    throw new IpcValidationError('cli agent context.taskType must be a valid task type.');
  }
  const timeoutMs = assertOptionalNumber(input.timeoutMs, 'cli agent context.timeoutMs');
  if (timeoutMs !== null && timeoutMs <= 0) {
    throw new IpcValidationError('cli agent context.timeoutMs must be positive when provided.');
  }
  const metadata = assertOptionalStringRecord(input.metadata, 'cli agent context.metadata');
  const normalizedTaskType = typeof taskType === 'string' ? taskType as NonNullable<CliAgentContext['taskType']> : null;

  return {
    workspaceRoot: assertOptionalString(input.workspaceRoot, 'cli agent context.workspaceRoot'),
    taskType: normalizedTaskType,
    model: assertOptionalString(input.model, 'cli agent context.model'),
    timeoutMs,
    ...(metadata ? { metadata } : {}),
  };
};

export const validateCliAgentRouteInput = (value: unknown): { prompt: string; context?: CliAgentContext } => {
  const input = assertRecord(value, 'cli agent route input');
  const context = validateCliAgentContext(input.context);
  return {
    prompt: assertString(input.prompt, 'cli agent route input.prompt'),
    ...(context ? { context } : {}),
  };
};

export const validateCallCliAgentInput = (value: unknown): CallCliAgentInput => {
  const input = assertRecord(value, 'call cli agent input');
  if (input.agent !== 'claude' && input.agent !== 'codex') {
    throw new IpcValidationError('call cli agent input.agent must be "claude" or "codex".');
  }
  const context = validateCliAgentContext(input.context);
  return {
    agent: input.agent,
    prompt: assertString(input.prompt, 'call cli agent input.prompt'),
    ...(context ? { context } : {}),
  };
};

export const validateStartOrchestrationInput = (value: unknown): StartOrchestrationInput => {
  const input = assertRecord(value, 'start orchestration input');
  assertString(input.prompt, 'start orchestration input.prompt');
  if (input.automationMode !== undefined) {
    const validModes = new Set(['standard', 'review_loop', 'discussion']);
    if (typeof input.automationMode !== 'string' || !validModes.has(input.automationMode)) {
      throw new IpcValidationError('start orchestration input.automationMode must be one of standard, review_loop, discussion.');
    }
  }

  if (input.executionStyle !== undefined) {
    const validExecutionStyles = new Set(['planner', 'sequential', 'parallel']);
    if (typeof input.executionStyle !== 'string' || !validExecutionStyles.has(input.executionStyle)) {
      throw new IpcValidationError('start orchestration input.executionStyle must be one of planner, sequential, parallel.');
    }
  }

  if (input.participantProfileIds !== undefined) {
    if (!Array.isArray(input.participantProfileIds) || input.participantProfileIds.some((entry) => typeof entry !== 'string')) {
      throw new IpcValidationError('start orchestration input.participantProfileIds must be a string array.');
    }
  }

  if (input.discussionConfig !== undefined && input.discussionConfig !== null) {
    const discussionConfig = assertRecord(input.discussionConfig, 'start orchestration input.discussionConfig');
    const maxRounds = assertOptionalNumber(discussionConfig.maxRounds, 'start orchestration input.discussionConfig.maxRounds');
    if (maxRounds !== null && maxRounds < 1) {
      throw new IpcValidationError('discussionConfig.maxRounds must be >= 1.');
    }
    const participantsPerRound = assertOptionalNumber(
      discussionConfig.participantsPerRound,
      'start orchestration input.discussionConfig.participantsPerRound',
    );
    if (participantsPerRound !== null && participantsPerRound < 1) {
      throw new IpcValidationError('discussionConfig.participantsPerRound must be >= 1.');
    }
    if (discussionConfig.participantProfileIds !== undefined) {
      if (!Array.isArray(discussionConfig.participantProfileIds) || discussionConfig.participantProfileIds.some((entry) => typeof entry !== 'string')) {
        throw new IpcValidationError('discussionConfig.participantProfileIds must be a string array.');
      }
    }
    if (discussionConfig.consensusStrategy !== undefined) {
      const validStrategies = new Set(['keyword', 'summary_match']);
      if (typeof discussionConfig.consensusStrategy !== 'string' || !validStrategies.has(discussionConfig.consensusStrategy)) {
        throw new IpcValidationError('discussionConfig.consensusStrategy must be one of keyword, summary_match.');
      }
    }
    assertOptionalString(discussionConfig.consensusKeyword, 'start orchestration input.discussionConfig.consensusKeyword');
    assertOptionalBoolean(
      discussionConfig.requireFinalSynthesis,
      'start orchestration input.discussionConfig.requireFinalSynthesis',
    );
  }
  return input as unknown as StartOrchestrationInput;
};

export const validateCancelOrchestrationInput = createValidator<CancelOrchestrationInput>('cancel orchestration input', [
  { name: 'orchestrationRunId', assert: assertString, label: 'cancel orchestration input.orchestrationRunId' },
]);

export const validateGetOrchestrationRunInput = createValidator<GetOrchestrationRunInput>('get orchestration run input', [
  { name: 'orchestrationRunId', assert: assertString, label: 'get orchestration run input.orchestrationRunId' },
]);

export const validateDeleteAgentProfileInput = createValidator<DeleteAgentProfileInput>('delete agent profile input', [
  { name: 'profileId', assert: assertString, label: 'delete agent profile input.profileId' },
]);

export const validateDeleteSkillInput = createValidator<DeleteSkillInput>('delete skill input', [
  { name: 'skillId', assert: assertString, label: 'delete skill input.skillId' },
]);

export const validateDeleteMcpServerInput = createValidator<DeleteMcpServerInput>('delete mcp server input', [
  { name: 'serverId', assert: assertString, label: 'delete mcp server input.serverId' },
]);

export const validateBrowseWorkspaceInput = createValidator<BrowseWorkspaceInput>('browse workspace input', [
  { name: 'relativePath', assert: assertOptionalString, label: 'browse workspace input.relativePath' },
  { name: 'workspaceRoot', assert: assertOptionalString, label: 'browse workspace input.workspaceRoot' },
], { allowUndefinedInput: true });

export const validateReadWorkspaceFileInput = createValidator<ReadWorkspaceFileInput>('read workspace file input', [
  { name: 'relativePath', assert: assertString, label: 'read workspace file input.relativePath' },
  { name: 'workspaceRoot', assert: assertOptionalString, label: 'read workspace file input.workspaceRoot' },
]);

export const validateWriteWorkspaceFileInput = createValidator<WriteWorkspaceFileInput>('write workspace file input', [
  { name: 'relativePath', assert: assertString, label: 'write workspace file input.relativePath' },
  { name: 'content', assert: assertString, label: 'write workspace file input.content' },
  { name: 'workspaceRoot', assert: assertOptionalString, label: 'write workspace file input.workspaceRoot' },
]);

export const validateApplyWorkspaceFileInput = createValidator<ApplyWorkspaceFileInput>('apply workspace file input', [
  { name: 'relativePath', assert: assertString, label: 'apply workspace file input.relativePath' },
  { name: 'content', assert: assertString, label: 'apply workspace file input.content' },
  { name: 'workspaceRoot', assert: assertOptionalString, label: 'apply workspace file input.workspaceRoot' },
  {
    name: 'createIfMissing',
    assert: (fieldValue, fieldLabel) => assertOptionalBoolean(fieldValue, fieldLabel) ?? false,
    label: 'apply workspace file input.createIfMissing',
  },
]);

export const formatIpcErrorMessage = (error: unknown): string => {
  if (error instanceof IpcValidationError) {
    return JSON.stringify({ code: error.code, message: error.message });
  }

  if (error instanceof Error) {
    return JSON.stringify({ code: 'IPC_HANDLER_ERROR', message: error.message });
  }

  return JSON.stringify({ code: 'IPC_HANDLER_ERROR', message: 'Unknown IPC handler error.' });
};
