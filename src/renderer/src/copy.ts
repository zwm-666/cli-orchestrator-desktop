import type {
  AgentRoleType,
  CliAdapter,
  ExecutionTranscriptEntry,
  Locale,
  PlanConfidence,
  PlanRoutingSource,
  PlanSegmentationSource,
  RunEvent,
  RunSession,
  Task,
  TaskType
} from '../../shared/domain.js';

export type PrimaryPage = 'launch' | 'sessions' | 'settings' | 'orchestration';

export type Notice =
  | { type: 'loading' }
  | { type: 'ready'; adapters: number; runs: number }
  | { type: 'settingsSaved' }
  | { type: 'toolsRefreshed'; adapters: number }
  | { type: 'planReady'; adapterName: string }
  | { type: 'planApplied'; title: string; adapterName: string }
  | { type: 'runStarted'; title: string; adapterName: string }
  | { type: 'cancelRequested'; title: string }
  | { type: 'cancelFailed'; title: string; message: string }
  | { type: 'runEvent'; runId: string; message: string }
  | { type: 'error'; message: string };

export interface NewTaskProfileDraft {
  label: string;
  taskType: TaskType;
  adapterId: string;
  model: string;
}

export const LOCALES: Locale[] = ['en', 'zh'];

export const DEFAULT_NEW_TASK_PROFILE: NewTaskProfileDraft = {
  label: '',
  taskType: 'general',
  adapterId: '',
  model: ''
};

export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'EN',
  zh: '中文'
};

