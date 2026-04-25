import { useEffect, useState } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import type { AppState, Locale, RendererContinuityState, RoutingSettings, SaveSkillInput, SelectWorkspaceFolderResult, SkillDefinition, WorkbenchState } from '../../shared/domain.js';
import { DEFAULT_LOCAL_TOOL_REGISTRY, DEFAULT_ROUTING_SETTINGS, DEFAULT_WORKBENCH_STATE } from '../../shared/domain.js';
import { DEFAULT_PROMPT_BUILDER_CONFIG, type PromptBuilderConfig } from '../../shared/promptBuilder.js';
import { loadAiConfig, loadAiConfigFromPersistence, saveAiConfig, type AiConfig } from './aiConfig.js';
import { TopNav, type ThemeName } from './components/TopNav.js';
import { ConfigPage } from './pages/ConfigPage.js';
import { FolderSelectPage } from './pages/FolderSelectPage.js';
import { PlanPage } from './pages/PlanPage.js';
import { WorkPage } from './pages/WorkPage.js';

const DEFAULT_CONTINUITY: RendererContinuityState = {
  locale: 'en',
  selectedRunId: null,
  selectedConversationId: null,
  selectedPlannedTaskIndex: 0,
  launchForm: { title: '', prompt: '', adapterId: '', model: '', conversationId: '', timeoutMs: '' },
  planDraft: null,
  lastRoute: null,
};

const DEFAULT_APP_STATE: AppState = {
  adapters: [],
  conversations: [],
  tasks: [],
  runs: [],
  subagentStatuses: [],
  localToolRegistry: DEFAULT_LOCAL_TOOL_REGISTRY,
  localToolCallLogs: [],
  projectContext: { summary: '', updatedAt: null },
  nextClaudeTask: { prompt: '', sourceOrchestrationRunId: null, generatedAt: null, status: 'idle' },
  agentProfiles: [],
  skills: [],
  mcpServers: [],
  orchestrationRuns: [],
  orchestrationNodes: [],
  workbench: DEFAULT_WORKBENCH_STATE,
};

const THEME_STORAGE_KEY = 'cli-orchestrator-theme';

const isThemeName = (value: string | null): value is ThemeName => {
  return value === 'black' || value === 'oc-2';
};

const normalizeThemeName = (value: string | null): ThemeName => {
  if (isThemeName(value)) {
    return value;
  }

  if (value === 'dark') {
    return 'black';
  }

  if (value === 'oc2') {
    return 'oc-2';
  }

  return 'oc-2';
};

const loadInitialTheme = (): ThemeName => {
  if (typeof window === 'undefined') {
    return 'oc-2';
  }

  const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  return normalizeThemeName(storedTheme);
};

interface RoutePersistenceProps {
  continuityState: RendererContinuityState;
  onSaveContinuityState: (state: RendererContinuityState) => Promise<void>;
}

function RoutePersistence({ continuityState, onSaveContinuityState }: RoutePersistenceProps): null {
  const location = useLocation();

  useEffect(() => {
    if (location.pathname !== '/plan' && location.pathname !== '/work' && location.pathname !== '/config') {
      return;
    }

    if (continuityState.lastRoute === location.pathname) {
      return;
    }

    void onSaveContinuityState({
      ...continuityState,
      lastRoute: location.pathname,
    });
  }, [continuityState, location.pathname, onSaveContinuityState]);

  return null;
}

