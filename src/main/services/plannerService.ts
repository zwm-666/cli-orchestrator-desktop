/**
 * PlannerService – Owns input segmentation, task classification, plan draft
 * generation, and the new buildExecutionPlan that produces OrchestrationNodes
 * with dependency relationships.
 *
 * Extracted from OrchestratorService (lines 524-816) during the orchestration refactor.
 */

import type {
  AgentProfile,
  AgentRoleType,
  CliAdapter,
  DiscussionAutomationConfig,
  DiscussionAutomationConfigInput,
  McpServerDefinition,
  OrchestrationAutomationMode,
  OrchestrationExecutionStyle,
  OrchestrationNode,
  OrchestrationRun,
  PlanConfidence,
  PlanDraft,
  PlanDraftInput,
  PlanDraftMention,
  PlanDraftResult,
  PlanRoutingSource,
  PlanSegmentationSource,
  PlanTaskDraft,
  RoutingSettings,
  SkillDefinition,
  TaskType,
} from '../../shared/domain.js';
import { getAgentProfileDisplayName } from '../../shared/agentProfiles.js';

// ---------------------------------------------------------------------------
// Constants (moved from orchestratorService.ts)
// ---------------------------------------------------------------------------

const PLANNER_VERSION = 'local-router-v2';
const ADAPTER_MENTION_PATTERN_SOURCE = /(^|\s)@([a-zA-Z0-9_-]+)/;
const BULLET_LINE_PATTERN = /^\s*(?:[-*]|\d+[.)])\s+(.+)$/;
const SENTENCE_SPLIT_PATTERN = /(?<=[.!?])\s+/;
const MAX_PLANNED_TASKS = 3;
const MAX_ORCHESTRATION_NODES = 5;

const TASK_TYPE_KEYWORDS = {
  planning: ['plan', 'planning', 'break down', 'split', 'roadmap', 'todo', '任务规划', '拆分', '计划'],
  frontend: ['frontend', 'ui', 'ux', 'css', 'layout', 'style', 'design', '前端', '页面', '样式'],
  research: ['research', 'investigate', 'analyze', 'analyse', 'study', '调研', '研究', '分析'],
  git: ['git', 'commit', 'branch', 'rebase', 'merge', 'pull request', 'pr', '提交', '分支'],
  ops: ['deploy', 'docker', 'k8s', 'infra', 'ci', 'release', '运维', '部署'],
  code: [
    'code',
    'implement',
    'refactor',
    'bug',
    'fix',
    'typescript',
    'javascript',
    'python',
    'api',
    '编码',
    '实现',
    '重构',
    '修复',
  ],
} as const;

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

const createId = (prefix: string): string => `${prefix}-${crypto.randomUUID()}`;

const DEFAULT_DISCUSSION_CONFIG: DiscussionAutomationConfig = {
  maxRounds: 3,
  participantsPerRound: 2,
  participantProfileIds: [],
  consensusStrategy: 'keyword',
  consensusKeyword: '<CONSENSUS>',
  requireFinalSynthesis: true,
};

const clampInteger = (value: number, minimum: number, maximum: number): number => {
  return Math.max(minimum, Math.min(maximum, Math.trunc(value)));
};

const buildDiscussionConfig = (
  input: DiscussionAutomationConfigInput | null | undefined,
  maxIterationsOverride: number | null,
): DiscussionAutomationConfig => {
  const configuredMaxRounds =
    typeof input?.maxRounds === 'number' && Number.isFinite(input.maxRounds)
      ? clampInteger(input.maxRounds, 1, 12)
      : DEFAULT_DISCUSSION_CONFIG.maxRounds;
  const maxRounds =
    typeof maxIterationsOverride === 'number' && Number.isFinite(maxIterationsOverride)
      ? clampInteger(maxIterationsOverride, 1, 12)
      : configuredMaxRounds;

  return {
    maxRounds,
    participantsPerRound:
      typeof input?.participantsPerRound === 'number' && Number.isFinite(input.participantsPerRound)
        ? clampInteger(input.participantsPerRound, 1, 5)
        : DEFAULT_DISCUSSION_CONFIG.participantsPerRound,
    participantProfileIds: Array.isArray(input?.participantProfileIds)
      ? input.participantProfileIds.filter((entry) => typeof entry === 'string' && entry.trim().length > 0)
      : [],
    consensusStrategy: input?.consensusStrategy ?? DEFAULT_DISCUSSION_CONFIG.consensusStrategy,
    consensusKeyword: normalizeOptionalString(input?.consensusKeyword) ?? DEFAULT_DISCUSSION_CONFIG.consensusKeyword,
    requireFinalSynthesis:
      typeof input?.requireFinalSynthesis === 'boolean'
        ? input.requireFinalSynthesis
        : DEFAULT_DISCUSSION_CONFIG.requireFinalSynthesis,
  };
};

