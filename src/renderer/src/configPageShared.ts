import type { AppState, Locale, RoutingSettings, WorkbenchSkillBinding } from '../../shared/domain.js';

export interface InlineStatus {
  tone: 'success' | 'error' | 'loading';
  message: string;
}

export type ProviderStatusMap = Record<string, InlineStatus | null>;
export type VisibilityMap = Record<string, boolean>;

export const createProviderStatusMap = (): ProviderStatusMap => ({});

export const createVisibilityMap = (): VisibilityMap => ({});

export const createSkillBinding = (): WorkbenchSkillBinding => ({
  id: `skill-binding-${crypto.randomUUID()}`,
  targetKind: 'provider',
  targetId: '',
  modelPattern: '*',
  enabledSkillIds: [],
});

export const getDraftAdapterSetting = (
  adapter: Pick<AppState['adapters'][number], 'defaultModel'>,
  currentSetting: RoutingSettings['adapterSettings'][string] | undefined,
): RoutingSettings['adapterSettings'][string] => {
  return {
    enabled: currentSetting?.enabled ?? true,
    defaultModel: currentSetting?.defaultModel ?? adapter.defaultModel ?? '',
    customCommand: currentSetting?.customCommand ?? '',
  };
};

export const getConfigSaveStatusMessage = (locale: Locale, storageKey: string): InlineStatus => {
  return {
    tone: 'success',
    message:
      locale === 'zh'
        ? `模型服务配置已保存到 ${storageKey}，项目级工具与技能设置已保存到仓库状态。`
        : `Saved provider config to ${storageKey} and project-scoped tool/skill settings to the repo state.`,
  };
};

export const getProviderConnectionLoadingStatus = (locale: Locale): InlineStatus => {
  return { tone: 'loading', message: locale === 'zh' ? '测试连接中...' : 'Testing connection...' };
};

export const getActiveProviderConnectionStatus = (locale: Locale, latencyMs: number): InlineStatus => {
  return {
    tone: 'success',
    message: locale === 'zh' ? `当前模型服务连接成功，耗时 ${latencyMs} ms。` : `Active provider connected in ${latencyMs} ms.`,
  };
};

export const getActiveProviderRequiredStatus = (locale: Locale): InlineStatus => {
  return {
    tone: 'error',
    message: locale === 'zh' ? '请先选择一个当前模型服务。' : 'Choose an active provider first.',
  };
};

export const getAdapterRefreshLoadingStatus = (locale: Locale): InlineStatus => {
  return {
    tone: 'loading',
    message: locale === 'zh' ? '正在按当前设置刷新本地工具检测...' : 'Refreshing local tool detection with the current settings...',
  };
};

export const getAdapterRefreshSuccessStatus = (locale: Locale, availableCount: number): InlineStatus => {
  return {
    tone: 'success',
    message:
      locale === 'zh'
        ? `已刷新本地工具状态，当前检测到 ${availableCount} 个可用工具。`
        : `Refreshed local tool detection. ${availableCount} user-facing adapters are currently available.`,
  };
};
