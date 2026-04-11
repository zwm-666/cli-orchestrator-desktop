/**
 * PlannerService – Owns input segmentation, task classification, plan draft
 * generation, and the new buildExecutionPlan that produces OrchestrationNodes
 * with dependency relationships.
 *
 * Extracted from OrchestratorService (lines 524-816) per agent.md Phase 2.
 */

import type {
  AgentProfile,
  AgentRoleType,
  CliAdapter,
  McpServerDefinition,
  OrchestrationNode,
  OrchestrationNodeStatus,
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
  TaskRoutingProfile,
  TaskRoutingRule,
  TaskType
} from '../../shared/domain.js';
import { DEFAULT_ROUTING_SETTINGS as defaultRoutingSettings } from '../../shared/domain.js';

// ---------------------------------------------------------------------------
// Constants (moved from orchestratorService.ts)
// ---------------------------------------------------------------------------

const PLANNER_VERSION = 'local-router-v2';
const ADAPTER_MENTION_PATTERN = /(^|\s)@([a-zA-Z0-9_-]+)/g;
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
  code: ['code', 'implement', 'refactor', 'bug', 'fix', 'typescript', 'javascript', 'python', 'api', '编码', '实现', '重构', '修复']
} as const;

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

const createId = (prefix: string): string => `${prefix}-${crypto.randomUUID()}`;

const normalizePlannerWhitespace = (value: string): string => value.replace(/\s+/g, ' ').trim();

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
  normalizePlannerWhitespace(value).split(' ').filter((p) => p.length > 0).length;

const isActionableSegment = (value: string): boolean => {
  const normalized = normalizePlannerWhitespace(value);
  const wordCount = countWords(normalized);
  return normalized.length >= 8 && normalized.length <= 160 && wordCount >= 2 && wordCount <= 18;
};

const packPlannerSegments = (segments: string[]): string[] => {
  if (segments.length <= MAX_PLANNED_TASKS) return segments;
  return [segments[0] ?? '', segments[1] ?? '', segments.slice(2).join('; ')].filter((s) => s.length > 0);
};

