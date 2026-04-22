import { useState } from 'react';
import type { AppState, Locale, WorkbenchState } from '../../../shared/domain.js';
import type { PromptBuilderConfig } from '../../../shared/promptBuilder.js';
import type { AiConfig } from '../aiConfig.js';
import { isProviderReady } from '../aiConfig.js';
import { ChatPanel } from '../components/ChatPanel.js';
import { FileExplorer } from '../components/FileExplorer.js';
import { FilePreview } from '../components/FilePreview.js';
import { LocalAdapterPanel } from '../components/LocalAdapterPanel.js';
import { SplitCommandBuilderPanel } from '../components/SplitCommandBuilderPanel.js';
import { WorkbenchActivityPanel } from '../components/WorkbenchActivityPanel.js';
import { WorkbenchControlPanel } from '../components/WorkbenchControlPanel.js';
import { WorkbenchSettingsDialog } from '../components/WorkbenchSettingsDialog.js';
import { WorkbenchSwitchTrigger } from '../components/WorkbenchSwitchTrigger.js';
import { WorkbenchTaskPanel } from '../components/WorkbenchTaskPanel.js';
import { useSplitCommandBuilder } from '../hooks/useSplitCommandBuilder.js';
import { useWorkbenchController } from '../hooks/useWorkbenchController.js';

interface WorkPageProps {
  locale: Locale;
  aiConfig: AiConfig;
  appState: AppState;
  promptBuilderConfig: PromptBuilderConfig;
  onSaveWorkbenchState: (state: WorkbenchState) => void | Promise<void>;
}