export const COPY = {
  en: {
    heroEyebrow: 'Desktop operator',
    heroTitle: 'Launch and monitor local CLI runs',
    heroCopy:
      'Switch language, pick each run explicitly, and inspect live renderer-safe output through the preload bridge.',
    shellTitle: 'CLI Orchestrator',
    shellCopy: 'A steadier desktop shell for local launch, live session review, and routing control.',
    sidebarCollapse: 'Collapse sidebar',
    sidebarExpand: 'Expand sidebar',
    pagesLabel: 'Pages',
    overviewLabel: 'Overview',
    utilitiesLabel: 'Utilities',
    navLaunch: 'Launch',
    navLaunchShort: 'LA',
    navSessions: 'Sessions',
    navSessionsShort: 'SE',
    navSettings: 'Settings',
    navSettingsShort: 'ST',
    statsAdapters: 'Adapters',
    statsRuns: 'Runs',
    statsEvents: 'Events',
    statusLabel: 'Renderer status',
    liveSubscriptions: 'Live subscriptions active',
    launchEyebrow: 'Launch pad',
    launchTitle: 'Start a configured run',
    launchFormTitle: 'Run configuration',
    launchCopy:
      'Draft a local plan from freeform input, review the recommended adapter, then launch a real CLI session when ready.',
    runTitleLabel: 'Run title',
    runTitlePlaceholder: 'Summarize the job for this run',
    promptLabel: 'Prompt',
    promptPlaceholder: 'Describe the work you want the adapter to perform',
    planAction: 'Plan draft',
    planningAction: 'Planning...',
    applyPlanAction: 'Apply plan to form',
    plannerEyebrow: 'Planner draft',
    plannerTitle: 'Review local routing before launch',
    plannerEmpty: 'No plan yet. Use the current prompt to generate a local routing draft.',
    plannerTaskTitle: 'Task draft',
    plannerTaskCount: 'Planned tasks',
    plannerTaskType: 'Task type',
    plannerRecommendedModel: 'Recommended model',
    plannerClassificationReason: 'Classification reason',
    plannerRecommendedAdapter: 'Recommended adapter',
    plannerRoutingSource: 'Routing source',
    plannerSegmentationSource: 'Segmentation',
    plannerConfidence: 'Confidence',
    plannerMentions: 'Mentions',
    plannerRationale: 'Rationale',
    plannerVersion: 'Planner version',
    plannerCleanedPrompt: 'Cleaned prompt',
    plannerReviewHint: 'Select one drafted task, then apply it to the launch form when ready.',
    plannerNoAdapter: 'No adapter recommended',
    plannerNoMentions: 'No adapter mentions detected',
    adapterLabel: 'Adapter',
    modelLabel: 'Model',
    modelPlaceholder: 'Optional model, for example gpt-5.4',
    conversationLabel: 'Conversation context',
    newConversationOption: 'Create a new conversation',
    timeoutLabel: 'Timeout (ms)',
    timeoutPlaceholder: 'Optional, for example 300000',
    launchEnvironmentAdvisory:
      'This adapter is available, but the current environment may block this launch path. You can still try launching.',
    startRun: 'Start run',
    startingRun: 'Starting...',
    cancelRun: 'Cancel run',
    cancellingRun: 'Cancelling...',
    cancelRequestedAction: 'Cancellation requested',
    noEnabledAdapters: 'No enabled adapters are available in the current config.',
    adapterBriefing: 'Adapter briefing',
    conversationTarget: 'Conversation target',
    createConversationHint: 'Leave the selector empty to create a new thread for the run.',
    newConversationLabel: 'New conversation',
    commandPreview: 'Command preview',
    timeoutWindow: 'Timeout',
    cancellationState: 'Cancellation',
    cancellationIdle: 'Not requested',
    capabilities: 'Capabilities',
    sessionsEyebrow: 'Sessions',
    sessionsTitle: 'Run switchboard',
    sessionsCopy:
      'Switch sessions explicitly, keep live output in view, then drill into command and task details only when needed.',
    runListTitle: 'Run sessions',
    runListEmpty: 'No runs yet. Start one from the launch pad.',
    sessionInspector: 'Session inspector',
    executionSummary: 'Execution summary',
    executionTimeline: 'Execution timeline',
    executionTimelineEmpty: 'No execution transcript yet. The task will populate this timeline as work begins.',
    detailsTitle: 'Run details',
    noRunSelected: 'Select a run to inspect its session.',
    liveOutput: 'Live output',
    liveOutputEmpty: 'Output will appear here as the CLI emits events.',
    targetTool: 'Target tool',
    invocationState: 'Invocation',
    invocationNoEvidence: 'Not observed yet',
    invocationObservedProcess: 'Process observed',
    invocationObservedActivity: 'Activity observed',
    invocationCancelRequested: 'Cancel requested',
    invocationEnded: 'Ended',
    processId: 'Process ID',
    timelineEntries: 'Timeline entries',
    rawEvents: 'Raw events',
    status: 'Status',
    startedAt: 'Started',
    endedAt: 'Ended',
    exitCode: 'Exit code',
    task: 'Task',
    conversation: 'Conversation',
    adapter: 'Adapter',
    requestedBy: 'Requested by',
    cliMention: 'CLI mention',
    eventCount: 'events',
    tasksEyebrow: 'Tasks',
    tasksTitle: 'Task ledger',
    tasksCopy: 'Task records stay nearby while you inspect each session.',
    tasksEmpty: 'No tasks yet.',
    conversationsEyebrow: 'Conversations',
    conversationsTitle: 'Available threads',
    conversationsCopy: 'Click a thread to reuse it the next time you launch a run.',
    conversationsEmpty: 'No conversations yet.',
    latestMessage: 'Latest message',
    messageCount: 'messages',
    selectedContext: 'Selected for launch',
    adaptersEyebrow: 'Adapters',
    adaptersTitle: 'Configured CLIs',
    adaptersCopy: 'The launch panel only offers enabled adapters, but the full roster stays visible here.',
    launchRailTitle: 'Launch context',
    launchRailCopy: 'Keep adapter context, timeout, and reusable threads nearby while you prepare the run.',
    settingsRailCopy: 'Review the full adapter roster while tuning routing preferences.',
    routingTitle: 'Routing preferences',
    routingCopy: 'Enable adapters here and map task types to the preferred CLI and model used by the planner.',
    adapterSettingsTitle: 'Adapter settings',
    taskRoutingTitle: 'Task-type routing',
    taskProfilesTitle: 'Custom task categories',
    taskProfilesCopy: 'Create your own task categories, map each one to an internal planner type, then choose the preferred CLI and model.',
    taskProfileNameLabel: 'Category name',
    taskProfileBaseTypeLabel: 'Planner base type',
    taskProfileAddAction: 'Add category',
    taskProfileEmpty: 'No custom categories yet. Add one to override how a planner type routes.',
    taskProfileDelete: 'Delete',
    taskProfileNameRequired: 'Category name is required.',
    refreshTools: 'Refresh local tools',
    refreshingTools: 'Refreshing...',
    toolsRefreshed: 'Local tools refreshed.',
    saveSettings: 'Save settings',
    savingSettings: 'Saving settings...',
    settingsSaved: 'Routing settings saved.',
    settingsSaveFailed: 'Unable to save routing settings.',
    useAdapterDefault: 'Use adapter default',
    enabled: 'Enabled',
    disabled: 'Disabled',
    available: 'Available',
    unavailable: 'Not found',
    readinessReady: 'Ready',
    readinessBlockedByEnvironment: 'Blocked by environment',
    readinessUnavailable: 'Unavailable',
    discoveryReasonLabel: 'Discovery',
    readinessReasonLabel: 'Readiness',
    customCommandLabel: 'Custom path',
    customCommandPlaceholder: 'Override executable path, e.g. /usr/local/bin/claude',
    languageLabel: 'Language',
    loadError: 'Unable to load renderer state.',
    planInputRequired: 'Planner input is required.',
    titleRequired: 'Run title is required.',
    promptRequired: 'Run prompt is required.',
    timeoutInvalid: 'Timeout must be a whole number of milliseconds.',
    timeoutPositive: 'Timeout must be greater than 0 ms.',
    noTimeout: 'No timeout',
    unknown: 'Unknown',
    emptyValue: '--'
  },
  zh: {
    heroEyebrow: '桌面调度台',
    heroTitle: '启动并监看本地 CLI 运行',
    heroCopy: '在中英文之间切换，按页面整理启动、会话与设置，并通过 preload 桥接安全查看本地 CLI 的实时输出。',
    shellTitle: 'CLI 调度台',
    shellCopy: '固定导航、精简页面层级，并把实时输出放回更靠前的位置。',
    sidebarCollapse: '收起侧栏',
    sidebarExpand: '展开侧栏',
    pagesLabel: '页面',
    overviewLabel: '概览',
    utilitiesLabel: '工具',
    navLaunch: '启动',
    navLaunchShort: '启',
    navSessions: '会话',
    navSessionsShort: '会',
    navSettings: '设置',
    navSettingsShort: '设',
    statsAdapters: '适配器',
    statsRuns: '运行会话',
    statsEvents: '事件',
    statusLabel: '渲染层状态',
    liveSubscriptions: '实时订阅已连接',
    launchEyebrow: '启动面板',
    launchTitle: '发起已配置的运行',
    launchFormTitle: '运行配置',
    launchCopy: '先根据自由输入生成本地规划草案，确认推荐适配器后，再按原流程启动真实 CLI 运行。',
    runTitleLabel: '运行标题',
    runTitlePlaceholder: '为这次运行写一个简短标题',
    promptLabel: '提示词',
    promptPlaceholder: '描述希望适配器执行的工作',
    planAction: '生成规划',
    planningAction: '规划中...',
    applyPlanAction: '应用到启动表单',
    plannerEyebrow: '规划草案',
    plannerTitle: '在启动前查看本地路由建议',
    plannerEmpty: '还没有规划结果。请基于当前提示词生成本地路由草案。',
    plannerTaskTitle: '任务草案',
    plannerTaskCount: '规划任务数',
    plannerTaskType: '任务类型',
    plannerRecommendedModel: '推荐模型',
    plannerClassificationReason: '分类原因',
    plannerRecommendedAdapter: '推荐适配器',
    plannerRoutingSource: '路由来源',
    plannerSegmentationSource: '拆分来源',
    plannerConfidence: '置信度',
    plannerMentions: '提及标记',
    plannerRationale: '原因说明',
    plannerVersion: '规划器版本',
    plannerCleanedPrompt: '清洗后提示词',
    plannerReviewHint: '先选定一个规划任务，再按原流程把它应用到启动表单。',
    plannerNoAdapter: '没有推荐适配器',
    plannerNoMentions: '未检测到适配器标记',
    adapterLabel: '适配器',
    modelLabel: '模型',
    modelPlaceholder: '可选，例如 gpt-5.4',
    conversationLabel: '会话上下文',
    newConversationOption: '创建新会话',
    timeoutLabel: '超时时间（毫秒）',
    timeoutPlaceholder: '可选，例如 300000',
    launchEnvironmentAdvisory: '这个适配器本身可用，但当前环境可能会阻止这条启动路径。你仍然可以继续尝试启动。',
    startRun: '启动运行',
    startingRun: '启动中...',
    cancelRun: '取消运行',
    cancellingRun: '取消中...',
    cancelRequestedAction: '已请求取消',
    noEnabledAdapters: '当前配置里没有可用的启用适配器。',
    adapterBriefing: '适配器简报',
    conversationTarget: '会话目标',
    createConversationHint: '保持为空时，这次运行会自动创建一个新线程。',
    newConversationLabel: '新会话',
    commandPreview: '命令预览',
    timeoutWindow: '超时策略',
    cancellationState: '取消状态',
    cancellationIdle: '未请求',
    capabilities: '能力标签',
    sessionsEyebrow: '运行会话',
    sessionsTitle: '运行切换台',
    sessionsCopy: '先明确切换会话，并把实时输出保持在视线内，再按需查看命令和任务细节。',
    runListTitle: '运行列表',
    runListEmpty: '还没有运行会话，请先在启动面板发起一次运行。',
    sessionInspector: '会话详情',
    executionSummary: '执行概览',
    executionTimeline: '执行时间线',
    executionTimelineEmpty: '还没有执行时间线。任务开始后，这里会持续展示过程。',
    detailsTitle: '运行详情',
    noRunSelected: '请选择一个运行会话以查看详情。',
    liveOutput: '实时输出',
    liveOutputEmpty: 'CLI 输出事件后，这里会持续更新。',
    targetTool: '目标工具',
    invocationState: '调用状态',
    invocationNoEvidence: '尚未观察到',
    invocationObservedProcess: '已观察到进程',
    invocationObservedActivity: '已观察到活动',
    invocationCancelRequested: '已请求取消',
    invocationEnded: '已结束',
    processId: '进程 ID',
    timelineEntries: '时间线记录',
    rawEvents: '输出事件',
    status: '状态',
    startedAt: '开始时间',
    endedAt: '结束时间',
    exitCode: '退出码',
    task: '任务',
    conversation: '会话',
    adapter: '适配器',
    requestedBy: '请求来源',
    cliMention: 'CLI 标记',
    eventCount: '条事件',
    tasksEyebrow: '任务',
    tasksTitle: '任务账本',
    tasksCopy: '查看会话详情时，相关任务记录会固定显示在侧栏。',
    tasksEmpty: '暂时没有任务。',
    conversationsEyebrow: '会话线程',
    conversationsTitle: '可复用线程',
    conversationsCopy: '点击线程即可把它设为下次启动运行的上下文。',
    conversationsEmpty: '暂时没有会话。',
    latestMessage: '最新消息',
    messageCount: '条消息',
    selectedContext: '已选为启动上下文',
    adaptersEyebrow: '适配器',
    adaptersTitle: '已配置 CLI',
    adaptersCopy: '启动面板只展示启用项，但完整配置清单仍会显示在这里。',
    launchRailTitle: '启动上下文',
    launchRailCopy: '把适配器上下文、超时信息和可复用线程放在侧栏里，方便一边准备一边查看。',
    settingsRailCopy: '调整路由偏好时，完整适配器清单会固定显示在侧栏。',
    routingTitle: '路由偏好',
    routingCopy: '在这里启用适配器，并为不同任务类型指定默认 CLI 与模型。',
    adapterSettingsTitle: '适配器设置',
    taskRoutingTitle: '任务类型路由',
    taskProfilesTitle: '自定义任务类别',
    taskProfilesCopy: '你可以新增自己的任务类别，把它映射到内部规划类型，并指定默认 CLI 与模型。',
    taskProfileNameLabel: '类别名称',
    taskProfileBaseTypeLabel: '规划基础类型',
    taskProfileAddAction: '新增类别',
    taskProfileEmpty: '还没有自定义类别。新增一个即可覆盖某类任务的默认路由。',
    taskProfileDelete: '删除',
    taskProfileNameRequired: '类别名称不能为空。',
    refreshTools: '刷新本地工具',
    refreshingTools: '刷新中...',
    toolsRefreshed: '本地工具已刷新。',
    saveSettings: '保存设置',
    savingSettings: '保存中...',
    settingsSaved: '路由设置已保存。',
    settingsSaveFailed: '无法保存路由设置。',
    useAdapterDefault: '使用适配器默认值',
    enabled: '已启用',
    disabled: '已禁用',
    available: '可用',
    unavailable: '未发现',
    readinessReady: '已就绪',
    readinessBlockedByEnvironment: '受环境限制',
    readinessUnavailable: '不可用',
    discoveryReasonLabel: '发现状态',
    readinessReasonLabel: '就绪状态',
    customCommandLabel: '自定义路径',
    customCommandPlaceholder: '覆盖可执行文件路径，例如 /usr/local/bin/claude',
    languageLabel: '语言',
    loadError: '无法加载渲染层状态。',
    planInputRequired: '规划输入不能为空。',
    titleRequired: '运行标题不能为空。',
    promptRequired: '运行提示词不能为空。',
    timeoutInvalid: '超时时间必须是毫秒整数。',
    timeoutPositive: '超时时间必须大于 0 毫秒。',
    noTimeout: '不设超时',
    unknown: '未知',
    emptyValue: '--'
  }
} as const;