const normalizePlannerWhitespace = (value: string): string =>
  value
    .replace(/\r\n/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const normalizeOptionalString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const deriveTaskTitle = (cleanedPrompt: string, rawInput: string): string => {
  const source = normalizePlannerWhitespace(cleanedPrompt || rawInput);
  if (!source) return 'New CLI task';
  const sentence = source.split(/[.!?\n]/, 1)[0]?.trim() ?? source;
  const compact = sentence || source;
  return compact.length <= 72 ? compact : `${compact.slice(0, 69).trimEnd()}...`;
};

const countWords = (value: string): number =>
  normalizePlannerWhitespace(value)
    .split(' ')
    .filter((p) => p.length > 0).length;

const isActionableSegment = (value: string): boolean => {
  const normalized = normalizePlannerWhitespace(value);
  const wordCount = countWords(normalized);
  return normalized.length >= 8 && normalized.length <= 160 && wordCount >= 2 && wordCount <= 18;
};

const packPlannerSegments = (segments: string[]): string[] => {
  const packed: string[] = [];
  let currentBatch = '';

  for (const segment of segments) {
    if (!isActionableSegment(segment)) continue;

    if (currentBatch.length + segment.length + 1 <= 160) {
      currentBatch = currentBatch ? `${currentBatch} ${segment}` : segment;
    } else {
      if (currentBatch.length > 0) packed.push(currentBatch);
      currentBatch = segment;
    }
  }

  if (currentBatch.length > 0) packed.push(currentBatch);
  return packed.slice(0, MAX_PLANNED_TASKS);
};

// ---------------------------------------------------------------------------
// Planner input segmentation
// ---------------------------------------------------------------------------

const segmentPlannerInput = (
  rawInput: string,
): {
  segments: string[];
  segmentationSource: PlanSegmentationSource;
} => {
  const trimmed = normalizePlannerWhitespace(rawInput);

  // Detect bullet points
  const bulletMatches = trimmed.split('\n').filter((line) => BULLET_LINE_PATTERN.test(line));
  if (bulletMatches.length >= 2) {
    const segments = bulletMatches
      .map((line) => {
        const match = BULLET_LINE_PATTERN.exec(line);
        return match?.[1] ?? '';
      })
      .filter((s) => s.length > 0);
    return { segments: packPlannerSegments(segments), segmentationSource: 'bullets' };
  }

  // Detect line breaks
  const lines = trimmed.split('\n').filter((l) => l.length > 0);
  if (lines.length >= 2) {
    return { segments: packPlannerSegments(lines), segmentationSource: 'lines' };
  }

  // Detect sentences
  const sentences = trimmed.split(SENTENCE_SPLIT_PATTERN).filter((s) => s.length > 0);
  if (sentences.length >= 2) {
    return { segments: packPlannerSegments(sentences), segmentationSource: 'sentences' };
  }

  // Fallback: single segment
  return { segments: [trimmed], segmentationSource: 'single_fallback' };
};

// ---------------------------------------------------------------------------
// Task classification and routing
// ---------------------------------------------------------------------------

const classifyTaskType = (prompt: string): TaskType => {
  const normalizedPrompt = normalizePlannerWhitespace(prompt).toLowerCase();

  for (const [taskType, keywords] of Object.entries(TASK_TYPE_KEYWORDS)) {
    if (keywords.some((kw) => normalizedPrompt.includes(kw))) {
      return taskType as TaskType;
    }
  }

  return 'general';
};

const extractAdapterMentions = (rawInput: string): PlanDraftMention[] => {
  const mentions: PlanDraftMention[] = [];
  const mentionPattern = new RegExp(ADAPTER_MENTION_PATTERN_SOURCE.source, 'g');
  let match: RegExpExecArray | null;

  while ((match = mentionPattern.exec(rawInput)) !== null) {
    const token = match[2] ?? '';
    mentions.push({
      token,
      adapterId: token,
      recognized: false, // Will be populated later
    });
  }

  return mentions;
};

// ---------------------------------------------------------------------------
// Plan draft construction
// ---------------------------------------------------------------------------

const buildPlanTaskDraft = (
  segmentInput: string,
  enabledAdapters: CliAdapter[],
  routingSettings: RoutingSettings,
): PlanTaskDraft => {
  const cleanedPrompt = normalizePlannerWhitespace(segmentInput);
  const taskType = classifyTaskType(cleanedPrompt);
  const taskTitle = deriveTaskTitle(cleanedPrompt, segmentInput);
  const mentions = extractAdapterMentions(segmentInput);
  const taskRoutingProfile = routingSettings.taskProfiles.find((p) => p.enabled && p.taskType === taskType);
  const taskRoutingRule = routingSettings.taskTypeRules[taskType];

  const displayCategory = taskRoutingProfile?.label ?? taskType;
  const classificationReason = `Automatic classification detected ${taskType} keywords in the input.`;
  let recommendedAdapterId: string | null = null;
  let recommendedModel: string | null = null;
  let routingSource: PlanRoutingSource = 'no_enabled_adapter';
  let confidence: PlanConfidence = 'low';
  let rationale = 'No enabled adapters available.';

  // Check for explicit mentions
  const mentionedAdapterId = mentions.find((m) => enabledAdapters.find((a) => a.id === m.token))?.token;
  if (mentionedAdapterId) {
    const adapter = enabledAdapters.find((a) => a.id === mentionedAdapterId);
    if (adapter) {
      const mentionEntry = mentions.find((m) => m.token === mentionedAdapterId);
      if (mentionEntry) mentionEntry.recognized = true;
      recommendedAdapterId = adapter.id;
      recommendedModel = normalizeOptionalString(adapter.defaultModel) ?? '';
      routingSource = 'explicit_mention';
      confidence = 'high';
      rationale = `User explicitly mentioned @${adapter.id}.`;
    }
  } else if (taskRoutingProfile?.adapterId) {
    // Check profile override
    const profileAdapter = enabledAdapters.find((a) => a.id === taskRoutingProfile.adapterId);
    if (profileAdapter) {
      recommendedAdapterId = profileAdapter.id;
      recommendedModel =
        normalizeOptionalString(taskRoutingProfile.model) ?? normalizeOptionalString(profileAdapter.defaultModel) ?? '';
      routingSource = 'task_type_rule';
      confidence = 'high';
      rationale = `Matched task profile "${taskRoutingProfile.label}".`;
    } else {
      // Profile points to disabled adapter, use first enabled
      const firstEnabledAdapter = enabledAdapters[0];
      if (firstEnabledAdapter) {
        recommendedAdapterId = firstEnabledAdapter.id;
        recommendedModel =
          normalizeOptionalString(taskRoutingProfile.model) ??
          normalizeOptionalString(taskRoutingRule.model) ??
          firstEnabledAdapter.defaultModel;
        routingSource = 'first_enabled_adapter';
        confidence = 'medium';
        rationale = `Profile adapter is unavailable, using first enabled @${firstEnabledAdapter.id}.`;
      }
    }
  } else if (taskRoutingRule.adapterId) {
    // Check routing rule
    const ruleAdapter = enabledAdapters.find((a) => a.id === taskRoutingRule.adapterId);
    if (ruleAdapter) {
      recommendedAdapterId = ruleAdapter.id;
      recommendedModel =
        normalizeOptionalString(taskRoutingRule.model) ?? normalizeOptionalString(ruleAdapter.defaultModel) ?? '';
      routingSource = 'task_type_rule';
      confidence = 'medium';
      rationale = `Matched task type rule for ${taskType}.`;
    } else {
      // Rule points to disabled adapter, use first enabled
      const firstEnabledAdapter = enabledAdapters[0];
      if (firstEnabledAdapter) {
        recommendedAdapterId = firstEnabledAdapter.id;
        recommendedModel =
          normalizeOptionalString(taskRoutingRule.model) ??
          normalizeOptionalString(firstEnabledAdapter.defaultModel) ??
          '';
        routingSource = 'first_enabled_adapter';
        confidence = 'medium';
        rationale = `Rule adapter is unavailable, using first enabled @${firstEnabledAdapter.id}.`;
      }
    }
  } else if (enabledAdapters.length > 0) {
    // No profile or rule, use first enabled
    const firstEnabledAdapter = enabledAdapters[0];
    if (firstEnabledAdapter) {
      recommendedAdapterId = firstEnabledAdapter.id;
      recommendedModel = normalizeOptionalString(firstEnabledAdapter.defaultModel) ?? '';
      routingSource = 'first_enabled_adapter';
      confidence = 'medium';
      rationale = `No explicit mention or task-type rule matched, using first enabled @${firstEnabledAdapter.id}.`;
    }
  }

  return {
    rawInput: segmentInput,
    cleanedPrompt,
    taskTitle,
    taskType,
    displayCategory,
    matchedProfileId: taskRoutingProfile?.id ?? null,
    classificationReason,
    mentions,
    recommendedAdapterId,
    recommendedModel,
    routingSource,
    confidence,
    rationale,
  };
};

// ---------------------------------------------------------------------------
// Plan draft result
// ---------------------------------------------------------------------------

export const createPlanDraft = (
  input: PlanDraftInput,
  enabledAdapters: CliAdapter[],
  routingSettings: RoutingSettings,
): PlanDraftResult => {
  const { segments, segmentationSource } = segmentPlannerInput(input.rawInput);
  const plannedTasks = segments.map((segment) => buildPlanTaskDraft(segment, enabledAdapters, routingSettings));

  const firstTask = plannedTasks[0];
  const draft: PlanDraft = {
    rawInput: input.rawInput,
    plannerVersion: PLANNER_VERSION,
    segmentationSource,
    plannedTasks,
    cleanedPrompt: firstTask?.cleanedPrompt ?? '',
    taskTitle: firstTask?.taskTitle ?? 'New CLI task',
    taskType: firstTask?.taskType ?? 'general',
    displayCategory: firstTask?.displayCategory ?? 'general',
    matchedProfileId: firstTask?.matchedProfileId ?? null,
    classificationReason: firstTask?.classificationReason ?? '',
    mentions: firstTask?.mentions ?? [],
    recommendedAdapterId: firstTask?.recommendedAdapterId ?? null,
    recommendedModel: firstTask?.recommendedModel ?? null,
    routingSource: firstTask?.routingSource ?? 'no_enabled_adapter',
    confidence: firstTask?.confidence ?? 'low',
    rationale: firstTask?.rationale ?? '',
  };

  return { draft };
};

// ---------------------------------------------------------------------------
// Execution plan
// ---------------------------------------------------------------------------

interface ExecutionPlan {
  orchestrationRun: OrchestrationRun;
  nodes: OrchestrationNode[];
}

// ---------------------------------------------------------------------------
// Role inference for execution plan nodes
// ---------------------------------------------------------------------------

const TASK_TYPE_TO_ROLE: Record<TaskType, AgentRoleType> = {
  general: 'custom',
  planning: 'planner',
  code: 'coder',
  frontend: 'coder',
  research: 'researcher',
  git: 'coder',
  ops: 'coder',
};

const inferAgentRole = (taskType: TaskType): AgentRoleType => TASK_TYPE_TO_ROLE[taskType];

// ---------------------------------------------------------------------------
// Skill matching helper
// ---------------------------------------------------------------------------

const matchSkillsForNode = (taskType: TaskType, prompt: string, skills: SkillDefinition[]): string[] => {
  const normalizedPrompt = prompt.toLowerCase();
  return skills
    .filter((skill) => {
      if (!skill.enabled) return false;
      if (skill.allowedTaskTypes.length > 0 && !skill.allowedTaskTypes.includes(taskType)) return false;
      if (skill.trigger.taskTypes.length > 0 && !skill.trigger.taskTypes.includes(taskType)) return false;
      if (skill.trigger.keywords.length > 0) {
        return skill.trigger.keywords.some((kw) => normalizedPrompt.includes(kw.toLowerCase()));
      }
      return true;
    })
    .map((s) => s.id);
};

// ---------------------------------------------------------------------------
// MCP binding helper
// ---------------------------------------------------------------------------

const resolveMcpServersForNode = (
  skillIds: string[],
  agentProfile: AgentProfile | null,
  skills: SkillDefinition[],
  mcpServers: McpServerDefinition[],
): string[] => {
  const serverIds = new Set<string>();

  // Agent profile base MCP set
  if (agentProfile) {
    for (const id of agentProfile.enabledMcpServerIds) {
      serverIds.add(id);
    }
  }

  // Skill-level MCP dependencies
  for (const skillId of skillIds) {
    const skill = skills.find((s) => s.id === skillId);
    if (skill) {
      for (const id of skill.requiredMcpServerIds) {
        serverIds.add(id);
      }
    }
  }

  // Filter to only enabled servers
  const enabledServerIds = new Set(mcpServers.filter((s) => s.enabled).map((s) => s.id));
  return [...serverIds].filter((id) => enabledServerIds.has(id));
};

// ---------------------------------------------------------------------------
// Agent profile resolution
// ---------------------------------------------------------------------------

const resolveAgentProfileForNode = (taskType: TaskType, agentProfiles: AgentProfile[]): AgentProfile | null => {
  const desiredRole = inferAgentRole(taskType);

  // First try to find an enabled profile with the matching role
  const byRole = agentProfiles.find((p) => p.enabled && p.role === desiredRole);
  if (byRole) return byRole;

  // Fallback to any enabled profile
  return agentProfiles.find((p) => p.enabled) ?? null;
};

const resolveTaskTypeForProfile = (profile: AgentProfile): TaskType => {
  switch (profile.role) {
    case 'planner':
      return 'planning';
    case 'coder':
      return 'code';
    case 'researcher':
    case 'reviewer':
    case 'tester':
      return 'research';
    default:
      return 'general';
  }
};

const resolveSelectedProfiles = (agentProfiles: AgentProfile[], participantProfileIds: string[] | undefined): AgentProfile[] => {
  const enabledProfiles = agentProfiles.filter((profile) => profile.enabled);
  if (!participantProfileIds || participantProfileIds.length === 0) {
    return enabledProfiles;
  }

  const selectedIds = new Set(participantProfileIds);
  const selectedProfiles = enabledProfiles.filter((profile) => selectedIds.has(profile.id));
  return selectedProfiles.length > 0 ? selectedProfiles : enabledProfiles;
};

const buildProfileExecutionPlan = (input: {
  rawInput: string;
  conversationId: string;
  agentProfiles: AgentProfile[];
  selectedProfiles: AgentProfile[];
  skills: SkillDefinition[];
  mcpServers: McpServerDefinition[];
  masterAgentProfileId: string | null;
  projectContextSummary: string | null;
  executionStyle: Exclude<OrchestrationExecutionStyle, 'planner'>;
}): ExecutionPlan => {
  const { rawInput, conversationId, selectedProfiles, skills, mcpServers, masterAgentProfileId, projectContextSummary, executionStyle } = input;
  const orchestrationRunId = createId('orch-run');
  const now = new Date().toISOString();
  const contextPrefix = projectContextSummary?.trim() ? `Project context summary:\n${projectContextSummary.trim()}\n\n` : '';
  const profiles = selectedProfiles.length > 0 ? selectedProfiles : [null];
  const nodes: OrchestrationNode[] = [];

  profiles.forEach((profile, index) => {
    const taskType = profile ? resolveTaskTypeForProfile(profile) : 'general';
    const nodeId = createId('orch-node');
    const previousNodeId = executionStyle === 'sequential' ? (nodes.at(-1)?.id ?? null) : null;
    const promptPrefix = executionStyle === 'parallel'
      ? 'Provide your independent perspective on the task below and deliver the best concrete next steps from your specialization.'
      : index === 0
        ? 'Start the multi-agent workflow by tackling the task below from your specialization.'
        : 'Continue the multi-agent workflow below. Build on upstream results, challenge weak assumptions, and add concrete improvements from your specialization.';
    const skillIds = matchSkillsForNode(taskType, rawInput, skills);

    nodes.push({
      id: nodeId,
      orchestrationRunId,
      parentNodeId: previousNodeId,
      dependsOnNodeIds: previousNodeId ? [previousNodeId] : [],
      agentProfileId: profile?.id ?? null,
      skillIds,
      mcpServerIds: resolveMcpServersForNode(skillIds, profile ?? null, skills, mcpServers),
      taskType,
      title: profile ? getAgentProfileDisplayName(profile) : 'General agent',
      prompt: `${contextPrefix}${promptPrefix}\n\nTask:\n${rawInput}`,
      status: previousNodeId ? 'waiting_on_deps' : 'ready',
      runId: null,
      resultSummary: null,
      resultPayload: null,
      retryCount: 0,
    });
  });

  if (profiles.length > 1) {
    const synthesizerProfile =
      (masterAgentProfileId ? input.agentProfiles.find((profile) => profile.id === masterAgentProfileId && profile.enabled) : null) ??
      selectedProfiles[0] ??
      null;
    const synthesisDependsOnNodeIds = nodes.map((node) => node.id);
    const synthesisSkillIds = matchSkillsForNode('planning', rawInput, skills);

    nodes.push({
      id: createId('orch-node'),
      orchestrationRunId,
      parentNodeId: synthesisDependsOnNodeIds.at(-1) ?? null,
      dependsOnNodeIds: synthesisDependsOnNodeIds,
      agentProfileId: synthesizerProfile?.id ?? null,
      skillIds: synthesisSkillIds,
      mcpServerIds: resolveMcpServersForNode(synthesisSkillIds, synthesizerProfile, skills, mcpServers),
      taskType: 'planning',
      title: 'Synthesize multi-agent result',
      prompt: `${contextPrefix}Synthesize the upstream agent results into one final recommendation. Resolve disagreements, name trade-offs, and give a concrete execution plan for:\n\n${rawInput}`,
      status: 'waiting_on_deps',
      runId: null,
      resultSummary: null,
      resultPayload: null,
      retryCount: 0,
    });
  }

  return {
    orchestrationRun: {
      id: orchestrationRunId,
      conversationId,
      rootPrompt: rawInput,
      status: 'planning',
      masterAgentProfileId: masterAgentProfileId ?? null,
      automationMode: 'standard',
      executionStyle,
      discussionConfig: null,
      projectContextSummary,
      currentIteration: 1,
      maxIterations: 1,
      stopReason: null,
      planVersion: 1,
      createdAt: now,
      updatedAt: now,
      finalSummary: null,
    },
    nodes,
  };
};

// ---------------------------------------------------------------------------
// Execution plan builder
// ---------------------------------------------------------------------------

export const buildExecutionPlan = (
  rawInput: string,
  conversationId: string,
  enabledAdapters: CliAdapter[],
  routingSettings: RoutingSettings,
  agentProfiles: AgentProfile[],
  skills: SkillDefinition[],
  mcpServers: McpServerDefinition[],
  masterAgentProfileId: string | null,
  automationMode: OrchestrationAutomationMode = 'standard',
  projectContextSummary: string | null = null,
  maxIterationsOverride: number | null = null,
  discussionConfigInput: DiscussionAutomationConfigInput | null = null,
  executionStyle: OrchestrationExecutionStyle = 'planner',
  participantProfileIds: string[] = [],
): ExecutionPlan => {
  const selectedProfiles = resolveSelectedProfiles(agentProfiles, participantProfileIds);

  if (automationMode === 'standard' && executionStyle !== 'planner' && selectedProfiles.length > 0) {
    return buildProfileExecutionPlan({
      rawInput,
      conversationId,
      agentProfiles,
      selectedProfiles,
      skills,
      mcpServers,
      masterAgentProfileId,
      projectContextSummary,
      executionStyle,
    });
  }

  if (automationMode === 'discussion') {
    const orchestrationRunId = createId('orch-run');
    const now = new Date().toISOString();
    const discussionConfig = buildDiscussionConfig(
      {
        ...discussionConfigInput,
        participantProfileIds:
          discussionConfigInput?.participantProfileIds && discussionConfigInput.participantProfileIds.length > 0
            ? discussionConfigInput.participantProfileIds
            : participantProfileIds,
      },
      maxIterationsOverride,
    );
    const contextPrefix = projectContextSummary?.trim()
      ? `Project context summary:\n${projectContextSummary.trim()}\n\n`
      : '';
    const candidateProfiles = resolveSelectedProfiles(agentProfiles, discussionConfig.participantProfileIds);
    const orderedProfiles = [
      ...candidateProfiles.filter((profile) => profile.role === 'researcher'),
      ...candidateProfiles.filter((profile) => profile.role === 'reviewer'),
      ...candidateProfiles.filter((profile) => profile.role === 'coder'),
      ...candidateProfiles.filter((profile) => profile.role === 'planner'),
      ...candidateProfiles.filter((profile) => !['researcher', 'reviewer', 'coder', 'planner'].includes(profile.role)),
    ];
    const participantProfiles = orderedProfiles.slice(0, discussionConfig.participantsPerRound);

    const nodes: OrchestrationNode[] = [];

    participantProfiles.forEach((profile, index) => {
      const nodeId = createId('orch-node');
      const previousNodeId = nodes.at(-1)?.id ?? null;
      nodes.push({
        id: nodeId,
        orchestrationRunId,
        parentNodeId: previousNodeId,
        dependsOnNodeIds: previousNodeId ? [previousNodeId] : [],
        agentProfileId: profile.id,
        skillIds: [],
        mcpServerIds: [],
        taskType: 'research',
        title: `Discussion round 1 · perspective ${index + 1}`,
        prompt: `${contextPrefix}Round 1 discussion. Review the topic below, then contribute your perspective in sequence. Reference earlier speakers if available, name trade-offs, and include ${discussionConfig.consensusKeyword} only if you believe the group has converged.\n\nTopic:\n${rawInput}`,
        status: previousNodeId ? 'waiting_on_deps' : 'ready',
        runId: null,
        resultSummary: null,
        resultPayload: null,
        retryCount: 0,
        discussionRound: 1,
        discussionRole: 'speaker',
      });
    });

    if (nodes.length === 0) {
      nodes.push({
        id: createId('orch-node'),
        orchestrationRunId,
        parentNodeId: null,
        dependsOnNodeIds: [],
        agentProfileId: null,
        skillIds: [],
        mcpServerIds: [],
        taskType: 'research',
        title: 'Discussion round 1 · perspective 1',
        prompt: `${contextPrefix}Round 1 discussion. Provide an independent analysis and proposed solution for the request below.\n\nRequest:\n${rawInput}`,
        status: 'ready',
        runId: null,
        resultSummary: null,
        resultPayload: null,
        retryCount: 0,
        discussionRound: 1,
        discussionRole: 'speaker',
      });
    }

    return {
      orchestrationRun: {
        id: orchestrationRunId,
        conversationId,
        rootPrompt: rawInput,
        status: 'planning',
        masterAgentProfileId: masterAgentProfileId ?? null,
        automationMode,
        executionStyle: 'sequential',
        discussionConfig,
        projectContextSummary,
        currentIteration: 1,
        maxIterations: discussionConfig.maxRounds,
        stopReason: null,
        planVersion: 1,
        createdAt: now,
        updatedAt: now,
        finalSummary: null,
      },
      nodes,
    };
  }

  if (automationMode === 'review_loop') {
    const orchestrationRunId = createId('orch-run');
    const now = new Date().toISOString();
    const coderProfile =
      agentProfiles.find((profile) => profile.enabled && profile.role === 'coder') ??
      agentProfiles.find((profile) => profile.enabled) ??
      null;
    const reviewerProfile =
      agentProfiles.find((profile) => profile.enabled && profile.role === 'reviewer') ?? coderProfile;
    const contextPrefix = projectContextSummary?.trim()
      ? `Project context summary:\n${projectContextSummary.trim()}\n\n`
      : '';
    const coderNodeId = createId('orch-node');
    const reviewerNodeId = createId('orch-node');
    const reviserNodeId = createId('orch-node');

    return {
      orchestrationRun: {
        id: orchestrationRunId,
        conversationId,
        rootPrompt: rawInput,
        status: 'planning',
        masterAgentProfileId: masterAgentProfileId ?? null,
        automationMode,
        executionStyle: 'planner',
        discussionConfig: null,
        projectContextSummary,
        currentIteration: 1,
        maxIterations:
          typeof maxIterationsOverride === 'number' && Number.isFinite(maxIterationsOverride)
            ? clampInteger(maxIterationsOverride, 1, 8)
            : 2,
        stopReason: null,
        planVersion: 1,
        createdAt: now,
        updatedAt: now,
        finalSummary: null,
      },
      nodes: [
        {
          id: coderNodeId,
          orchestrationRunId,
          parentNodeId: null,
          dependsOnNodeIds: [],
          agentProfileId: coderProfile?.id ?? null,
          skillIds: [],
          mcpServerIds: [],
          taskType: 'code',
          title: 'Implement requested changes',
          prompt: `${contextPrefix}Implement the requested changes in the repository and summarize what changed.\n\nUser request:\n${rawInput}`,
          status: 'ready',
          runId: null,
          resultSummary: null,
          resultPayload: null,
          retryCount: 0,
        },
        {
          id: reviewerNodeId,
          orchestrationRunId,
          parentNodeId: null,
          dependsOnNodeIds: [coderNodeId],
          agentProfileId: reviewerProfile?.id ?? null,
          skillIds: [],
          mcpServerIds: [],
          taskType: 'research',
          title: 'Review and write handoff',
          prompt: `${contextPrefix}Review the latest implementation, update the repository review/debug artifacts, and list remaining issues clearly.\n\nOriginal request:\n${rawInput}`,
          status: 'waiting_on_deps',
          runId: null,
          resultSummary: null,
          resultPayload: null,
          retryCount: 0,
        },
        {
          id: reviserNodeId,
          orchestrationRunId,
          parentNodeId: null,
          dependsOnNodeIds: [reviewerNodeId],
          agentProfileId: coderProfile?.id ?? null,
          skillIds: [],
          mcpServerIds: [],
          taskType: 'code',
          title: 'Revise from review handoff',
          prompt: `${contextPrefix}Read the generated debug/review artifacts in the repository and fix the remaining issues they describe.\n\nOriginal request:\n${rawInput}`,
          status: 'waiting_on_deps',
          runId: null,
          resultSummary: null,
          resultPayload: null,
          retryCount: 0,
        },
      ],
    };
  }

  const { segments } = segmentPlannerInput(rawInput);
  const orchestrationRunId = createId('orch-run');
  const now = new Date().toISOString();

  // Build nodes for each segment
  const nodes: OrchestrationNode[] = [];
  const nodeIds: string[] = [];

  for (let i = 0; i < Math.min(segments.length, MAX_ORCHESTRATION_NODES); i++) {
    const segment = segments[i] ?? '';
    const planTask = buildPlanTaskDraft(segment, enabledAdapters, routingSettings);
    const nodeId = createId('orch-node');
    const agentProfile = resolveAgentProfileForNode(planTask.taskType, agentProfiles);
    const matchedSkillIds = matchSkillsForNode(planTask.taskType, segment, skills);
    const mcpServerIds = resolveMcpServersForNode(matchedSkillIds, agentProfile, skills, mcpServers);

    // Determine dependencies – by default, nodes are sequential
    // unless they are independent research/analysis tasks
    const dependsOnNodeIds: string[] = [];
    if (i > 0) {
      const prevNode = nodes[i - 1];
      // Research and planning tasks can potentially run in parallel with each other
      const isParallelCandidate = planTask.taskType === 'research' || planTask.taskType === 'planning';
      const prevIsParallelCandidate =
        prevNode && (prevNode.taskType === 'research' || prevNode.taskType === 'planning');

      if (!(isParallelCandidate && prevIsParallelCandidate)) {
        // Sequential: depend on previous node
        const prevNodeId = nodeIds[i - 1];
        if (prevNodeId !== undefined) dependsOnNodeIds.push(prevNodeId);
      }
    }

    nodeIds.push(nodeId);
    nodes.push({
      id: nodeId,
      orchestrationRunId,
      parentNodeId: null,
      dependsOnNodeIds,
      agentProfileId: agentProfile?.id ?? null,
      skillIds: matchedSkillIds,
      mcpServerIds: mcpServerIds,
      taskType: planTask.taskType,
      title: planTask.taskTitle,
      prompt: segment,
      status: i === 0 ? 'ready' : 'waiting_on_deps',
      runId: null,
      resultSummary: null,
      resultPayload: null,
      retryCount: 0,
    });
  }

  return {
    orchestrationRun: {
      id: orchestrationRunId,
      conversationId,
      rootPrompt: rawInput,
      status: 'planning',
      masterAgentProfileId: masterAgentProfileId ?? null,
      automationMode,
      executionStyle: 'planner',
      discussionConfig: null,
      projectContextSummary,
      currentIteration: 1,
      maxIterations:
        typeof maxIterationsOverride === 'number' && Number.isFinite(maxIterationsOverride)
          ? clampInteger(maxIterationsOverride, 1, 8)
          : 1,
      stopReason: null,
      planVersion: 1,
      createdAt: now,
      updatedAt: now,
      finalSummary: null,
    },
    nodes,
  };
};
