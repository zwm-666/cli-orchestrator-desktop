import { useEffect, useRef, useState } from 'react';
import type { AppState, Locale, WorkbenchActivitySummary, WorkbenchState } from '../../../shared/domain.js';
import type { PromptBuilderConfig } from '../../../shared/promptBuilder.js';
import type { AiConfig } from '../aiConfig.js';
import { AgentStatusPanel } from '../components/AgentStatusPanel.js';
import { ChatPanel } from '../components/ChatPanel.js';
import { FileEditor } from '../components/FileEditor.js';
import { FileExplorer } from '../components/FileExplorer.js';
import { LocalRunProgressPanel } from '../components/LocalRunProgressPanel.js';
import { OrchestrationPanel } from '../components/OrchestrationPanel.js';
import { OrchestrationProgressPanel } from '../components/OrchestrationProgressPanel.js';
import { WorkbenchActivityPanel } from '../components/WorkbenchActivityPanel.js';
import { WorkbenchControlPanel } from '../components/WorkbenchControlPanel.js';
import { WorkbenchSettingsDialog } from '../components/WorkbenchSettingsDialog.js';
import { WorkbenchTaskPanel } from '../components/WorkbenchTaskPanel.js';
import { useWorkbenchController } from '../hooks/useWorkbenchController.js';
import { resolveWorkspaceRelativePath } from '../hooks/workbenchControllerShared.js';

interface WorkPageProps {
  locale: Locale;
  aiConfig: AiConfig;
  appState: AppState;
  promptBuilderConfig: PromptBuilderConfig;
  onSaveWorkbenchState: (state: WorkbenchState) => void | Promise<void>;
}

type ResizeSide = 'left' | 'right' | null;

