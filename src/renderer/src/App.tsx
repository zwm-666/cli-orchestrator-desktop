import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AgentProfile,
  AppState,
  LaunchFormDraft,
  Locale,
  PlanDraft,
  RendererContinuityState,
  RoutingSettings,
  StartRunInput,
  TaskRoutingProfile,
  TaskType
} from '../../shared/domain.js';
import { DEFAULT_ROUTING_SETTINGS } from '../../shared/domain.js';
import {
  COPY,
  type Notice,
  type PrimaryPage,
  type NewTaskProfileDraft,
  MUTABLE_RUN_STATUSES
} from './copy.js';
import {
  countEvents,
  formatTime,
  formatTimeoutValue,
  getPlanDraftTasks,
  renderNotice
} from './helpers.js';
import { LaunchPage } from './LaunchPage.js';
import { OrchestrationPage } from './OrchestrationPage.js';
import { SessionsPage } from './SessionsPage.js';
import { SettingsPage } from './SettingsPage.js';
import { Sidebar } from './Sidebar.js';

type LaunchFormState = LaunchFormDraft;

const DEFAULT_LAUNCH_FORM: LaunchFormState = {
  title: '',
  prompt: '',
  adapterId: '',
  model: '',
  conversationId: '',
  timeoutMs: ''
};

const DEFAULT_LOAD_ERROR = COPY.en.loadError;

