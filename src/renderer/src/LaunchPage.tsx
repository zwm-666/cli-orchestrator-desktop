import type { FormEvent } from 'react';
import type {
  AppState,
  CliAdapter,
  Conversation,
  LaunchFormDraft,
  Locale,
  PlanDraft,
  PlanTaskDraft
} from '../../shared/domain.js';
import {
  COPY,
  HEALTH_LABELS,
  PLAN_CONFIDENCE_LABELS,
  READINESS_BADGE_CLASSES,
  READINESS_LABELS,
  ROUTING_SOURCE_LABELS,
  SEGMENTATION_SOURCE_LABELS,
  TASK_TYPE_LABELS
} from './copy.js';
import {
  formatTime,
  formatTimeoutValue,
  getLatestConversationMessage,
  getLocalizedCliMessage,
  renderTimeoutHint
} from './helpers.js';

type LaunchFormState = LaunchFormDraft;

interface LaunchPageProps {
  locale: Locale;
  state: AppState;
  launchForm: LaunchFormState;
  enabledAdapters: CliAdapter[];
  adapterById: Map<string, CliAdapter>;
  conversationById: Map<string, Conversation>;
  planDraft: PlanDraft | null;
  plannedTasks: PlanTaskDraft[];
  selectedPlannedTaskIndex: number;
  selectedPlannedTask: PlanTaskDraft | null;
  plannedAdapter: CliAdapter | null;
  launchAdapter: CliAdapter | null;
  launchConversation: Conversation | null;
  launchDefaultTimeoutLabel: string;
  launchEnvironmentBlockedAdapter: CliAdapter | null;
  isPlanning: boolean;
  isLaunching: boolean;
  onUpdateLaunchField: <Field extends keyof LaunchFormState>(field: Field, value: LaunchFormState[Field]) => void;
  onPlanDraft: () => Promise<void>;
  onApplyPlan: () => void;
  onLaunchRun: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onSelectPlannedTask: (index: number) => void;
}