const splitConjunctionSegments = (value: string): string[] => {
  if (/\n/.test(value) || /[.!?]/.test(value)) return [];
  const separators = [' and then ', ' then ', '; '];
  for (const separator of separators) {
    if (!value.toLowerCase().includes(separator.trim())) continue;
    const segments = value
      .split(new RegExp(separator.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'))
      .map(normalizePlannerWhitespace)
      .filter((s) => s.length > 0);
    if (segments.length >= 2 && segments.length <= MAX_PLANNED_TASKS && segments.every(isActionableSegment)) {
      return segments;
    }
  }
  return [];
};

// ---------------------------------------------------------------------------
// Segmentation (public export for backward compat)
// ---------------------------------------------------------------------------

export const segmentPlannerInput = (
  rawInput: string
): { segments: string[]; segmentationSource: PlanSegmentationSource } => {
  const normalizedInput = rawInput.replace(/\r\n/g, '\n').trim();
  if (!normalizedInput) return { segments: [''], segmentationSource: 'single_fallback' };

  const nonEmptyLines = normalizedInput.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);

  if (nonEmptyLines.length >= 2) {
    const bulletSegments = nonEmptyLines
      .map((line) => line.match(BULLET_LINE_PATTERN)?.[1]?.trim() ?? null)
      .filter((l): l is string => Boolean(l));
    if (bulletSegments.length === nonEmptyLines.length && bulletSegments.every(isActionableSegment)) {
      return { segments: packPlannerSegments(bulletSegments), segmentationSource: 'bullets' };
    }
    if (nonEmptyLines.length <= 3 && nonEmptyLines.every(isActionableSegment)) {
      return { segments: nonEmptyLines, segmentationSource: 'lines' };
    }
  }

  const sentenceSegments = normalizedInput.split(SENTENCE_SPLIT_PATTERN).map(normalizePlannerWhitespace).filter((s) => s.length > 0);
  if (sentenceSegments.length >= 2 && sentenceSegments.length <= MAX_PLANNED_TASKS && sentenceSegments.every(isActionableSegment)) {
    return { segments: sentenceSegments, segmentationSource: 'sentences' };
  }

  const conjunctionSegments = splitConjunctionSegments(normalizedInput);
  if (conjunctionSegments.length > 0) return { segments: conjunctionSegments, segmentationSource: 'conjunctions' };

  return { segments: [normalizedInput], segmentationSource: 'single_fallback' };
};

// ---------------------------------------------------------------------------
// Task classification
// ---------------------------------------------------------------------------

export const classifyTaskType = (
  segmentInput: string
): { taskType: TaskType; classificationReason: string } => {
  const normalized = segmentInput.toLowerCase();
  for (const taskType of ['planning', 'frontend', 'research', 'git', 'ops', 'code'] as const) {
    const keyword = TASK_TYPE_KEYWORDS[taskType].find((entry) => normalized.includes(entry.toLowerCase()));
    if (keyword) return { taskType, classificationReason: `Matched keyword "${keyword}" for ${taskType}.` };
  }
  return { taskType: 'general', classificationReason: 'No strong task-type keyword matched, so the task fell back to general.' };
};

// ---------------------------------------------------------------------------
// Routing helpers
// ---------------------------------------------------------------------------

const getTaskRoutingRule = (routingSettings: RoutingSettings, taskType: TaskType): TaskRoutingRule =>
  routingSettings.taskTypeRules[taskType] ?? defaultRoutingSettings.taskTypeRules[taskType];

const getTaskRoutingProfile = (routingSettings: RoutingSettings, taskType: TaskType): TaskRoutingProfile | null =>
  routingSettings.taskProfiles.find((p) => p.enabled && p.taskType === taskType) ?? null;

// ---------------------------------------------------------------------------
// buildPlanTaskDraft – legacy single-run planning (backward compat)
// ---------------------------------------------------------------------------

export const buildPlanTaskDraft = (
  segmentInput: string,
  enabledAdapters: CliAdapter[],
  routingSettings: RoutingSettings
): PlanTaskDraft => {
  const enabledAdapterIds = new Set(enabledAdapters.map((a) => a.id));
  const firstEnabledAdapter = enabledAdapters[0] ?? null;
  const { taskType, classificationReason } = classifyTaskType(segmentInput);
  const taskRoutingRule = getTaskRoutingRule(routingSettings, taskType);
  const taskRoutingProfile = getTaskRoutingProfile(routingSettings, taskType);
  const mentions: PlanDraftMention[] = [];
  let explicitAdapterId: string | null = null;
  const tokensToStrip = new Set<string>();

  for (const match of segmentInput.matchAll(ADAPTER_MENTION_PATTERN)) {
    const adapterId = match[2];
    if (!adapterId) continue;
    const token = `@${adapterId}`;
    const recognized = enabledAdapterIds.has(adapterId);
    mentions.push({ token, adapterId, recognized });
    if (recognized) {
      tokensToStrip.add(token);
      if (!explicitAdapterId) explicitAdapterId = adapterId;
    }
  }

  let cleanedPrompt = segmentInput;
  for (const token of tokensToStrip) cleanedPrompt = cleanedPrompt.replaceAll(token, ' ');
  cleanedPrompt = normalizePlannerWhitespace(cleanedPrompt);

  let recommendedAdapterId: string | null = null;
  let recommendedModel: string | null = null;
  let routingSource: PlanRoutingSource = 'no_enabled_adapter';
  let confidence: PlanConfidence = 'low';
  let rationale = 'No enabled adapters are available for local routing.';

  if (explicitAdapterId) {
    const explicitAdapter = enabledAdapters.find((a) => a.id === explicitAdapterId) ?? null;
    recommendedAdapterId = explicitAdapterId;
    recommendedModel = explicitAdapter?.defaultModel ?? null;
    routingSource = 'explicit_mention';
    confidence = 'high';
    rationale = `Detected explicit adapter mention @${explicitAdapterId} in this task segment.`;
  } else if (taskRoutingProfile?.adapterId && enabledAdapterIds.has(taskRoutingProfile.adapterId)) {
    const routedAdapter = enabledAdapters.find((a) => a.id === taskRoutingProfile.adapterId) ?? null;
    recommendedAdapterId = taskRoutingProfile.adapterId;
    recommendedModel = normalizeOptionalString(taskRoutingProfile.model) ?? routedAdapter?.defaultModel ?? null;
    routingSource = 'task_type_rule';
    confidence = 'high';
    rationale = `Classified as ${taskType} and routed via the task profile "${taskRoutingProfile.label}" using @${taskRoutingProfile.adapterId}.`;
  } else if (taskRoutingRule.adapterId && enabledAdapterIds.has(taskRoutingRule.adapterId)) {
    const routedAdapter = enabledAdapters.find((a) => a.id === taskRoutingRule.adapterId) ?? null;
    recommendedAdapterId = taskRoutingRule.adapterId;
    recommendedModel = normalizeOptionalString(taskRoutingRule.model) ?? routedAdapter?.defaultModel ?? null;
    routingSource = 'task_type_rule';
    confidence = 'high';
    rationale = `Classified as ${taskType} and routed via the fallback rule for @${taskRoutingRule.adapterId}.`;
  } else if (firstEnabledAdapter) {
    recommendedAdapterId = firstEnabledAdapter.id;
    recommendedModel = normalizeOptionalString(taskRoutingProfile?.model) ?? normalizeOptionalString(taskRoutingRule.model) ?? firstEnabledAdapter.defaultModel;
    routingSource = 'first_enabled_adapter';
    confidence = 'medium';
    rationale = taskRoutingProfile?.adapterId
      ? `The task profile "${taskRoutingProfile.label}" points to @${taskRoutingProfile.adapterId}, but that adapter is disabled or unavailable, so the first enabled adapter @${firstEnabledAdapter.id} was selected.`
      : taskRoutingRule.adapterId
        ? `The ${taskType} routing rule points to @${taskRoutingRule.adapterId}, but that adapter is disabled or unavailable, so the first enabled adapter @${firstEnabledAdapter.id} was selected.`
        : `No explicit adapter mention or task-type rule matched, so the first enabled adapter @${firstEnabledAdapter.id} was selected.`;
  }

  return {
    rawInput: segmentInput,
    cleanedPrompt,
    taskTitle: deriveTaskTitle(cleanedPrompt, segmentInput),
    taskType,
    displayCategory: taskRoutingProfile?.label ?? taskType,
    matchedProfileId: taskRoutingProfile?.id ?? null,
    classificationReason,
    mentions,
    recommendedAdapterId,
    recommendedModel,
    routingSource,
    confidence,
    rationale
  };
};

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
  ops: 'coder'
};