export function App(): React.JSX.Element {
  const [locale, setLocale] = useState<Locale>('en');
  const [state, setState] = useState<AppState | null>(null);
  const [routingSettings, setRoutingSettings] = useState<RoutingSettings>(DEFAULT_ROUTING_SETTINGS);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>({ type: 'loading' });
  const [planDraft, setPlanDraft] = useState<PlanDraft | null>(null);
  const [selectedPlannedTaskIndex, setSelectedPlannedTaskIndex] = useState(0);
  const [activePage, setActivePage] = useState<PrimaryPage>('launch');
  const [isSidebarCompact, setIsSidebarCompact] = useState(false);
  const [isPlanning, setIsPlanning] = useState(false);
  const [isLaunching, setIsLaunching] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isRefreshingTools, setIsRefreshingTools] = useState(false);
  const [launchForm, setLaunchForm] = useState<LaunchFormState>(DEFAULT_LAUNCH_FORM);
  const [isContinuityHydrated, setIsContinuityHydrated] = useState(false);
  const latestContinuityStateRef = useRef<RendererContinuityState | null>(null);

  const copy = COPY[locale];
  const desktopShellClassName = `desktop-shell ${isSidebarCompact ? 'is-sidebar-compact' : ''}`;

  useEffect(() => {
    let isActive = true;

    const unsubscribeState = window.desktopApi.onAppStateChanged((nextState) => {
      if (!isActive) {
        return;
      }

      setState(nextState);
    });

    const unsubscribeRunEvent = window.desktopApi.onRunEvent((event) => {
      if (!isActive) {
        return;
      }

      setNotice({
        type: 'runEvent',
        runId: event.runId,
        message: event.message
      });
    });

    void Promise.all([
      window.desktopApi.getAppState(),
      window.desktopApi.getContinuityState(),
      window.desktopApi.getRoutingSettings()
    ])
      .then(([nextState, continuity, nextRoutingSettings]) => {
        if (!isActive) {
          return;
        }

        setLocale(continuity.locale);
        setPlanDraft(continuity.planDraft);
        setSelectedPlannedTaskIndex(continuity.selectedPlannedTaskIndex);
        setSelectedRunId(continuity.selectedRunId);
        setLaunchForm(continuity.launchForm);
        setRoutingSettings(nextRoutingSettings);
        setState(nextState);
        setIsContinuityHydrated(true);
        setNotice({
          type: 'ready',
          adapters: nextState.adapters.length,
          runs: nextState.runs.length
        });
      })
      .catch((error) => {
        if (!isActive) {
          return;
        }

        setIsContinuityHydrated(true);
        setNotice({
          type: 'error',
          message: error instanceof Error ? error.message : DEFAULT_LOAD_ERROR
        });
      });

    return () => {
      isActive = false;
      unsubscribeState();
      unsubscribeRunEvent();
    };
  }, []);

  const userFacingAdapters = useMemo(() => {
    return state?.adapters.filter((adapter) => adapter.visibility === 'user') ?? [];
  }, [state]);

  const visibleAdapters = useMemo(() => {
    return userFacingAdapters.filter((adapter) => adapter.availability === 'available');
  }, [userFacingAdapters]);

  const enabledAdapters = useMemo(() => {
    return visibleAdapters.filter((adapter) => adapter.enabled);
  }, [visibleAdapters]);

  useEffect(() => {
    if (!state) {
      return;
    }

    const enabledAdapterIds = new Set(enabledAdapters.map((adapter) => adapter.id));
    const conversationIds = new Set(state.conversations.map((conversation) => conversation.id));
    const firstAdapterId = enabledAdapters[0]?.id ?? '';

    setSelectedRunId((current) => {
      if (current && state.runs.some((run) => run.id === current)) {
        return current;
      }

      return state.runs[0]?.id ?? null;
    });

    setLaunchForm((current) => {
      const nextAdapterId = enabledAdapterIds.has(current.adapterId) ? current.adapterId : firstAdapterId;
      const nextConversationId =
        current.conversationId && conversationIds.has(current.conversationId) ? current.conversationId : '';
      const nextModel = nextAdapterId ? (state.adapters.find((adapter) => adapter.id === nextAdapterId)?.defaultModel ?? '') : '';

      if (
        current.adapterId === nextAdapterId &&
        current.conversationId === nextConversationId &&
        (current.model || '') === (nextAdapterId === current.adapterId ? current.model : nextModel)
      ) {
        return current;
      }

      return {
        ...current,
        adapterId: nextAdapterId,
        model: current.adapterId === nextAdapterId ? current.model : nextModel,
        conversationId: nextConversationId
      };
    });
  }, [enabledAdapters, state]);

  useEffect(() => {
    if (!isContinuityHydrated) {
      latestContinuityStateRef.current = null;
      return;
    }

    const continuityState: RendererContinuityState = {
      planDraft,
      selectedPlannedTaskIndex,
      launchForm,
      selectedRunId,
      selectedConversationId: launchForm.conversationId || null,
      locale
    };
    latestContinuityStateRef.current = continuityState;
    const timeoutId = window.setTimeout(() => {
      void window.desktopApi.saveContinuityState(continuityState);
    }, 120);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isContinuityHydrated, launchForm, locale, planDraft, selectedPlannedTaskIndex, selectedRunId]);

  useEffect(() => {
    const flushContinuityState = (): void => {
      const continuityState = latestContinuityStateRef.current;

      if (!continuityState) {
        return;
      }

      void window.desktopApi.saveContinuityState(continuityState);
    };

    window.addEventListener('beforeunload', flushContinuityState);

    return () => {
      window.removeEventListener('beforeunload', flushContinuityState);
    };
  }, []);

  const taskByRunId = useMemo(() => {
    return new Map((state?.tasks ?? []).map((task) => [task.runId, task]));
  }, [state]);

  const adapterById = useMemo(() => {
    return new Map((state?.adapters ?? []).map((adapter) => [adapter.id, adapter]));
  }, [state]);

  const taskProfiles = useMemo(() => {
    return routingSettings.taskProfiles;
  }, [routingSettings.taskProfiles]);

  const updateAdapterSettingDraft = (adapterId: string, updates: Partial<RoutingSettings['adapterSettings'][string]>): void => {
    setRoutingSettings((current) => ({
      ...current,
      adapterSettings: {
        ...current.adapterSettings,
        [adapterId]: {
          enabled: current.adapterSettings[adapterId]?.enabled ?? true,
          defaultModel: current.adapterSettings[adapterId]?.defaultModel ?? '',
          customCommand: current.adapterSettings[adapterId]?.customCommand ?? '',
          ...updates
        }
      }
    }));
  };

  const updateTaskRoutingRuleDraft = (taskType: TaskType, updates: Partial<RoutingSettings['taskTypeRules'][TaskType]>): void => {
    setRoutingSettings((current) => ({
      ...current,
      taskTypeRules: {
        ...current.taskTypeRules,
        [taskType]: {
          ...current.taskTypeRules[taskType],
          ...updates
        }
      }
    }));
  };

  const updateTaskProfileDraft = (profileId: string, updates: Partial<TaskRoutingProfile>): void => {
    setRoutingSettings((current) => ({
      ...current,
      taskProfiles: current.taskProfiles.map((profile) => {
        if (profile.id !== profileId) {
          return profile;
        }

        return {
          ...profile,
          ...updates
        };
      })
    }));
  };

  const handleAddTaskProfile = (draft: NewTaskProfileDraft): void => {
    const label = draft.label.trim();

    if (!label) {
      setNotice({ type: 'error', message: copy.taskProfileNameRequired });
      return;
    }

    const profile: TaskRoutingProfile = {
      id: `profile-${crypto.randomUUID()}`,
      label,
      taskType: draft.taskType,
      adapterId: draft.adapterId || null,
      model: draft.model.trim(),
      enabled: true
    };

    setRoutingSettings((current) => ({
      ...current,
      taskProfiles: [...current.taskProfiles, profile]
    }));
  };

  const handleRemoveTaskProfile = (profileId: string): void => {
    setRoutingSettings((current) => ({
      ...current,
      taskProfiles: current.taskProfiles.filter((profile) => profile.id !== profileId)
    }));
  };

  const handleSaveAgentProfile = async (profile: AgentProfile): Promise<void> => {
    try {
      await window.desktopApi.saveAgentProfile({ profile });
    } catch (error) {
      setNotice({
        type: 'error',
        message: error instanceof Error ? error.message : copy.loadError
      });
    }
  };

  const handleDeleteAgentProfile = async (profileId: string): Promise<void> => {
    try {
      await window.desktopApi.deleteAgentProfile({ profileId });
    } catch (error) {
      setNotice({
        type: 'error',
        message: error instanceof Error ? error.message : copy.loadError
      });
    }
  };

  const handleRefreshAdapters = async (): Promise<void> => {
    setIsRefreshingTools(true);

    try {
      const refreshedState = await window.desktopApi.refreshAdapters();
      const refreshedRoutingSettings = await window.desktopApi.getRoutingSettings();
      setState(refreshedState);
      setRoutingSettings(refreshedRoutingSettings);
      setNotice({
        type: 'toolsRefreshed',
        adapters: refreshedState.adapters.filter((adapter) => adapter.visibility === 'user' && adapter.availability === 'available').length
      });
    } catch (error) {
      setNotice({
        type: 'error',
        message: error instanceof Error ? error.message : copy.loadError
      });
    } finally {
      setIsRefreshingTools(false);
    }
  };

  const handleSaveRoutingSettings = async (): Promise<void> => {
    setIsSavingSettings(true);

    try {
      const savedSettings = await window.desktopApi.saveRoutingSettings({ settings: routingSettings });
      setRoutingSettings(savedSettings);
      setNotice({ type: 'settingsSaved' });
    } catch (error) {
      setNotice({
        type: 'error',
        message: error instanceof Error ? `${copy.settingsSaveFailed} ${error.message}` : copy.settingsSaveFailed
      });
    } finally {
      setIsSavingSettings(false);
    }
  };

  const conversationById = useMemo(() => {
    return new Map((state?.conversations ?? []).map((conversation) => [conversation.id, conversation]));
  }, [state]);

  const selectedRun = useMemo(() => {
    if (!state || !selectedRunId) {
      return null;
    }

    return state.runs.find((run) => run.id === selectedRunId) ?? null;
  }, [selectedRunId, state]);

  const plannedTasks = useMemo(() => {
    if (!planDraft) {
      return [];
    }

    return getPlanDraftTasks(planDraft);
  }, [planDraft]);

  const selectedPlannedTask = plannedTasks[selectedPlannedTaskIndex] ?? plannedTasks[0] ?? null;

  const selectedTask = selectedRun ? taskByRunId.get(selectedRun.id) ?? null : null;
  const selectedConversation = selectedRun ? conversationById.get(selectedRun.activeConversationId) ?? null : null;
  const selectedAdapter = selectedRun ? adapterById.get(selectedRun.adapterId) ?? null : null;
  const selectedRunIsMutable = selectedRun ? MUTABLE_RUN_STATUSES.includes(selectedRun.status) : false;
  const selectedRunCancelPending = Boolean(selectedRun?.cancelRequestedAt);
  const launchAdapter = adapterById.get(launchForm.adapterId) ?? null;
  const launchConversation = conversationById.get(launchForm.conversationId) ?? null;
  const plannedAdapter = selectedPlannedTask?.recommendedAdapterId
    ? adapterById.get(selectedPlannedTask.recommendedAdapterId) ?? null
    : null;
  const launchDefaultTimeoutLabel = formatTimeoutValue(locale, launchAdapter?.defaultTimeoutMs ?? null, copy.noTimeout);
  const selectedRunTimeoutLabel = selectedRun
    ? formatTimeoutValue(locale, selectedRun.timeoutMs, copy.noTimeout)
    : copy.emptyValue;
  const selectedRunCancelLabel = selectedRun?.cancelRequestedAt
    ? formatTime(locale, selectedRun.cancelRequestedAt)
    : copy.cancellationIdle;
  const launchEnvironmentBlockedAdapter = launchAdapter?.readiness === 'blocked_by_environment' ? launchAdapter : null;

  const updateLaunchField = <Field extends keyof LaunchFormState>(
    field: Field,
    value: LaunchFormState[Field]
  ): void => {
    if (field === 'prompt') {
      setPlanDraft(null);
      setSelectedPlannedTaskIndex(0);
    }

    setLaunchForm((current) => ({
      ...current,
      [field]: value,
      ...(field === 'adapterId'
        ? {
            model: adapterById.get(value as string)?.defaultModel ?? ''
          }
        : {})
    }));
  };

  useEffect(() => {
    if (plannedTasks.length === 0) {
      if (selectedPlannedTaskIndex !== 0) {
        setSelectedPlannedTaskIndex(0);
      }

      return;
    }

    if (selectedPlannedTaskIndex >= plannedTasks.length) {
      setSelectedPlannedTaskIndex(0);
    }
  }, [plannedTasks, selectedPlannedTaskIndex]);

  const handlePlanDraft = async (): Promise<void> => {
    const rawInput = launchForm.prompt.trim();

    if (!rawInput) {
      setNotice({ type: 'error', message: copy.planInputRequired });
      return;
    }

    setIsPlanning(true);

    try {
      const result = await window.desktopApi.createPlanDraft({ rawInput });
      const nextPlannedTasks = getPlanDraftTasks(result.draft);
      const primaryTask = nextPlannedTasks[0] ?? null;
      const recommendedAdapterName = primaryTask?.recommendedAdapterId
        ? adapterById.get(primaryTask.recommendedAdapterId)?.displayName ?? primaryTask.recommendedAdapterId
        : copy.plannerNoAdapter;

      setPlanDraft(result.draft);
      setSelectedPlannedTaskIndex(0);
      setNotice({ type: 'planReady', adapterName: recommendedAdapterName });
    } catch (error) {
      setNotice({
        type: 'error',
        message: error instanceof Error ? error.message : copy.loadError
      });
    } finally {
      setIsPlanning(false);
    }
  };

  const handleApplyPlan = (): void => {
    if (!selectedPlannedTask) {
      return;
    }

    const nextPrompt = selectedPlannedTask.cleanedPrompt || selectedPlannedTask.rawInput.trim();
    const nextAdapterId = selectedPlannedTask.recommendedAdapterId ?? launchForm.adapterId;
    const adapterName = nextAdapterId
      ? adapterById.get(nextAdapterId)?.displayName ?? nextAdapterId
      : copy.plannerNoAdapter;

    setLaunchForm((current) => ({
      ...current,
      title: selectedPlannedTask.taskTitle,
      prompt: nextPrompt,
      adapterId: nextAdapterId,
      model: selectedPlannedTask.recommendedModel ?? adapterById.get(nextAdapterId)?.defaultModel ?? ''
    }));
    setNotice({
      type: 'planApplied',
      title: selectedPlannedTask.taskTitle,
      adapterName
    });
  };

  const handleLaunchRun = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();

    const title = launchForm.title.trim();
    const prompt = launchForm.prompt.trim();

    if (!title) {
      setNotice({ type: 'error', message: copy.titleRequired });
      return;
    }

    if (!prompt) {
      setNotice({ type: 'error', message: copy.promptRequired });
      return;
    }

    const rawTimeoutMs = launchForm.timeoutMs.trim();
    let timeoutMs: number | null = null;

    if (rawTimeoutMs) {
      if (!/^\d+$/.test(rawTimeoutMs)) {
        setNotice({ type: 'error', message: copy.timeoutInvalid });
        return;
      }

      timeoutMs = Number(rawTimeoutMs);

      if (!Number.isSafeInteger(timeoutMs)) {
        setNotice({ type: 'error', message: copy.timeoutInvalid });
        return;
      }

      if (timeoutMs <= 0) {
        setNotice({ type: 'error', message: copy.timeoutPositive });
        return;
      }
    }

    setIsLaunching(true);

    try {
      const input: StartRunInput = {
        title,
        prompt,
        adapterId: launchForm.adapterId,
        model: launchForm.model.trim() || null,
        ...(launchForm.conversationId ? { conversationId: launchForm.conversationId } : {}),
        timeoutMs
      };
      const result = await window.desktopApi.startRun(input);
      const adapterName = adapterById.get(result.run.adapterId)?.displayName ?? result.run.adapterId;

      setSelectedRunId(result.run.id);
      setLaunchForm((current) => ({
        ...current,
        title: '',
        prompt: ''
      }));
      setPlanDraft(null);
      setNotice({
        type: 'runStarted',
        title: result.task.title,
        adapterName
      });
      setActivePage('sessions');
    } catch (error) {
      setNotice({
        type: 'error',
        message: error instanceof Error ? error.message : copy.loadError
      });
    } finally {
      setIsLaunching(false);
    }
  };

  const handleCancelRun = async (): Promise<void> => {
    if (!selectedRun || !selectedRunIsMutable || selectedRunCancelPending) {
      return;
    }

    setIsCancelling(true);

    try {
      const result = await window.desktopApi.cancelRun({ runId: selectedRun.id });

      setNotice({
        type: 'cancelRequested',
        title: result.task.title
      });
    } catch (error) {
      setNotice({
        type: 'cancelFailed',
        title: selectedTask?.title ?? selectedRun.id,
        message: error instanceof Error ? error.message : copy.loadError
      });
    } finally {
      setIsCancelling(false);
    }
  };

  const totalEvents = state ? countEvents(state.runs) : 0;
  const pageMeta =
    activePage === 'launch'
      ? {
          eyebrow: copy.launchEyebrow,
          title: copy.launchTitle,
          description: copy.launchCopy
        }
      : activePage === 'sessions'
        ? {
            eyebrow: copy.sessionsEyebrow,
            title: copy.sessionsTitle,
            description: copy.sessionsCopy
          }
        : activePage === 'orchestration'
          ? {
              eyebrow: locale === 'zh' ? '多代理' : 'Multi-Agent',
              title: locale === 'zh' ? '编排运行' : 'Orchestration Runs',
              description: locale === 'zh' ? '将复杂请求分解为多个协作代理节点。' : 'Decompose complex requests into multiple collaborating agent nodes.'
            }
          : {
              eyebrow: copy.adaptersEyebrow,
              title: copy.routingTitle,
              description: copy.routingCopy
            };

  if (!state) {
    return (
      <main className={desktopShellClassName}>
        <Sidebar
          locale={locale}
          state={state}
          activePage={activePage}
          isSidebarCompact={isSidebarCompact}
          enabledAdapters={enabledAdapters}
          visibleAdapters={visibleAdapters}
          totalEvents={totalEvents}
          onSetLocale={setLocale}
          onSetActivePage={setActivePage}
          onToggleSidebar={() => setIsSidebarCompact((current) => !current)}
        />

        <section className="content-shell">
          <div className="content-frame card loading-frame">
            <header className="page-header">
              <div>
                <p className="eyebrow">{copy.statusLabel}</p>
                <h2>{copy.heroTitle}</h2>
                <p className="panel-copy">{copy.heroCopy}</p>
              </div>
            </header>

            <section className="status-banner inline-status">
              <span className="eyebrow">{copy.statusLabel}</span>
              <p>{renderNotice(locale, notice)}</p>
            </section>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className={desktopShellClassName}>
      <Sidebar
        locale={locale}
        state={state}
        activePage={activePage}
        isSidebarCompact={isSidebarCompact}
        enabledAdapters={enabledAdapters}
        visibleAdapters={visibleAdapters}
        totalEvents={totalEvents}
        onSetLocale={setLocale}
        onSetActivePage={setActivePage}
        onToggleSidebar={() => setIsSidebarCompact((current) => !current)}
      />

      <section className="content-shell">
        <div className="content-frame card">
          <header className="page-header">
            <div>
              <p className="eyebrow">{pageMeta.eyebrow}</p>
              <h2>{pageMeta.title}</h2>
              <p className="panel-copy">{pageMeta.description}</p>
            </div>
            <div className="page-header-actions">
              {activePage === 'settings' ? (
                <>
                  <button type="button" className="secondary-button" onClick={handleRefreshAdapters} disabled={isRefreshingTools}>
                    {isRefreshingTools ? copy.refreshingTools : copy.refreshTools}
                  </button>
                  <button type="button" className="secondary-button" onClick={handleSaveRoutingSettings} disabled={isSavingSettings}>
                    {isSavingSettings ? copy.savingSettings : copy.saveSettings}
                  </button>
                </>
              ) : activePage === 'launch' ? (
                <span className="status-pill">
                  {enabledAdapters.length}/{visibleAdapters.length} {copy.enabled}
                </span>
              ) : activePage === 'orchestration' ? (
                <span className="status-pill">
                  {state.orchestrationRuns?.length ?? 0} {locale === 'zh' ? '编排' : 'runs'}
                </span>
              ) : (
                <span className="status-pill">
                  {state.runs.length} {copy.statsRuns}
                </span>
              )}
            </div>
          </header>

          <section className={`status-banner inline-status status-${notice.type}`}>
            <span className="eyebrow">{copy.statusLabel}</span>
            <p>{renderNotice(locale, notice)}</p>
          </section>

          {activePage === 'launch' ? (
            <LaunchPage
              locale={locale}
              state={state}
              launchForm={launchForm}
              enabledAdapters={enabledAdapters}
              adapterById={adapterById}
              conversationById={conversationById}
              planDraft={planDraft}
              plannedTasks={plannedTasks}
              selectedPlannedTaskIndex={selectedPlannedTaskIndex}
              selectedPlannedTask={selectedPlannedTask}
              plannedAdapter={plannedAdapter}
              launchAdapter={launchAdapter}
              launchConversation={launchConversation}
              launchDefaultTimeoutLabel={launchDefaultTimeoutLabel}
              launchEnvironmentBlockedAdapter={launchEnvironmentBlockedAdapter}
              isPlanning={isPlanning}
              isLaunching={isLaunching}
              onUpdateLaunchField={updateLaunchField}
              onPlanDraft={handlePlanDraft}
              onApplyPlan={handleApplyPlan}
              onLaunchRun={handleLaunchRun}
              onSelectPlannedTask={setSelectedPlannedTaskIndex}
            />
          ) : null}

          {activePage === 'sessions' ? (
            <SessionsPage
              locale={locale}
              state={state}
              selectedRunId={selectedRunId}
              selectedRun={selectedRun}
              selectedTask={selectedTask}
              selectedConversation={selectedConversation}
              selectedAdapter={selectedAdapter}
              selectedRunIsMutable={selectedRunIsMutable}
              selectedRunCancelPending={selectedRunCancelPending}
              selectedRunTimeoutLabel={selectedRunTimeoutLabel}
              selectedRunCancelLabel={selectedRunCancelLabel}
              taskByRunId={taskByRunId}
              adapterById={adapterById}
              isCancelling={isCancelling}
              onSelectRun={setSelectedRunId}
              onCancelRun={handleCancelRun}
            />
          ) : null}

          {activePage === 'settings' ? (
            <SettingsPage
              locale={locale}
              state={state}
              routingSettings={routingSettings}
              userFacingAdapters={userFacingAdapters}
              visibleAdapters={visibleAdapters}
              adapterById={adapterById}
              taskProfiles={taskProfiles}
              onUpdateAdapterSetting={updateAdapterSettingDraft}
              onUpdateTaskRoutingRule={updateTaskRoutingRuleDraft}
              onUpdateTaskProfile={updateTaskProfileDraft}
              onAddTaskProfile={handleAddTaskProfile}
              onRemoveTaskProfile={handleRemoveTaskProfile}
              onSaveAgentProfile={handleSaveAgentProfile}
              onDeleteAgentProfile={handleDeleteAgentProfile}
            />
          ) : null}

          {activePage === 'orchestration' ? (
            <OrchestrationPage
              state={state}
              locale={locale}
              enabledAdapters={enabledAdapters}
              onStartOrchestration={async (input) => {
                try {
                  await window.desktopApi.startOrchestration(input);
                  setNotice({ type: 'ready', adapters: enabledAdapters.length, runs: state.runs.length });
                } catch (error) {
                  setNotice({ type: 'error', message: error instanceof Error ? error.message : String(error) });
                }
              }}
              onCancelOrchestration={async (orchRunId) => {
                try {
                  await window.desktopApi.cancelOrchestration({ orchestrationRunId: orchRunId });
                } catch (error) {
                  setNotice({ type: 'error', message: error instanceof Error ? error.message : String(error) });
                }
              }}
            />
          ) : null}
        </div>
      </section>
    </main>
  );
}