export function WorkPage({ locale, aiConfig, appState, promptBuilderConfig, onSaveWorkbenchState }: WorkPageProps): React.JSX.Element {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [leftSidebarWidth, setLeftSidebarWidth] = useState(320);
  const [rightSidebarWidth, setRightSidebarWidth] = useState(390);
  const [collapsedSide, setCollapsedSide] = useState<{ left: boolean; right: boolean }>({ left: false, right: false });
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const resizingSideRef = useRef<ResizeSide>(null);

  const controller = useWorkbenchController({
    locale,
    aiConfig,
    appState,
    promptBuilderConfig,
    onSaveWorkbenchState,
  });

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent): void => {
      if (resizingSideRef.current === 'left') {
        setLeftSidebarWidth(Math.min(480, Math.max(240, event.clientX)));
      }

      if (resizingSideRef.current === 'right') {
        setRightSidebarWidth(Math.min(540, Math.max(300, window.innerWidth - event.clientX)));
      }
    };

    const handleMouseUp = (): void => {
      resizingSideRef.current = null;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      const isMacLike = /Mac|iPhone|iPad|iPod/u.test(navigator.userAgent);
      const isPrimaryModifier = isMacLike ? event.metaKey : event.ctrlKey;
      if (!isPrimaryModifier) {
        return;
      }

      if (event.key.toLowerCase() === 'l' && event.shiftKey) {
        event.preventDefault();
        controller.handleNewThread();
        return;
      }

      if (event.key.toLowerCase() === 'l') {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [controller]);

  const handleJumpToNode = (nodeId: string): void => {
    const messageElement = document.querySelector(`[data-orchestration-node-id="${nodeId}"]`);
    if (messageElement instanceof HTMLElement) {
      messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const threadActivityLog = controller.activeThread?.activityLog ?? [];
  const latestProviderActivity = [...threadActivityLog]
    .reverse()
    .find((activity): activity is WorkbenchActivitySummary => activity.sourceKind === 'provider') ?? null;
  const latestAdapterActivity = [...threadActivityLog]
    .reverse()
    .find((activity): activity is WorkbenchActivitySummary => activity.sourceKind === 'adapter') ?? null;

  return (
    <section className="page-stack work-page cursor-work-page">
      <div className="cursor-workspace-layout">
        {!collapsedSide.left ? (
          <aside className="cursor-sidebar cursor-sidebar-left" style={{ width: leftSidebarWidth }}>
            <div className="cursor-sidebar-topline">
              <button type="button" className="secondary-button secondary-button-compact" onClick={() => { setCollapsedSide((current) => ({ ...current, left: true })); }}>
                {locale === 'zh' ? '折叠左栏' : 'Hide left rail'}
              </button>
            </div>

            <FileExplorer
              locale={locale}
              browseResult={controller.browseResult}
              isLoading={controller.isBrowsing}
              errorMessage={controller.browseError}
              selectedFilePath={controller.selectedFile?.relativePath ?? null}
              onRefresh={() => { void controller.loadDirectory(controller.browseResult?.currentPath ?? null); }}
              onCollapseAll={() => { void controller.loadDirectory(null); }}
              onLoadDirectoryEntries={controller.loadDirectoryEntries}
              onOpenDirectory={(relativePath) => { void controller.loadDirectory(relativePath); }}
              onOpenFile={(entry) => { void controller.loadFilePreview(entry); }}
            />
          </aside>
        ) : (
          <button type="button" className="cursor-collapsed-rail" onClick={() => { setCollapsedSide((current) => ({ ...current, left: false })); }}>
            {locale === 'zh' ? '展开文件栏' : 'Show files'}
          </button>
        )}

        <div className="cursor-resizer" onMouseDown={() => { resizingSideRef.current = 'left'; }} />

        <main className="cursor-main-column">
          <div className="cursor-main-toolbar section-panel inlay-card">
            <div>
              <p className="section-label">{locale === 'zh' ? '当前项目' : 'Active project'}</p>
              <h3>{controller.workspaceLabel ?? (locale === 'zh' ? '未选择项目' : 'No project selected')}</h3>
              {controller.workspaceStatusMessage ? <p className="mini-meta">{controller.workspaceStatusMessage}</p> : null}
            </div>

            <div className="card-actions">
              <button type="button" className="secondary-button secondary-button-compact" onClick={() => { setIsSettingsOpen(true); }}>
                {locale === 'zh' ? '工作台设置' : 'Workbench settings'}
              </button>
            </div>
          </div>

          <FileEditor
            locale={locale}
            file={controller.selectedFile}
            isLoading={controller.isPreviewLoading}
            isSaving={controller.isSavingFile}
            errorMessage={controller.previewError}
            onSave={(content) => { void controller.saveSelectedFile(content); }}
          />
        </main>

        <div className="cursor-resizer" onMouseDown={() => { resizingSideRef.current = 'right'; }} />

        {!collapsedSide.right ? (
          <aside className="cursor-sidebar cursor-sidebar-right" style={{ width: rightSidebarWidth }}>
            <div className="cursor-sidebar-topline cursor-sidebar-topline-minimal">
              <button type="button" className="secondary-button secondary-button-compact" onClick={() => { setCollapsedSide((current) => ({ ...current, right: true })); }}>
                {locale === 'zh' ? '折叠右栏' : 'Hide right rail'}
              </button>
            </div>

            <ChatPanel
              locale={locale}
              messages={controller.chatMessages}
              inputValue={controller.userInput}
              isSending={controller.isSending}
              canSend={controller.canSend}
              errorMessage={controller.chatError ?? controller.orchestrationError}
              selectedFilePath={controller.selectedFile?.relativePath ?? null}
              activeThreadId={controller.activeThread?.id ?? null}
              threadOptions={controller.threadOptions}
              selectedTargetOptionId={controller.selectedTargetOptionId}
              targetOptions={controller.targetOptions}
              selectedAgentProfileId={controller.selectedAgentProfileId}
              agentProfileOptions={controller.agentProfileOptions}
              targetModel={controller.targetModel}
              targetModelOptions={controller.targetModelOptions}
              activeOrchestrationRun={controller.activeOrchestrationRun}
              isApplyingFile={controller.isApplyingFile}
              inputRef={inputRef}
              onInputChange={controller.setUserInput}
              onTargetOptionChange={controller.handleTargetOptionChange}
              onAgentProfileChange={controller.handleAgentProfileChange}
              onTargetModelChange={controller.setTargetModel}
              onThreadChange={controller.handleThreadChange}
              onSubmit={() => { void controller.handleSendEntry(); }}
              onNewThread={controller.handleNewThread}
              onStartDiscussion={() => { controller.handleOpenOrchestrationPanel('discussion'); }}
              onStartOrchestration={() => { controller.handleOpenOrchestrationPanel('standard'); }}
              onRetryMessage={(message) => {
                controller.setUserInput(message.content);
              }}
              onDropFile={(absolutePath) => {
                const relativePath = resolveWorkspaceRelativePath(controller.workspaceRoot, absolutePath);
                if (!relativePath) {
                  return;
                }

                controller.setUserInput(`${controller.userInput}\n\n[File context] ${relativePath}`.trim());
                void controller.loadFilePreviewByPath(relativePath);
              }}
              onApplyCodeToFile={(content) => { void controller.applyToSelectedFile(content); }}
            />

            <details className="cursor-side-panels-drawer">
              <summary>{locale === 'zh' ? '任务与运行状态' : 'Tasks and run status'}</summary>
              <div className="cursor-side-panels-content">
                <WorkbenchTaskPanel
                  locale={locale}
                  objective={controller.workbench.objective}
                  tasks={controller.workbench.tasks}
                  isGeneratingTasks={controller.isGeneratingTasks}
                  taskStatusMessage={controller.taskStatusMessage}
                  newTaskTitle={controller.newTaskTitle}
                  newTaskDetail={controller.newTaskDetail}
                  onGenerateChecklist={() => { void controller.handleGenerateChecklist(); }}
                  onToggleTask={controller.handleToggleTask}
                  onNewTaskTitleChange={controller.setNewTaskTitle}
                  onNewTaskDetailChange={controller.setNewTaskDetail}
                  onAddTask={controller.handleAddTask}
                />

                <OrchestrationProgressPanel
                  locale={locale}
                  run={controller.activeOrchestrationRun}
                  nodes={controller.activeOrchestrationNodes}
                  runs={appState.runs}
                  agentProfiles={appState.agentProfiles}
                  onSelectRun={(runId) => { void controller.handleSetActiveOrchestrationRunId(runId); }}
                  onJumpToNode={handleJumpToNode}
                />

                <LocalRunProgressPanel locale={locale} runs={controller.activeThreadRuns} />

                <WorkbenchActivityPanel
                  locale={locale}
                  latestProviderActivity={latestProviderActivity}
                  latestAdapterActivity={latestAdapterActivity}
                  activityLog={threadActivityLog}
                />

                <AgentStatusPanel locale={locale} agentProfiles={appState.agentProfiles} adapters={appState.adapters} aiConfig={aiConfig} />
              </div>
            </details>
          </aside>
        ) : (
          <button type="button" className="cursor-collapsed-rail" onClick={() => { setCollapsedSide((current) => ({ ...current, right: false })); }}>
            {locale === 'zh' ? '展开右栏' : 'Show side panels'}
          </button>
        )}
      </div>

      <OrchestrationPanel
        locale={locale}
        isOpen={controller.isOrchestrationPanelOpen}
        mode={controller.orchestrationMode}
        executionStyle={controller.orchestrationExecutionStyle}
        prompt={controller.orchestrationPrompt}
        participantOptions={controller.agentProfileOptions}
        selectedParticipantIds={controller.selectedOrchestrationParticipantIds}
        errorMessage={controller.orchestrationError}
        isStarting={controller.isStartingOrchestration}
        onClose={controller.handleCloseOrchestrationPanel}
        onModeChange={controller.setOrchestrationMode}
        onExecutionStyleChange={controller.setOrchestrationExecutionStyle}
        onPromptChange={controller.setOrchestrationPrompt}
        onParticipantIdsChange={controller.setSelectedOrchestrationParticipantIds}
        onStart={(discussionConfig) => { void controller.handleStartOrchestration(discussionConfig); }}
      />

      <WorkbenchSettingsDialog
        locale={locale}
        isOpen={isSettingsOpen}
        onClose={() => {
          setIsSettingsOpen(false);
        }}
      >
        <WorkbenchControlPanel
          locale={locale}
          objective={controller.workbench.objective}
          activeThreadId={controller.activeThread?.id ?? ''}
          threadOptions={controller.threadOptions}
          selectedTargetKind={controller.selectedTargetKind}
          selectedProviderId={controller.selectedProviderId}
          selectedAdapterId={controller.selectedAdapterId}
          targetModel={controller.targetModel}
          targetModelOptions={controller.targetModelOptions}
          providerOptions={controller.providerOptions}
          adapterOptions={controller.adapterOptions}
          boundSkillNames={controller.boundSkills.map((skill) => skill.name)}
          onObjectiveChange={controller.handleSaveObjective}
          onTargetKindChange={(kind) => {
            if (kind === 'provider' && controller.providerOptions[0]) {
              controller.handleTargetOptionChange(`provider:${controller.selectedProviderId || controller.providerOptions[0].id}`);
              return;
            }
            if (kind === 'adapter' && controller.adapterOptions[0]) {
              controller.handleTargetOptionChange(`adapter:${controller.selectedAdapterId || controller.adapterOptions[0].id}`);
            }
          }}
          onProviderChange={(providerId) => {
            controller.handleTargetOptionChange(`provider:${providerId}`);
          }}
          onAdapterChange={(adapterId) => {
            controller.handleTargetOptionChange(`adapter:${adapterId}`);
          }}
          onThreadChange={controller.handleThreadChange}
          onCreateThread={controller.handleCreateThread}
          onTargetModelChange={controller.setTargetModel}
        />
      </WorkbenchSettingsDialog>
    </section>
  );
}