export function LaunchPage(props: LaunchPageProps): React.JSX.Element {
  const {
    locale,
    state,
    launchForm,
    enabledAdapters,
    adapterById,
    planDraft,
    plannedTasks,
    selectedPlannedTaskIndex,
    selectedPlannedTask,
    plannedAdapter,
    launchAdapter,
    launchConversation,
    launchDefaultTimeoutLabel,
    launchEnvironmentBlockedAdapter,
    isPlanning,
    isLaunching,
    onUpdateLaunchField,
    onPlanDraft,
    onApplyPlan,
    onLaunchRun,
    onSelectPlannedTask
  } = props;

  const copy = COPY[locale];

  return (
    <section className="page-layout launch-page-layout">
      <div className="page-column">
        <section className="section-panel inlay-card">
          <div className="section-heading">
            <h3>{copy.launchFormTitle}</h3>
          </div>

          <form className="launch-form" onSubmit={onLaunchRun}>
            <label className="field span-two">
              <span>{copy.runTitleLabel}</span>
              <input
                value={launchForm.title}
                placeholder={copy.runTitlePlaceholder}
                onChange={(event) => onUpdateLaunchField('title', event.target.value)}
              />
            </label>

            <label className="field">
              <span>{copy.adapterLabel}</span>
              <select
                value={launchForm.adapterId}
                onChange={(event) => onUpdateLaunchField('adapterId', event.target.value)}
                disabled={enabledAdapters.length === 0}
              >
                {enabledAdapters.length === 0 ? <option value="">{copy.noEnabledAdapters}</option> : null}
                {enabledAdapters.map((adapter) => (
                  <option key={adapter.id} value={adapter.id}>
                    {adapter.displayName}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>{copy.modelLabel}</span>
              <input
                value={launchForm.model}
                placeholder={copy.modelPlaceholder}
                onChange={(event) => onUpdateLaunchField('model', event.target.value)}
              />
            </label>

            <label className="field">
              <span>{copy.conversationLabel}</span>
              <select
                value={launchForm.conversationId}
                onChange={(event) => onUpdateLaunchField('conversationId', event.target.value)}
              >
                <option value="">{copy.newConversationOption}</option>
                {state.conversations.map((conversation) => (
                  <option key={conversation.id} value={conversation.id}>
                    {conversation.title}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>{copy.timeoutLabel}</span>
              <input
                type="number"
                min={1}
                step={1}
                inputMode="numeric"
                value={launchForm.timeoutMs}
                placeholder={copy.timeoutPlaceholder}
                onChange={(event) => onUpdateLaunchField('timeoutMs', event.target.value)}
              />
              <span className="field-note">{renderTimeoutHint(locale, launchDefaultTimeoutLabel)}</span>
            </label>

            <label className="field span-two">
              <span>{copy.promptLabel}</span>
              <textarea
                value={launchForm.prompt}
                rows={6}
                placeholder={copy.promptPlaceholder}
                onChange={(event) => onUpdateLaunchField('prompt', event.target.value)}
              />
            </label>

            {launchEnvironmentBlockedAdapter ? (
              <div className="status-banner launch-advisory span-two">
                <div className="launch-advisory-header">
                  <span className={`state-badge ${READINESS_BADGE_CLASSES[launchEnvironmentBlockedAdapter.readiness]}`}>
                    {READINESS_LABELS[locale][launchEnvironmentBlockedAdapter.readiness]}
                  </span>
                  <p className="inline-note">{copy.launchEnvironmentAdvisory}</p>
                </div>
                <p className="adapter-meta-copy launch-advisory-reason">
                  <span className="meta-label">{copy.readinessReasonLabel}</span>
                  <strong>
                    {launchEnvironmentBlockedAdapter.readinessReason
                      ? getLocalizedCliMessage(locale, launchEnvironmentBlockedAdapter.readinessReason)
                      : copy.emptyValue}
                  </strong>
                </p>
              </div>
            ) : null}

            <div className="form-actions span-two">
              <button type="button" className="secondary-button" onClick={onPlanDraft} disabled={isPlanning}>
                {isPlanning ? copy.planningAction : copy.planAction}
              </button>
              <button type="submit" className="primary-button" disabled={isLaunching || enabledAdapters.length === 0}>
                {isLaunching ? copy.startingRun : copy.startRun}
              </button>
              {enabledAdapters.length === 0 ? <p className="inline-note">{copy.noEnabledAdapters}</p> : null}
            </div>
          </form>
        </section>

        <section className="section-panel inlay-card">
          <div className="section-heading">
            <h3>{copy.plannerTitle}</h3>
          </div>

          {planDraft ? (
            <div className="planner-summary">
              <div className="planner-meta">
                <section className="info-card">
                  <span>{copy.plannerTaskCount}</span>
                  <strong>{plannedTasks.length}</strong>
                </section>
                <section className="info-card">
                  <span>{copy.plannerSegmentationSource}</span>
                  <strong>{SEGMENTATION_SOURCE_LABELS[locale][planDraft.segmentationSource]}</strong>
                </section>
                <section className="info-card">
                  <span>{copy.plannerVersion}</span>
                  <strong>{planDraft.plannerVersion}</strong>
                </section>
              </div>
              <p className="muted">{copy.plannerReviewHint}</p>
              <div className="planner-task-list">
                {plannedTasks.map((taskDraft, index) => {
                  const isActive = index === selectedPlannedTaskIndex;
                  const taskAdapter = taskDraft.recommendedAdapterId
                    ? adapterById.get(taskDraft.recommendedAdapterId) ?? null
                    : null;

                  return (
                    <button
                      key={`${taskDraft.taskTitle}-${taskDraft.rawInput}`}
                      type="button"
                      className={`planner-task-button ${isActive ? 'is-active' : ''}`}
                      onClick={() => onSelectPlannedTask(index)}
                    >
                      <div className="planner-task-topline">
                        <span className="status-pill">
                          {copy.task} {index + 1}
                        </span>
                        <span className={`state-badge state-${taskDraft.confidence}`}>
                          {PLAN_CONFIDENCE_LABELS[locale][taskDraft.confidence]}
                        </span>
                      </div>
                      <h4>{taskDraft.taskTitle}</h4>
                      <p>{taskAdapter?.displayName ?? taskDraft.recommendedAdapterId ?? copy.plannerNoAdapter}</p>
                    </button>
                  );
                })}
              </div>
              {selectedPlannedTask ? (
                <div className="stack-meta planner-task-detail">
                  <div>
                    <span>{copy.plannerTaskTitle}</span>
                    <strong>{selectedPlannedTask.taskTitle}</strong>
                  </div>
                  <div>
                    <span>{copy.plannerTaskType}</span>
                    <strong>{selectedPlannedTask.displayCategory || TASK_TYPE_LABELS[locale][selectedPlannedTask.taskType]}</strong>
                  </div>
                  <div>
                    <span>{copy.plannerRecommendedAdapter}</span>
                    <strong>
                      {plannedAdapter?.displayName ?? selectedPlannedTask.recommendedAdapterId ?? copy.plannerNoAdapter}
                    </strong>
                  </div>
                  <div>
                    <span>{copy.plannerRecommendedModel}</span>
                    <strong>{selectedPlannedTask.recommendedModel || copy.useAdapterDefault}</strong>
                  </div>
                  <div>
                    <span>{copy.plannerRoutingSource}</span>
                    <strong>{ROUTING_SOURCE_LABELS[locale][selectedPlannedTask.routingSource]}</strong>
                  </div>
                  <div>
                    <span>{copy.plannerConfidence}</span>
                    <strong>{PLAN_CONFIDENCE_LABELS[locale][selectedPlannedTask.confidence]}</strong>
                  </div>
                  <div>
                    <span>{copy.plannerClassificationReason}</span>
                    <strong>{selectedPlannedTask.classificationReason}</strong>
                  </div>
                  <div>
                    <span>{copy.plannerRationale}</span>
                    <strong>{selectedPlannedTask.rationale}</strong>
                  </div>
                  <div>
                    <span>{copy.plannerMentions}</span>
                    <strong>
                      {selectedPlannedTask.mentions.length > 0
                        ? selectedPlannedTask.mentions
                            .map((mention) => `${mention.token}${mention.recognized ? '' : ' (?)'}`)
                            .join(', ')
                        : copy.plannerNoMentions}
                    </strong>
                  </div>
                  <div>
                    <span>{copy.plannerCleanedPrompt}</span>
                    <code>{selectedPlannedTask.cleanedPrompt || copy.emptyValue}</code>
                  </div>
                </div>
              ) : null}
              <div className="planner-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={onApplyPlan}
                  disabled={!selectedPlannedTask}
                >
                  {copy.applyPlanAction}
                </button>
              </div>
            </div>
          ) : (
            <p className="empty-state compact">{copy.plannerEmpty}</p>
          )}
        </section>
      </div>

      <aside className="page-sidebar">
        <section className="section-panel inlay-card">
          <div className="section-heading">
            <h3>{copy.launchRailTitle}</h3>
          </div>

          <div className="stack-list">
            <div className="brief-block">
              <p className="eyebrow">{copy.adapterBriefing}</p>
              <h3>{launchAdapter?.displayName ?? copy.unknown}</h3>
              <p className="muted">{launchAdapter?.description ?? copy.noEnabledAdapters}</p>
              <div className="pill-row">
                {launchAdapter ? (
                  <>
                    <span className={`state-badge state-${launchAdapter.health}`}>
                      {HEALTH_LABELS[locale][launchAdapter.health]}
                    </span>
                    {launchEnvironmentBlockedAdapter ? (
                      <span
                        className={`state-badge ${READINESS_BADGE_CLASSES[launchEnvironmentBlockedAdapter.readiness]}`}
                      >
                        {READINESS_LABELS[locale][launchEnvironmentBlockedAdapter.readiness]}
                      </span>
                    ) : null}
                    <span className="state-badge state-running">{copy.enabled}</span>
                  </>
                ) : null}
              </div>
              {launchEnvironmentBlockedAdapter ? (
                <p className="adapter-meta-copy">
                  <span className="meta-label">{copy.readinessReasonLabel}</span>
                  <span>
                    {launchEnvironmentBlockedAdapter.readinessReason
                      ? getLocalizedCliMessage(locale, launchEnvironmentBlockedAdapter.readinessReason)
                      : copy.emptyValue}
                  </span>
                </p>
              ) : null}
            </div>

            <div className="brief-block">
              <p className="eyebrow">{copy.conversationTarget}</p>
              <h3>{launchConversation?.title ?? copy.newConversationLabel}</h3>
              <p className="muted">{copy.createConversationHint}</p>
            </div>

            <div className="brief-block">
              <p className="eyebrow">{copy.commandPreview}</p>
              <code>{launchAdapter?.command ?? copy.emptyValue}</code>
            </div>

            <div className="brief-block">
              <p className="eyebrow">{copy.timeoutWindow}</p>
              <h3>{launchDefaultTimeoutLabel}</h3>
              <p className="muted">{renderTimeoutHint(locale, launchDefaultTimeoutLabel)}</p>
            </div>

            <div className="brief-block">
              <p className="eyebrow">{copy.capabilities}</p>
              <div className="pill-row">
                {(launchAdapter?.capabilities ?? []).map((capability) => (
                  <span key={capability} className="capability-pill">
                    {capability}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="section-panel inlay-card">
          <div className="section-heading">
            <h3>{copy.conversationsTitle}</h3>
          </div>

          <div className="stack-list rail-scroll">
            {state.conversations.length === 0 ? (
              <p className="empty-state compact">{copy.conversationsEmpty}</p>
            ) : (
              state.conversations.map((conversation) => (
                <button
                  key={conversation.id}
                  type="button"
                  className={`list-card conversation-card ${launchForm.conversationId === conversation.id ? 'is-selected' : ''}`}
                  onClick={() => onUpdateLaunchField('conversationId', conversation.id)}
                >
                  <div className="list-topline">
                    <h3>{conversation.title}</h3>
                    <span className="mini-meta">{formatTime(locale, conversation.updatedAt)}</span>
                  </div>
                  <p>{getLatestConversationMessage(conversation) || copy.emptyValue}</p>
                  <div className="mini-meta-row">
                    <span>
                      {conversation.messages.length} {copy.messageCount}
                    </span>
                    <span>{launchForm.conversationId === conversation.id ? copy.selectedContext : conversation.id}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </section>
      </aside>
    </section>
  );
}