export const RUN_STATUS_LABELS: Record<Locale, Record<RunSession['status'], string>> = {
  en: {
    pending: 'Pending',
    running: 'Running',
    succeeded: 'Succeeded',
    interrupted: 'Interrupted',
    spawn_failed: 'Spawn failed',
    failed: 'Failed',
    cancelled: 'Cancelled',
    timed_out: 'Timed out'
  },
  zh: {
    pending: '等待中',
    running: '运行中',
    succeeded: '已成功',
    interrupted: '已中断',
    spawn_failed: '启动失败',
    failed: '已失败',
    cancelled: '已取消',
    timed_out: '已超时'
  }
};

export const TASK_STATUS_LABELS: Record<Locale, Record<Task['status'], string>> = {
  en: {
    queued: 'Queued',
    ready: 'Ready',
    running: 'Running',
    completed: 'Completed',
    failed: 'Failed',
    interrupted: 'Interrupted',
    cancelled: 'Cancelled',
    timed_out: 'Timed out',
    spawn_failed: 'Spawn failed'
  },
  zh: {
    queued: '排队中',
    ready: '就绪',
    running: '运行中',
    completed: '已完成',
    failed: '已失败',
    interrupted: '已中断',
    cancelled: '已取消',
    timed_out: '已超时',
    spawn_failed: '启动失败'
  }
};

