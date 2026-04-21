import type { Locale, WorkbenchTargetKind, WorkbenchTaskItem } from '../../shared/domain.js';

export const CONFIG_PAGE_COPY = {
  en: {
    heroEyebrow: 'Configuration hub',
    heroTitle: 'Manage providers, local tools, and project-level skill bindings',
    heroCopy:
      'Hosted provider credentials stay in local app storage. Local tool preferences and workbench skill bindings stay with the project state.',
    indexEyebrow: 'Quick jump',
    indexTitle: 'Config index',
    providerGroupLabel: 'Hosted providers',
    localToolsGroupLabel: 'Local tools',
    otherGroupLabel: 'Other',
    providerOverviewLabel: 'Provider overview',
    skillBindingsLabel: 'Skill bindings',
    actionsLabel: 'Save & verify',
    providerSectionEyebrow: 'Hosted providers',
    providerSectionTitle: 'Provider connections',
    localToolsSectionEyebrow: 'Local tools',
    localToolsSectionTitle: 'Local tool detection & defaults',
    skillsSectionEyebrow: 'Skills',
    skillsSectionTitle: 'Project skill catalog',
    bindingRulesEyebrow: 'Binding rules',
    bindingRulesTitle: 'Enable skills by tool and model',
    actionsSectionEyebrow: 'Verification',
    actionsSectionTitle: 'Save & verify config',
    saveAllLabel: 'Save all configuration',
    testActiveProviderLabel: 'Test active provider',
    refreshLocalToolsLabel: 'Refresh local tool detection',
  },
  zh: {
    heroEyebrow: '配置中心',
    heroTitle: '统一管理模型服务、本地工具与项目级技能绑定',
    heroCopy: '模型服务凭据保存在本机应用配置中；本地工具偏好和工作台技能绑定保存在项目状态中。',
    indexEyebrow: '快速定位',
    indexTitle: '配置目录',
    providerGroupLabel: '模型服务',
    localToolsGroupLabel: '本地工具',
    otherGroupLabel: '其他',
    providerOverviewLabel: '模型服务总览',
    skillBindingsLabel: '技能绑定',
    actionsLabel: '保存与校验',
    providerSectionEyebrow: '模型服务',
    providerSectionTitle: '模型服务连接与默认模型',
    localToolsSectionEyebrow: '本地工具',
    localToolsSectionTitle: '本地工具检测与默认设置',
    skillsSectionEyebrow: '技能',
    skillsSectionTitle: '项目级技能目录',
    bindingRulesEyebrow: '绑定规则',
    bindingRulesTitle: '按工具和模型启用技能',
    actionsSectionEyebrow: '校验',
    actionsSectionTitle: '保存并验证配置',
    saveAllLabel: '保存所有配置',
    testActiveProviderLabel: '测试当前模型服务',
    refreshLocalToolsLabel: '刷新本地工具检测',
  },
} as const;

export const TARGET_KIND_LABELS: Record<Locale, Record<WorkbenchTargetKind, string>> = {
  en: {
    provider: 'Hosted provider',
    adapter: 'Local tool',
  },
  zh: {
    provider: '模型服务',
    adapter: '本地工具',
  },
};

export const WORKBENCH_TASK_STATUS_LABELS: Record<Locale, Record<WorkbenchTaskItem['status'], string>> = {
  en: {
    pending: 'Pending',
    in_progress: 'In progress',
    completed: 'Completed',
  },
  zh: {
    pending: '待处理',
    in_progress: '进行中',
    completed: '已完成',
  },
};
