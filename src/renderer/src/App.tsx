import { useEffect, useState } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { AppState, Locale, RendererContinuityState, RoutingSettings, SaveSkillInput, SkillDefinition, WorkbenchState } from '../../shared/domain.js';
import { DEFAULT_WORKBENCH_STATE } from '../../shared/domain.js';
import { DEFAULT_PROMPT_BUILDER_CONFIG, type PromptBuilderConfig } from '../../shared/promptBuilder.js';
import { loadAiConfig, loadAiConfigFromPersistence, saveAiConfig, type AiConfig } from './aiConfig.js';
import { TopNav } from './components/TopNav.js';
import { ConfigPage } from './pages/ConfigPage.js';
import { ProjectSelectPage } from './pages/ProjectSelectPage.js';
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
  projectContext: { summary: '', updatedAt: null },
  nextClaudeTask: { prompt: '', sourceOrchestrationRunId: null, generatedAt: null, status: 'idle' },
  agentProfiles: [],
  skills: [],
  mcpServers: [],
  orchestrationRuns: [],
  orchestrationNodes: [],
  workbench: DEFAULT_WORKBENCH_STATE,
};

const DEFAULT_ROUTING_SETTINGS: RoutingSettings = {
  adapterSettings: {},
  taskTypeRules: {
    general: { adapterId: null, model: '' },
    planning: { adapterId: null, model: '' },
    code: { adapterId: null, model: '' },
    frontend: { adapterId: null, model: '' },
    research: { adapterId: null, model: '' },
    git: { adapterId: null, model: '' },
    ops: { adapterId: null, model: '' },
  },
  taskProfiles: [],
};

interface RoutePersistenceProps {
  continuityState: RendererContinuityState;
  onSaveContinuityState: (state: RendererContinuityState) => Promise<void>;
}

function RoutePersistence({ continuityState, onSaveContinuityState }: RoutePersistenceProps): null {
  const location = useLocation();

  useEffect(() => {
    if (location.pathname !== '/work' && location.pathname !== '/config') {
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

export function App(): React.JSX.Element {
  const [aiConfig, setAiConfig] = useState<AiConfig>(() => loadAiConfig());
  const [appState, setAppState] = useState(DEFAULT_APP_STATE);
  const [routingSettings, setRoutingSettings] = useState(DEFAULT_ROUTING_SETTINGS);
  const [continuityState, setContinuityState] = useState(DEFAULT_CONTINUITY);
  const [promptBuilderConfig, setPromptBuilderConfig] = useState<PromptBuilderConfig>(DEFAULT_PROMPT_BUILDER_CONFIG);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const locale: Locale = continuityState.locale;

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

  const handleSelectWorkspaceFolder = async (): Promise<void> => {
    await window.desktopApi.selectWorkspaceFolder();
    const nextAppState = await window.desktopApi.getAppState();
    setAppState({ ...nextAppState, workbench: nextAppState.workbench ?? DEFAULT_WORKBENCH_STATE });
  };

  const handleOpenRecentWorkspace = async (workspaceRoot: string): Promise<void> => {
    await handleSaveWorkbenchState({
      ...(appState.workbench ?? DEFAULT_WORKBENCH_STATE),
      workspaceRoot,
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

  if (!appState.workbench?.workspaceRoot) {
    return (
      <ProjectSelectPage
        locale={locale}
        recentWorkspaceRoots={appState.workbench?.recentWorkspaceRoots ?? []}
        onOpenFolder={() => {
          void handleSelectWorkspaceFolder();
        }}
        onOpenRecentWorkspace={(workspaceRoot) => {
          void handleOpenRecentWorkspace(workspaceRoot);
        }}
      />
    );
  }

  return (
    <HashRouter>
      <div className="routed-shell">
        <TopNav
          locale={locale}
          workspaceLabel={appState.workbench.workspaceRoot.split(/[/\\]/).filter(Boolean).at(-1) ?? null}
          onSetLocale={(nextLocale) => {
            void handleLocaleChange(nextLocale);
          }}
          onSwitchProject={() => {
            void handleSelectWorkspaceFolder();
          }}
        />

        <main className="routed-shell-main">
          <RoutePersistence continuityState={continuityState} onSaveContinuityState={handleSaveContinuityState} />
          <Routes>
            <Route path="/" element={<Navigate to="/work" replace />} />
            <Route
              path="/work"
              element={
                <WorkPage
                  locale={locale}
                  aiConfig={aiConfig}
                  appState={appState}
                  promptBuilderConfig={promptBuilderConfig}
                  onSaveWorkbenchState={(nextState) => {
                    void handleSaveWorkbenchState(nextState);
                  }}
                />
              }
            />
            <Route
              path="/config"
              element={
                  <ConfigPage
                    locale={locale}
                    aiConfig={aiConfig}
                    appState={appState}
                    routingSettings={routingSettings}
                  onSaveAiConfig={handleSaveAiConfig}
                  onSaveRoutingSettings={(nextSettings) => {
                    void handleSaveRoutingSettings(nextSettings);
                  }}
                  onSaveWorkbenchState={(nextState) => {
                    void handleSaveWorkbenchState(nextState);
                  }}
                    onSaveSkill={(skill) => {
                      void handleSaveSkill(skill);
                    }}
                    onSavePromptBuilderConfig={(config) => {
                      setPromptBuilderConfig(config);
                    }}
                  />
                }
              />
          </Routes>
        </main>
      </div>
    </HashRouter>
  );
}