export const HEALTH_LABELS: Record<Locale, Record<CliAdapter['health'], string>> = {
  en: {
    healthy: 'Healthy',
    idle: 'Idle',
    attention: 'Needs attention'
  },
  zh: {
    healthy: '健康',
    idle: '空闲',
    attention: '需关注'
  }
};

export const READINESS_LABELS: Record<Locale, Record<CliAdapter['readiness'], string>> = {
  en: {
    ready: COPY.en.readinessReady,
    blocked_by_environment: COPY.en.readinessBlockedByEnvironment,
    unavailable: COPY.en.readinessUnavailable
  },
  zh: {
    ready: COPY.zh.readinessReady,
    blocked_by_environment: COPY.zh.readinessBlockedByEnvironment,
    unavailable: COPY.zh.readinessUnavailable
  }
};

export const READINESS_BADGE_CLASSES: Record<CliAdapter['readiness'], string> = {
  ready: 'state-succeeded',
  blocked_by_environment: 'state-attention',
  unavailable: 'state-cancelled'
};

export const EVENT_LEVEL_LABELS: Record<Locale, Record<RunEvent['level'], string>> = {
  en: {
    info: 'Info',
    warning: 'Warning',
    success: 'Success',
    stdout: 'Stdout',
    stderr: 'Stderr',
    error: 'Error'
  },
  zh: {
    info: '信息',
    warning: '警告',
    success: '成功',
    stdout: '标准输出',
    stderr: '标准错误',
    error: '错误'
  }
};

