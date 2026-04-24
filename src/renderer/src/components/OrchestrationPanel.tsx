import { useState } from 'react';
import type { DiscussionAutomationConfigInput, Locale, OrchestrationExecutionStyle } from '../../../shared/domain.js';
import type { WorkbenchOption } from '../hooks/workbenchControllerShared.js';

interface OrchestrationPanelProps {
  locale: Locale;
  isOpen: boolean;
  mode: 'standard' | 'discussion';
  executionStyle: OrchestrationExecutionStyle;
  prompt: string;
  participantOptions: WorkbenchOption[];
  selectedParticipantIds: string[];
  errorMessage: string | null;
  isStarting: boolean;
  onClose: () => void;
  onModeChange: (mode: 'standard' | 'discussion') => void;
  onExecutionStyleChange: (value: OrchestrationExecutionStyle) => void;
  onPromptChange: (value: string) => void;
  onParticipantIdsChange: (value: string[]) => void;
  onStart: (discussionConfig?: DiscussionAutomationConfigInput | null) => void;
}

export function OrchestrationPanel(props: OrchestrationPanelProps): React.JSX.Element | null {
  const {
    locale,
    isOpen,
    mode,
    executionStyle,
    prompt,
    participantOptions,
    selectedParticipantIds,
    errorMessage,
    isStarting,
    onClose,
    onModeChange,
    onExecutionStyleChange,
    onPromptChange,
    onParticipantIdsChange,
    onStart,
  } = props;
  const [maxRounds, setMaxRounds] = useState('3');

  if (!isOpen) {
    return null;
  }

  return (
    <div className="workbench-overlay" role="presentation">
      <section className="workbench-dialog card orchestration-panel">
        <div className="section-heading workspace-pane-heading">
          <div>
            <p className="section-label">{locale === 'zh' ? '多 Agent 编排' : 'Multi-agent orchestration'}</p>
            <h3>{locale === 'zh' ? '配置一次协作流程' : 'Configure one collaborative workflow'}</h3>
          </div>
          <button type="button" className="secondary-button secondary-button-compact" onClick={onClose}>
            {locale === 'zh' ? '关闭' : 'Close'}
          </button>
        </div>

        {errorMessage ? <div className="status-banner status-error"><p>{errorMessage}</p></div> : null}

        <div className="settings-grid compact-settings-grid">
          <label className="field">
            <span>{locale === 'zh' ? '模式' : 'Mode'}</span>
            <select value={mode} onChange={(event) => { onModeChange(event.target.value as 'standard' | 'discussion'); }}>
              <option value="standard">{locale === 'zh' ? '编排' : 'Orchestrate'}</option>
              <option value="discussion">{locale === 'zh' ? '讨论' : 'Discussion'}</option>
            </select>
          </label>

          {mode === 'standard' ? (
            <label className="field">
              <span>{locale === 'zh' ? '执行方式' : 'Execution style'}</span>
              <select value={executionStyle} onChange={(event) => { onExecutionStyleChange(event.target.value as OrchestrationExecutionStyle); }}>
                <option value="parallel">{locale === 'zh' ? '并行执行' : 'Parallel'}</option>
                <option value="sequential">{locale === 'zh' ? '顺序执行' : 'Sequential'}</option>
                <option value="planner">{locale === 'zh' ? 'Planner 自动' : 'Planner auto'}</option>
              </select>
            </label>
          ) : (
            <label className="field">
              <span>{locale === 'zh' ? '最大轮数' : 'Max rounds'}</span>
              <input value={maxRounds} onChange={(event) => { setMaxRounds(event.target.value); }} />
            </label>
          )}
        </div>

        <label className="field">
          <span>{locale === 'zh' ? '任务描述' : 'Task prompt'}</span>
          <textarea rows={8} value={prompt} onChange={(event) => { onPromptChange(event.target.value); }} />
        </label>

        <div className="field">
          <span>{locale === 'zh' ? '参与 Agent' : 'Participating agents'}</span>
          <div className="orchestration-participant-list">
            {participantOptions.map((option) => {
              const isSelected = selectedParticipantIds.includes(option.id);
              return (
                <label key={option.id} className={`workbench-task-row ${isSelected ? 'is-selected' : ''}`}>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(event) => {
                      if (event.target.checked) {
                        onParticipantIdsChange([...selectedParticipantIds, option.id]);
                        return;
                      }

                      onParticipantIdsChange(selectedParticipantIds.filter((entry) => entry !== option.id));
                    }}
                  />
                  <span className="workbench-task-copy">
                    <strong>{option.label}</strong>
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        <div className="card-actions">
          <button
            type="button"
            className="primary-button"
            disabled={isStarting}
            onClick={() => {
              onStart(mode === 'discussion' ? { maxRounds: Number(maxRounds) || 3 } : null);
            }}
          >
            {isStarting ? (locale === 'zh' ? '启动中...' : 'Starting...') : locale === 'zh' ? '开始编排' : 'Start orchestration'}
          </button>
        </div>
      </section>
    </div>
  );
}