interface RoutedAppContentProps {
  locale: Locale;
  theme: ThemeName;
  aiConfig: AiConfig;
  appState: AppState;
  routingSettings: RoutingSettings;
  continuityState: RendererContinuityState;
  promptBuilderConfig: PromptBuilderConfig;
  isSelectingProjectFolder: boolean;
  onSelectProjectFolder: () => Promise<SelectWorkspaceFolderResult>;
  onOpenRecentWorkspace: (workspaceRoot: string) => Promise<void>;
  onRemoveRecentWorkspace: (workspaceRoot: string) => Promise<void>;
  onSetLocale: (locale: Locale) => void;
  onSetTheme: (theme: ThemeName) => void;
  onSaveAiConfig: (nextConfig: AiConfig) => Promise<void>;
  onSaveRoutingSettings: (nextSettings: RoutingSettings) => Promise<void>;
  onSaveWorkbenchState: (nextWorkbenchState: WorkbenchState) => Promise<void>;
  onSaveContinuityState: (nextState: RendererContinuityState) => Promise<void>;
  onSaveSkill: (skill: SkillDefinition) => Promise<void>;
  onSavePromptBuilderConfig: (config: PromptBuilderConfig) => void;
}

const hasPlanSeed = (workbench: WorkbenchState | undefined): boolean => {
  return Boolean(workbench?.objective.trim() || (workbench?.tasks.length ?? 0) > 0);
};

function RoutedAppContent(props: RoutedAppContentProps): React.JSX.Element {
  const {
    locale,
    theme,
    aiConfig,
    appState,
    routingSettings,
    continuityState,
    promptBuilderConfig,
    isSelectingProjectFolder,
    onSelectProjectFolder,
    onOpenRecentWorkspace,
    onRemoveRecentWorkspace,
    onSetLocale,
    onSetTheme,
    onSaveAiConfig,
    onSaveRoutingSettings,
    onSaveWorkbenchState,
    onSaveContinuityState,
    onSaveSkill,
    onSavePromptBuilderConfig,
  } = props;
  const location = useLocation();
  const navigate = useNavigate();
  const workbench = appState.workbench ?? DEFAULT_WORKBENCH_STATE;
  const hasWorkspaceRoot = Boolean(workbench.workspaceRoot);
  const shouldShowTopNav = location.pathname !== '/' && hasWorkspaceRoot;
  const defaultWorkspaceRoute = continuityState.lastRoute && continuityState.lastRoute !== '/config'
    ? continuityState.lastRoute
    : hasPlanSeed(workbench)
      ? '/work'
      : '/plan';

  const openProjectFolder = async (): Promise<void> => {
    const selection = await onSelectProjectFolder();
    if (selection.workspaceRoot) {
      void navigate('/plan');
    }
  };

  const openRecentWorkspace = async (workspaceRoot: string): Promise<void> => {
    await onOpenRecentWorkspace(workspaceRoot);
    void navigate(hasPlanSeed(workbench) ? '/work' : '/plan');
  };

  return (
    <div className="routed-shell">
      {shouldShowTopNav ? (
        <TopNav
          locale={locale}
          workspaceLabel={workbench.workspaceRoot?.split(/[/\\]/).filter(Boolean).at(-1) ?? null}
          theme={theme}
          onSetLocale={onSetLocale}
          onSetTheme={onSetTheme}
          onSwitchProject={() => {
            void navigate('/');
          }}
        />
      ) : null}

      <main className="routed-shell-main">
        <RoutePersistence continuityState={continuityState} onSaveContinuityState={onSaveContinuityState} />
        <Routes>
          <Route
            path="/"
            element={
              <FolderSelectPage
                locale={locale}
                currentWorkspaceRoot={workbench.workspaceRoot}
                recentWorkspaceRoots={workbench.recentWorkspaceRoots ?? []}
                isSelecting={isSelectingProjectFolder}
                onOpenFolder={() => {
                  void openProjectFolder();
                }}
                onOpenRecentWorkspace={(workspaceRoot) => {
                  void openRecentWorkspace(workspaceRoot);
                }}
                onRemoveRecentWorkspace={(workspaceRoot) => {
                  void onRemoveRecentWorkspace(workspaceRoot);
                }}
              />
            }
          />
          <Route
            path="/plan"
            element={hasWorkspaceRoot ? (
              <PlanPage
                locale={locale}
                appState={appState}
                continuityState={continuityState}
                onSaveWorkbenchState={onSaveWorkbenchState}
                onSaveContinuityState={onSaveContinuityState}
              />
            ) : <Navigate to="/" replace />}
          />
          <Route
            path="/work"
            element={hasWorkspaceRoot ? (
              <WorkPage
                locale={locale}
                aiConfig={aiConfig}
                appState={appState}
                promptBuilderConfig={promptBuilderConfig}
                onSaveWorkbenchState={(nextState) => {
                  void onSaveWorkbenchState(nextState);
                }}
              />
            ) : <Navigate to="/" replace />}
          />
          <Route
            path="/config"
            element={hasWorkspaceRoot ? (
              <ConfigPage
                locale={locale}
                aiConfig={aiConfig}
                appState={appState}
                routingSettings={routingSettings}
                onSaveAiConfig={onSaveAiConfig}
                onSaveRoutingSettings={(nextSettings) => {
                  void onSaveRoutingSettings(nextSettings);
                }}
                onSaveWorkbenchState={(nextState) => {
                  void onSaveWorkbenchState(nextState);
                }}
                onSaveSkill={(skill) => {
                  void onSaveSkill(skill);
                }}
                onSavePromptBuilderConfig={onSavePromptBuilderConfig}
              />
            ) : <Navigate to="/" replace />}
          />
          <Route path="*" element={<Navigate to={hasWorkspaceRoot ? defaultWorkspaceRoute : '/'} replace />} />
        </Routes>
      </main>
    </div>
  );
}

