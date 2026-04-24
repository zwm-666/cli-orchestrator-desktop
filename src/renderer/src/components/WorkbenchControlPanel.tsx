import { useEffect, useRef, useState } from 'react';
import type { Locale, WorkbenchTargetKind } from '../../../shared/domain.js';
import { TARGET_KIND_LABELS } from '../workConfigCopy.js';

interface TargetOption {
  id: string;
  label: string;
}

interface WorkbenchControlPanelProps {
  locale: Locale;
  objective: string;
  activeThreadId: string;
  threadOptions: TargetOption[];
  selectedTargetKind: WorkbenchTargetKind;
  selectedProviderId: string;
  selectedAdapterId: string;
  targetModel: string;
  targetModelOptions: string[];
  providerOptions: TargetOption[];
  adapterOptions: TargetOption[];
  boundSkillNames: string[];
  hideTargetControls?: boolean;
  onObjectiveChange: (value: string) => void;
  onTargetKindChange: (value: WorkbenchTargetKind) => void;
  onProviderChange: (value: string) => void;
  onAdapterChange: (value: string) => void;
  onThreadChange: (value: string) => void;
  onCreateThread: () => void;
  onTargetModelChange: (value: string) => void;
}

export function WorkbenchControlPanel(props: WorkbenchControlPanelProps): React.JSX.Element {
  const {
    locale,
    objective,
    activeThreadId,
    threadOptions,
    selectedTargetKind,
    selectedProviderId,
    selectedAdapterId,
    targetModel,
    targetModelOptions,
    providerOptions,
    adapterOptions,
    boundSkillNames,
    hideTargetControls = false,
    onObjectiveChange,
    onTargetKindChange,
    onProviderChange,
    onAdapterChange,
    onThreadChange,
    onCreateThread,
    onTargetModelChange,
  } = props;
  const [objectiveDraft, setObjectiveDraft] = useState(objective);
  const isComposingRef = useRef(false);

  useEffect(() => {
    if (!isComposingRef.current) {
      setObjectiveDraft(objective);
    }
  }, [objective]);

  const persistObjectiveDraft = (nextObjective: string): void => {
    if (nextObjective !== objective) {
      onObjectiveChange(nextObjective);
    }
  };

  return (
    <div className="workbench-control-panel">
      <label className="field">
        <span>{locale === 'zh' ? '工作目标' : 'Objective'}</span>
        <textarea
          rows={3}
          value={objectiveDraft}
          placeholder={locale === 'zh' ? '描述这次要完成的整体工作...' : 'Describe the overall objective for this work session...'}
          onChange={(event) => {
            const nextValue = event.target.value;
            setObjectiveDraft(nextValue);

            if (!isComposingRef.current) {
              persistObjectiveDraft(nextValue);
            }
          }}
          onCompositionStart={() => {
            isComposingRef.current = true;
          }}
          onCompositionEnd={(event) => {
            isComposingRef.current = false;
            const nextValue = event.currentTarget.value;
            setObjectiveDraft(nextValue);
            persistObjectiveDraft(nextValue);
          }}
          onBlur={(event) => {
            persistObjectiveDraft(event.currentTarget.value);
          }}
        />
      </label>

      <div className="selector-strip workbench-target-strip">
        <label className="field">
          <span>{locale === 'zh' ? '任务线程' : 'Task thread'}</span>
          <select value={activeThreadId} onChange={(event) => { onThreadChange(event.target.value); }}>
            {threadOptions.map((thread) => (
              <option key={thread.id} value={thread.id}>
                {thread.label}
              </option>
            ))}
          </select>
        </label>

        <div className="field">
          <span>{locale === 'zh' ? '线程操作' : 'Thread actions'}</span>
          <button type="button" className="secondary-button" onClick={onCreateThread}>
            {locale === 'zh' ? '新建线程' : 'New thread'}
          </button>
        </div>
      </div>

      {!hideTargetControls ? (
        <div className="selector-strip workbench-target-strip">
          <label className="field">
            <span>{locale === 'zh' ? '目标类型' : 'Target type'}</span>
            <select
              value={selectedTargetKind}
              onChange={(event) => {
                onTargetKindChange(event.target.value as WorkbenchTargetKind);
              }}
            >
              <option value="provider">{TARGET_KIND_LABELS[locale].provider}</option>
              <option value="adapter">{TARGET_KIND_LABELS[locale].adapter}</option>
            </select>
          </label>

          {selectedTargetKind === 'provider' ? (
            <label className="field">
              <span>{TARGET_KIND_LABELS[locale].provider}</span>
              <select value={selectedProviderId} onChange={(event) => { onProviderChange(event.target.value); }}>
                <option value="">{locale === 'zh' ? '选择服务' : 'Choose a provider'}</option>
                {providerOptions.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.label}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="field">
              <span>{TARGET_KIND_LABELS[locale].adapter}</span>
              <select value={selectedAdapterId} onChange={(event) => { onAdapterChange(event.target.value); }}>
                <option value="">{locale === 'zh' ? '选择本地工具' : 'Choose a local adapter'}</option>
                {adapterOptions.map((adapter) => (
                  <option key={adapter.id} value={adapter.id}>
                    {adapter.label}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="field">
            <span>{locale === 'zh' ? '模型' : 'Model'}</span>
            {targetModelOptions.length > 0 ? (
              <select
                value={targetModel}
                onChange={(event) => {
                  onTargetModelChange(event.target.value);
                }}
              >
                <option value="">{locale === 'zh' ? '选择已保存模型' : 'Choose a saved model'}</option>
                {targetModelOptions.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            ) : null}
            <input
              list={targetModelOptions.length > 0 ? 'workbench-target-model-list' : undefined}
              value={targetModel}
              placeholder={locale === 'zh' ? '为当前目标指定模型' : 'Set the model for the current target'}
              onChange={(event) => {
                onTargetModelChange(event.target.value);
              }}
            />
            {targetModelOptions.length > 0 ? (
              <datalist id="workbench-target-model-list">
                {targetModelOptions.map((model) => (
                  <option key={model} value={model} />
                ))}
              </datalist>
            ) : null}
          </label>
        </div>
      ) : null}

      <div className="workbench-settings-meta">
        <div className="badge-pair">
          <span className="status-pill">{locale === 'zh' ? `已绑定技能 ${boundSkillNames.length}` : `${boundSkillNames.length} bound skills`}</span>
          {boundSkillNames.map((name) => (
            <span key={name} className="status-pill">{name}</span>
          ))}
        </div>
        <p className="mini-meta workbench-settings-note">
          {locale === 'zh'
            ? '连续工作提示词请在当前对话或本地工具模块中直接编辑。'
            : 'Edit the continuity prompt directly in the active chat or local tool module.'}
        </p>
      </div>
    </div>
  );
}