const inferAgentRole = (taskType: TaskType): AgentRoleType => TASK_TYPE_TO_ROLE[taskType] ?? 'custom';

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
  mcpServers: McpServerDefinition[]
): string[] => {
  const serverIds = new Set<string>();
  // Agent profile base MCP set
  if (agentProfile) {
    for (const id of agentProfile.enabledMcpServerIds) serverIds.add(id);
  }
  // Skill-level MCP dependencies
  for (const skillId of skillIds) {
    const skill = skills.find((s) => s.id === skillId);
    if (skill) {
      for (const id of skill.requiredMcpServerIds) serverIds.add(id);
    }
  }
  // Filter to only enabled servers
  const enabledServerIds = new Set(mcpServers.filter((s) => s.enabled).map((s) => s.id));
  return [...serverIds].filter((id) => enabledServerIds.has(id));
};

// ---------------------------------------------------------------------------
// Agent profile resolution
// ---------------------------------------------------------------------------

const resolveAgentProfileForNode = (
  taskType: TaskType,
  agentProfiles: AgentProfile[]
): AgentProfile | null => {
  const desiredRole = inferAgentRole(taskType);
  // First try to find an enabled profile with the matching role
  const byRole = agentProfiles.find((p) => p.enabled && p.role === desiredRole);
  if (byRole) return byRole;
  // Fallback to any enabled profile
  return agentProfiles.find((p) => p.enabled) ?? null;
};

// ---------------------------------------------------------------------------
// buildExecutionPlan – Phase 2: produces OrchestrationRun + OrchestrationNodes
// ---------------------------------------------------------------------------

export interface ExecutionPlan {
  orchestrationRun: OrchestrationRun;
  nodes: OrchestrationNode[];
}