export const TRANSCRIPT_KIND_LABELS: Record<Locale, Record<ExecutionTranscriptEntry['kind'], string>> = {
  en: {
    run_started: 'Run started',
    step_started: 'Step started',
    step_output: 'Step update',
    step_completed: 'Step completed',
    step_failed: 'Step failed',
    run_completed: 'Run completed',
    run_failed: 'Run failed'
  },
  zh: {
    run_started: '运行开始',
    step_started: '步骤开始',
    step_output: '步骤更新',
    step_completed: '步骤完成',
    step_failed: '步骤失败',
    run_completed: '运行完成',
    run_failed: '运行失败'
  }
};

export const ROUTING_SOURCE_LABELS: Record<Locale, Record<PlanRoutingSource, string>> = {
  en: {
    explicit_mention: 'Explicit mention',
    task_type_rule: 'Task-type rule',
    first_enabled_adapter: 'First enabled adapter',
    no_enabled_adapter: 'No enabled adapter'
  },
  zh: {
    explicit_mention: '显式标记',
    task_type_rule: '任务类型规则',
    first_enabled_adapter: '首个启用适配器',
    no_enabled_adapter: '没有启用适配器'
  }
};

export const SEGMENTATION_SOURCE_LABELS: Record<Locale, Record<PlanSegmentationSource, string>> = {
  en: {
    single_fallback: 'Single fallback',
    bullets: 'Bullet split',
    lines: 'Line split',
    sentences: 'Sentence split',
    conjunctions: 'Conjunction split'
  },
  zh: {
    single_fallback: '单段回退',
    bullets: '按项目符号拆分',
    lines: '按换行拆分',
    sentences: '按句拆分',
    conjunctions: '按连词拆分'
  }
};