export function WorkPage({ locale, aiConfig, appState, promptBuilderConfig, onSaveWorkbenchState }: WorkPageProps): React.JSX.Element {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const controller = useWorkbenchController({
    locale,
    aiConfig,
    appState,
    promptBuilderConfig,
    onSaveWorkbenchState,
  });

  const {
    workbench,
    activeThread,
    browseResult,
    browseError,
    isBrowsing,
    selectedFile,
    previewError,
    isPreviewLoading,
    chatMessages,
    threadOptions,
    chatError,
    isSending,
    selectedTargetKind,
    selectedProviderId,
    selectedAdapterId,
    targetModel,
    targetPrompt,
    runTitle,
    runError,
    isStartingRun,
    newTaskTitle,
    newTaskDetail,
    isGeneratingTasks,
    taskStatusMessage,
    promptBuilderCommand,
    providerOptions,
    adapterOptions,
    selectedProviderDefinition,
    selectedProviderConfig,
    selectedAdapter,
    boundSkills,
    recentAdapterRuns,
    handleGenerateChecklist,
    handleSaveObjective,
    handleTargetKindChange,
    handleProviderChange,
    handleAdapterChange,
    handleThreadChange,
    handleCreateThread,
    handleToggleTask,
    handleAddTask,
    handleProviderSend,
    handleStartAdapterRun,
    handleApplyPromptBuilderCommand,
    handleClearPromptBuilderCommand,
    setTargetModel,
    setTargetPrompt,
    setRunTitle,
    setNewTaskTitle,
    setNewTaskDetail,
    loadDirectory,
    loadFilePreview,
  } = controller;

  const activeTargetLabel = selectedTargetKind === 'provider'
    ? (selectedProviderDefinition?.label ?? null)
    : (selectedAdapter?.displayName ?? null);

  const providerReady = Boolean(selectedProviderId && selectedProviderConfig && isProviderReady(selectedProviderConfig, targetModel));
  const splitCommandBuilder = useSplitCommandBuilder({
    locale,
    onApplyToPrompt: handleApplyPromptBuilderCommand,
  });

  return (
    <section className="page-stack work-page">
      <div className="section-panel inlay-card workbench-action-row">
        <WorkbenchSwitchTrigger
          locale={locale}
          selectedTargetKind={selectedTargetKind}
          targetLabel={activeTargetLabel}
          targetModel={targetModel}
          onClick={() => {
            setIsSettingsOpen(true);
          }}
        />
      </div>

      <section className="workspace-grid">
        <div className="workspace-sidebar-stack">
          <FileExplorer
            locale={locale}
            browseResult={browseResult}
            isLoading={isBrowsing}
            errorMessage={browseError}
            selectedFilePath={selectedFile?.relativePath ?? null}
            onRefresh={() => {
              void loadDirectory(browseResult?.currentPath ?? null);
            }}
            onCollapseAll={() => {
              void loadDirectory(null);
            }}
            onOpenDirectory={(relativePath) => {
              void loadDirectory(relativePath);
            }}
            onOpenFile={(entry) => {
              void loadFilePreview(entry);
            }}
          />

          <FilePreview locale={locale} file={selectedFile} isLoading={isPreviewLoading} errorMessage={previewError} />
        </div>

        <div className="workspace-main workbench-main-grid">
          <WorkbenchTaskPanel
            locale={locale}
            objective={workbench.objective}
            tasks={workbench.tasks}
            isGeneratingTasks={isGeneratingTasks}
            taskStatusMessage={taskStatusMessage}
            newTaskTitle={newTaskTitle}
            newTaskDetail={newTaskDetail}
            onGenerateChecklist={() => {
              void handleGenerateChecklist();
            }}
            onToggleTask={handleToggleTask}
            onNewTaskTitleChange={setNewTaskTitle}
            onNewTaskDetailChange={setNewTaskDetail}
            onAddTask={handleAddTask}
          />

          <SplitCommandBuilderPanel
            locale={locale}
            task={splitCommandBuilder.task}
            materials={splitCommandBuilder.materials}
            boundaries={splitCommandBuilder.boundaries}
            generatedCommand={splitCommandBuilder.generatedCommand}
            isLoading={splitCommandBuilder.isLoading}
            loadError={splitCommandBuilder.loadError}
            copyStatus={splitCommandBuilder.copyStatus}
            isApplied={Boolean(promptBuilderCommand && promptBuilderCommand === splitCommandBuilder.generatedCommand)}
            onTaskChange={splitCommandBuilder.setTask}
            onMaterialsChange={splitCommandBuilder.setMaterials}
            onBoundariesChange={splitCommandBuilder.setBoundaries}
            onCopy={splitCommandBuilder.handleCopy}
            onApplyToPrompt={splitCommandBuilder.handleApplyToPrompt}
            onClearApplied={handleClearPromptBuilderCommand}
          />

          {selectedTargetKind === 'provider' ? (
            <ChatPanel
              locale={locale}
              messages={chatMessages}
              inputValue={targetPrompt}
              isSending={isSending}
              canSend={providerReady}
              isProviderReady={providerReady}
              includeSelection={Boolean(selectedFile)}
              errorMessage={chatError}
              selectedFilePath={selectedFile?.relativePath ?? null}
              providerLabel={selectedProviderDefinition?.label ?? null}
              modelLabel={targetModel || null}
              onInputChange={setTargetPrompt}
              onIncludeSelectionChange={() => {
                // file context is always included via continuity prompt generation
              }}
              onSubmit={() => {
                void handleProviderSend();
              }}
            />
          ) : (
            <LocalAdapterPanel
              locale={locale}
              runTitle={runTitle}
              targetPrompt={targetPrompt}
              runError={runError}
              isStartingRun={isStartingRun}
              canStart={Boolean(selectedAdapter)}
              launchMode={selectedAdapter?.launchMode ?? null}
              recentRuns={recentAdapterRuns}
              adapterLabel={selectedAdapter?.displayName ?? null}
              onRunTitleChange={setRunTitle}
              onTargetPromptChange={setTargetPrompt}
              onStart={() => {
                void handleStartAdapterRun();
              }}
            />
          )}

          <WorkbenchActivityPanel
            locale={locale}
            latestProviderActivity={workbench.latestProviderActivity}
            latestAdapterActivity={workbench.latestAdapterActivity}
            activityLog={activeThread?.activityLog ?? []}
          />
        </div>
      </section>

      <WorkbenchSettingsDialog
        locale={locale}
        isOpen={isSettingsOpen}
        onClose={() => {
          setIsSettingsOpen(false);
        }}
      >
        <WorkbenchControlPanel
          locale={locale}
          objective={workbench.objective}
          activeThreadId={activeThread?.id ?? ''}
          threadOptions={threadOptions}
          selectedTargetKind={selectedTargetKind}
          selectedProviderId={selectedProviderId}
          selectedAdapterId={selectedAdapterId}
          targetModel={targetModel}
          providerOptions={providerOptions}
          adapterOptions={adapterOptions}
          boundSkillNames={boundSkills.map((skill) => skill.name)}
          onObjectiveChange={handleSaveObjective}
          onTargetKindChange={handleTargetKindChange}
          onProviderChange={handleProviderChange}
          onAdapterChange={handleAdapterChange}
          onThreadChange={handleThreadChange}
          onCreateThread={handleCreateThread}
          onTargetModelChange={setTargetModel}
        />
      </WorkbenchSettingsDialog>
    </section>
  );
}