export const buildExecutionPlan = (
  rawInput: string,
  conversationId: string,
  enabledAdapters: CliAdapter[],
  routingSettings: RoutingSettings,
  agentProfiles: AgentProfile[],
  skills: SkillDefinition[],
  mcpServers: McpServerDefinition[],
  masterAgentProfileId: string | null
): ExecutionPlan => {
  const { segments, segmentationSource } = segmentPlannerInput(rawInput);
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
      const prevIsParallelCandidate = prevNode && (prevNode.taskType === 'research' || prevNode.taskType === 'planning');

      if (!(isParallelCandidate && prevIsParallelCandidate)) {
        // Sequential: depends on previous node
        dependsOnNodeIds.push(nodeIds[i - 1]!);
      }
    }

    const status: OrchestrationNodeStatus = dependsOnNodeIds.length === 0 ? 'ready' : 'waiting_on_deps';

    const node: OrchestrationNode = {
      id: nodeId,
      orchestrationRunId,
      parentNodeId: null,
      dependsOnNodeIds,
      agentProfileId: agentProfile?.id ?? null,
      skillIds: matchedSkillIds,
      mcpServerIds,
      taskType: planTask.taskType,
      title: planTask.taskTitle,
      prompt: planTask.cleanedPrompt,
      status,
      runId: null,
      resultSummary: null,
      resultPayload: null,
      retryCount: 0
    };

    nodes.push(node);
    nodeIds.push(nodeId);
  }

  // If there are multiple nodes, add an aggregation node at the end
  if (nodes.length > 1) {
    const aggNodeId = createId('orch-node');
    const allPriorIds = nodeIds.slice();
    const aggNode: OrchestrationNode = {
      id: aggNodeId,
      orchestrationRunId,
      parentNodeId: null,
      dependsOnNodeIds: allPriorIds,
      agentProfileId: masterAgentProfileId ?? null,
      skillIds: [],
      mcpServerIds: [],
      taskType: 'general',
      title: 'Aggregate results',
      prompt: `Synthesize the outputs from all preceding agent nodes into a coherent final response for the user request: ${rawInput}`,
      status: 'waiting_on_deps',
      runId: null,
      resultSummary: null,
      resultPayload: null,
      retryCount: 0
    };
    nodes.push(aggNode);
  }

  const orchestrationRun: OrchestrationRun = {
    id: orchestrationRunId,
    conversationId,
    rootPrompt: rawInput,
    status: 'planning',
    masterAgentProfileId: masterAgentProfileId ?? null,
    planVersion: 1,
    createdAt: now,
    updatedAt: now,
    finalSummary: null
  };

  return { orchestrationRun, nodes };
};

// ---------------------------------------------------------------------------
// createPlanDraft – backward-compatible wrapper
// ---------------------------------------------------------------------------

export const createPlanDraft = (
  input: PlanDraftInput,
  enabledAdapters: CliAdapter[],
  routingSettings: RoutingSettings
): PlanDraftResult => {
  const rawInput = input.rawInput;
  if (typeof rawInput !== 'string') throw new Error('Planner input must be a string.');

  const { segments, segmentationSource } = segmentPlannerInput(rawInput);
  const plannedTasks = segments.map((segment) => buildPlanTaskDraft(segment, enabledAdapters, routingSettings));
  const primaryTask = plannedTasks[0] ?? buildPlanTaskDraft(rawInput, enabledAdapters, routingSettings);

  const draft: PlanDraft = {
    rawInput,
    plannerVersion: PLANNER_VERSION,
    segmentationSource,
    plannedTasks,
    cleanedPrompt: primaryTask.cleanedPrompt,
    taskTitle: primaryTask.taskTitle,
    taskType: primaryTask.taskType,
    displayCategory: primaryTask.displayCategory,
    matchedProfileId: primaryTask.matchedProfileId,
    classificationReason: primaryTask.classificationReason,
    mentions: primaryTask.mentions,
    recommendedAdapterId: primaryTask.recommendedAdapterId,
    recommendedModel: primaryTask.recommendedModel,
    routingSource: primaryTask.routingSource,
    confidence: primaryTask.confidence,
    rationale: primaryTask.rationale
  };

  return { draft: structuredClone(draft) };
};
