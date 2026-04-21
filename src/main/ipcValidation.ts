import type {
  BrowseWorkspaceInput,
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

export const validateObjectInput = <T extends object>(value: unknown, label: string): T => {
  return assertRecord(value, label) as T;
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
  };
};

export const validateReadWorkspaceFileInput = (value: unknown): ReadWorkspaceFileInput => {
  const input = assertRecord(value, 'read workspace file input');
  return {
    relativePath: assertString(input.relativePath, 'read workspace file input.relativePath'),
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