export const PLAN_CONFIDENCE_LABELS: Record<Locale, Record<PlanConfidence, string>> = {
  en: {
    high: 'High',
    medium: 'Medium',
    low: 'Low'
  },
  zh: {
    high: '高',
    medium: '中',
    low: '低'
  }
};

export const TASK_TYPE_LABELS: Record<Locale, Record<TaskType, string>> = {
  en: {
    general: 'General',
    planning: 'Planning',
    code: 'Code',
    frontend: 'Frontend',
    research: 'Research',
    git: 'Git',
    ops: 'Ops'
  },
  zh: {
    general: '通用',
    planning: '规划',
    code: '代码',
    frontend: '前端',
    research: '研究',
    git: 'Git',
    ops: '运维'
  }
};

export const AGENT_ROLE_LABELS: Record<Locale, Record<AgentRoleType, string>> = {
  en: {
    master: 'Master',
    planner: 'Planner',
    researcher: 'Researcher',
    coder: 'Coder',
    reviewer: 'Reviewer',
    tester: 'Tester',
    custom: 'Custom'
  },
  zh: {
    master: '主控',
    planner: '规划',
    researcher: '研究',
    coder: '编码',
    reviewer: '审查',
    tester: '测试',
    custom: '自定义'
  }
};

export const AGENT_ROLES: AgentRoleType[] = ['master', 'planner', 'researcher', 'coder', 'reviewer', 'tester', 'custom'];

export const MUTABLE_RUN_STATUSES: RunSession['status'][] = ['pending', 'running'];