export function App(): React.JSX.Element {
  const [aiConfig, setAiConfig] = useState<AiConfig>(() => loadAiConfig());
  const [appState, setAppState] = useState(DEFAULT_APP_STATE);
  const [routingSettings, setRoutingSettings] = useState(DEFAULT_ROUTING_SETTINGS);
  const [continuityState, setContinuityState] = useState(DEFAULT_CONTINUITY);
  const [promptBuilderConfig, setPromptBuilderConfig] = useState(DEFAULT_PROMPT_BUILDER_CONFIG);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isSelectingProjectFolder, setIsSelectingProjectFolder] = useState(false);
  const [theme, setTheme] = useState<ThemeName>(() => loadInitialTheme());
  const locale: Locale = continuityState.locale;

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    let isActive = true;

    const loadState = async (): Promise<void> => {
      try {
        const [nextAiConfig, nextAppState, nextRoutingSettings, nextContinuityState, nextPromptBuilderConfig] = await Promise.all([
          loadAiConfigFromPersistence(),
          window.desktopApi.getAppState(),
          window.desktopApi.getRoutingSettings(),
          window.desktopApi.getContinuityState(),
          window.desktopApi.getPromptBuilderConfig(),
        ]);

        if (!isActive) {
          return;
        }

        setAiConfig(nextAiConfig);
        setAppState({ ...nextAppState, workbench: nextAppState.workbench ?? DEFAULT_WORKBENCH_STATE });
        setRoutingSettings(nextRoutingSettings);
        setContinuityState(nextContinuityState);
        setPromptBuilderConfig(nextPromptBuilderConfig);
      } finally {
        if (isActive) {
          setIsBootstrapping(false);
        }
      }
    };

    void loadState();

    const unsubscribeState = window.desktopApi.onAppStateChanged((statePatch) => {
      setAppState((currentState) => {
        const nextState = { ...currentState, ...statePatch };
        return { ...nextState, workbench: nextState.workbench ?? DEFAULT_WORKBENCH_STATE };
      });
    });

    return () => {
      isActive = false;
      unsubscribeState();
    };
  }, []);

  const handleSaveAiConfig = async (nextConfig: AiConfig): Promise<void> => {
    setAiConfig(nextConfig);
    await saveAiConfig(nextConfig);
  };

  const handleSaveRoutingSettings = async (nextSettings: RoutingSettings): Promise<void> => {
    const saved = await window.desktopApi.saveRoutingSettings({ settings: nextSettings });
    setRoutingSettings(saved);
  };

  const handleSaveWorkbenchState = async (nextWorkbenchState: WorkbenchState): Promise<void> => {
    const nextAppState = await window.desktopApi.saveWorkbenchState({ state: nextWorkbenchState });
    setAppState({ ...nextAppState, workbench: nextAppState.workbench ?? DEFAULT_WORKBENCH_STATE });
  };

  const handleSelectProjectFolder = async (): Promise<SelectWorkspaceFolderResult> => {
    setIsSelectingProjectFolder(true);
    try {
      const selection = await window.desktopApi.selectProjectFolder();
      const nextAppState = await window.desktopApi.getAppState();
      setAppState({ ...nextAppState, workbench: nextAppState.workbench ?? DEFAULT_WORKBENCH_STATE });
      return selection;
    } finally {
      setIsSelectingProjectFolder(false);
    }
  };

  const handleOpenRecentWorkspace = async (workspaceRoot: string): Promise<void> => {
    await handleSaveWorkbenchState({
      ...(appState.workbench ?? DEFAULT_WORKBENCH_STATE),
      workspaceRoot,
    });
  };

  const handleRemoveRecentWorkspace = async (workspaceRoot: string): Promise<void> => {
    const currentWorkbench = appState.workbench ?? DEFAULT_WORKBENCH_STATE;
    if (currentWorkbench.workspaceRoot === workspaceRoot) {
      return;
    }

    await handleSaveWorkbenchState({
      ...currentWorkbench,
      recentWorkspaceRoots: (currentWorkbench.recentWorkspaceRoots ?? []).filter((entry) => entry !== workspaceRoot),
    });
  };

  const handleLocaleChange = async (nextLocale: Locale): Promise<void> => {
    const nextContinuityState = await window.desktopApi.saveContinuityState({ ...continuityState, locale: nextLocale });
    setContinuityState(nextContinuityState);
  };

  const handleSaveContinuityState = async (nextState: RendererContinuityState): Promise<void> => {
    const saved = await window.desktopApi.saveContinuityState(nextState);
    setContinuityState(saved);
  };

  const handleSaveSkill = async (skill: SkillDefinition): Promise<void> => {
    const input: SaveSkillInput = { skill };
    await window.desktopApi.saveSkill(input);
    const nextState = await window.desktopApi.getAppState();
    setAppState({ ...nextState, workbench: nextState.workbench ?? DEFAULT_WORKBENCH_STATE });
  };

  if (isBootstrapping) {
    return <main className="app-loading-state">{locale === 'zh' ? '正在加载渲染层状态...' : 'Loading renderer state...'}</main>;
  }

  return (
    <HashRouter>
      <RoutedAppContent
        locale={locale}
        theme={theme}
        aiConfig={aiConfig}
        appState={appState}
        routingSettings={routingSettings}
        continuityState={continuityState}
        promptBuilderConfig={promptBuilderConfig}
        isSelectingProjectFolder={isSelectingProjectFolder}
        onSelectProjectFolder={handleSelectProjectFolder}
        onOpenRecentWorkspace={handleOpenRecentWorkspace}
        onRemoveRecentWorkspace={handleRemoveRecentWorkspace}
        onSetLocale={(nextLocale) => {
          void handleLocaleChange(nextLocale);
        }}
        onSetTheme={setTheme}
        onSaveAiConfig={handleSaveAiConfig}
        onSaveRoutingSettings={handleSaveRoutingSettings}
        onSaveWorkbenchState={handleSaveWorkbenchState}
        onSaveContinuityState={handleSaveContinuityState}
        onSaveSkill={handleSaveSkill}
        onSavePromptBuilderConfig={(config) => {
          setPromptBuilderConfig(config);
        }}
      />
    </HashRouter>
  );
}
