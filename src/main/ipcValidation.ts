import type {
  BrowseWorkspaceInput,
  ApplyWorkspaceFileInput,
  CancelOrchestrationInput,
  CancelRunInput,
  CreateDraftConversationInput,
  DeleteAgentProfileInput,
  DeleteMcpServerInput,
  DeleteSkillInput,
  GetOrchestrationRunInput,
  PlanDraftInput,
  ReadWorkspaceFileInput,
  RendererContinuityState,
  SaveProjectContextInput,
  SaveWorkbenchStateInput,
  StartOrchestrationInput,
  StartRunInput,
  UpdateRoutingSettingsInput,
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

export const validateProjectContextInput = (value: unknown): SaveProjectContextInput => {
  const input = assertRecord(value, 'project context input');
  return {
    summary: assertString(input.summary, 'project context input.summary'),
  };
};

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

export const validateDraftConversationInput = (value: unknown): CreateDraftConversationInput => {
  const input = assertRecord(value, 'draft conversation input');
  return {
    title: assertString(input.title, 'draft conversation input.title'),
    message: assertString(input.message, 'draft conversation input.message'),
  };
};

export const validatePlanDraftInput = (value: unknown): PlanDraftInput => {
  const input = assertRecord(value, 'plan draft input');
  return {
    rawInput: assertString(input.rawInput, 'plan draft input.rawInput'),
  };
};

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

export const validateCancelRunInput = (value: unknown): CancelRunInput => {
  const input = assertRecord(value, 'cancel run input');
  return {
    runId: assertString(input.runId, 'cancel run input.runId'),
  };
};

export const validateRecentRunsInput = (value: unknown): { taskType: string; limit?: number } => {
  const input = assertRecord(value, 'recent runs input');
  const taskType = assertString(input.taskType, 'recent runs input.taskType');
  const limit = input.limit === undefined ? undefined : assertOptionalNumber(input.limit, 'recent runs input.limit') ?? undefined;
  return { taskType, ...(limit !== undefined ? { limit } : {}) };
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

export const validateCancelOrchestrationInput = (value: unknown): CancelOrchestrationInput => {
  const input = assertRecord(value, 'cancel orchestration input');
  return {
    orchestrationRunId: assertString(input.orchestrationRunId, 'cancel orchestration input.orchestrationRunId'),
  };
};

export const validateGetOrchestrationRunInput = (value: unknown): GetOrchestrationRunInput => {
  const input = assertRecord(value, 'get orchestration run input');
  return {
    orchestrationRunId: assertString(input.orchestrationRunId, 'get orchestration run input.orchestrationRunId'),
  };
};

export const validateDeleteAgentProfileInput = (value: unknown): DeleteAgentProfileInput => {
  const input = assertRecord(value, 'delete agent profile input');
  return {
    profileId: assertString(input.profileId, 'delete agent profile input.profileId'),
  };
};

export const validateDeleteSkillInput = (value: unknown): DeleteSkillInput => {
  const input = assertRecord(value, 'delete skill input');
  return {
    skillId: assertString(input.skillId, 'delete skill input.skillId'),
  };
};

export const validateDeleteMcpServerInput = (value: unknown): DeleteMcpServerInput => {
  const input = assertRecord(value, 'delete mcp server input');
  return {
    serverId: assertString(input.serverId, 'delete mcp server input.serverId'),
  };
};

export const validateBrowseWorkspaceInput = (value: unknown): BrowseWorkspaceInput => {
  const input = value === undefined ? {} : assertRecord(value, 'browse workspace input');
  return {
    relativePath: assertOptionalString(input.relativePath, 'browse workspace input.relativePath'),
    workspaceRoot: assertOptionalString(input.workspaceRoot, 'browse workspace input.workspaceRoot'),
  };
};

export const validateReadWorkspaceFileInput = (value: unknown): ReadWorkspaceFileInput => {
  const input = assertRecord(value, 'read workspace file input');
  return {
    relativePath: assertString(input.relativePath, 'read workspace file input.relativePath'),
    workspaceRoot: assertOptionalString(input.workspaceRoot, 'read workspace file input.workspaceRoot'),
  };
};

export const validateApplyWorkspaceFileInput = (value: unknown): ApplyWorkspaceFileInput => {
  const input = assertRecord(value, 'apply workspace file input');
  return {
    relativePath: assertString(input.relativePath, 'apply workspace file input.relativePath'),
    content: assertString(input.content, 'apply workspace file input.content'),
    workspaceRoot: assertOptionalString(input.workspaceRoot, 'apply workspace file input.workspaceRoot'),
    createIfMissing: assertOptionalBoolean(input.createIfMissing, 'apply workspace file input.createIfMissing') ?? false,
  };
};

export const formatIpcErrorMessage = (error: unknown): string => {
  if (error instanceof IpcValidationError) {
    return JSON.stringify({ code: error.code, message: error.message });
  }

  if (error instanceof Error) {
    return JSON.stringify({ code: 'IPC_HANDLER_ERROR', message: error.message });
  }

  return JSON.stringify({ code: 'IPC_HANDLER_ERROR', message: 'Unknown IPC handler error.' });
};
