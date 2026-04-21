import { useEffect, useState } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import type { AppState, Locale, RendererContinuityState, RoutingSettings, SaveSkillInput, SkillDefinition, WorkbenchState } from '../../shared/domain.js';
import { DEFAULT_WORKBENCH_STATE } from '../../shared/domain.js';
import { loadAiConfig, saveAiConfig, type AiConfig } from './aiConfig.js';
import { COPY } from './copy.js';
import { TopNav } from './components/TopNav.js';
import { ConfigPage } from './pages/ConfigPage.js';
import { WorkPage } from './pages/WorkPage.js';

const DEFAULT_CONTINUITY: RendererContinuityState = {
  locale: 'en',
  selectedRunId: null,
  selectedConversationId: null,
  selectedPlannedTaskIndex: 0,
  launchForm: { title: '', prompt: '', adapterId: '', model: '', conversationId: '', timeoutMs: '' },
  planDraft: null,
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

export function App(): React.JSX.Element {
  const [aiConfig, setAiConfig] = useState<AiConfig>(() => loadAiConfig());
  const [appState, setAppState] = useState<AppState>(DEFAULT_APP_STATE);
  const [routingSettings, setRoutingSettings] = useState<RoutingSettings>(DEFAULT_ROUTING_SETTINGS);
  const [continuityState, setContinuityState] = useState<RendererContinuityState>(DEFAULT_CONTINUITY);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const locale: Locale = continuityState.locale;
  const copy = COPY[locale];

  useEffect(() => {
    let isActive = true;

    const loadState = async (): Promise<void> => {
      try {
        const [nextAppState, nextRoutingSettings, nextContinuityState] = await Promise.all([
          window.desktopApi.getAppState(),
          window.desktopApi.getRoutingSettings(),
          window.desktopApi.getContinuityState(),
        ]);

        if (!isActive) {
          return;
        }

        setAppState({ ...nextAppState, workbench: nextAppState.workbench ?? DEFAULT_WORKBENCH_STATE });
        setRoutingSettings(nextRoutingSettings);
        setContinuityState(nextContinuityState);
      } finally {
        if (isActive) {
          setIsBootstrapping(false);
        }
      }
    };

    void loadState();

    const unsubscribeState = window.desktopApi.onAppStateChanged((nextState) => {
      setAppState({ ...nextState, workbench: nextState.workbench ?? DEFAULT_WORKBENCH_STATE });
    });

    return () => {
      isActive = false;
      unsubscribeState();
    };
  }, []);

  const handleSaveAiConfig = (nextConfig: AiConfig): void => {
    setAiConfig(nextConfig);
    saveAiConfig(nextConfig);
  };

  const handleSaveRoutingSettings = async (nextSettings: RoutingSettings): Promise<void> => {
    const saved = await window.desktopApi.saveRoutingSettings({ settings: nextSettings });
    setRoutingSettings(saved);
  };

  const handleSaveWorkbenchState = async (nextWorkbenchState: WorkbenchState): Promise<void> => {
    const nextAppState = await window.desktopApi.saveWorkbenchState({ state: nextWorkbenchState });
    setAppState({ ...nextAppState, workbench: nextAppState.workbench ?? DEFAULT_WORKBENCH_STATE });
  };

  const handleLocaleChange = async (nextLocale: Locale): Promise<void> => {
    const nextContinuityState = await window.desktopApi.saveContinuityState({
      ...continuityState,
      locale: nextLocale,
    });
    setContinuityState(nextContinuityState);
  };

  const handleSaveSkill = async (skill: SkillDefinition): Promise<void> => {
    const input: SaveSkillInput = { skill };
    await window.desktopApi.saveSkill(input);
    const nextState = await window.desktopApi.getAppState();
    setAppState({ ...nextState, workbench: nextState.workbench ?? DEFAULT_WORKBENCH_STATE });
  };

  if (isBootstrapping) {
    return <main className="app-loading-state">{copy.loadError}</main>;
  }

  return (
    <HashRouter>
      <div className="routed-shell">
        <TopNav
          locale={locale}
          onSetLocale={(nextLocale) => {
            void handleLocaleChange(nextLocale);
          }}
        />

        <main className="routed-shell-main">
          <Routes>
            <Route path="/" element={<Navigate to="/work" replace />} />
            <Route
              path="/work"
              element={
                <WorkPage
                  locale={locale}
                  aiConfig={aiConfig}
                  appState={appState}
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
                />
              }
            />
          </Routes>
        </main>
      </div>
    </HashRouter>
  );
}
