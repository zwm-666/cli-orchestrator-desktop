import type { Locale, WorkbenchTargetKind } from '../../../shared/domain.js';
import { TARGET_KIND_LABELS } from '../workConfigCopy.js';

interface WorkbenchSwitchTriggerProps {
  locale: Locale;
  selectedTargetKind: WorkbenchTargetKind;
  targetLabel: string | null;
  targetModel: string;
  onClick: () => void;
}

export function WorkbenchSwitchTrigger(props: WorkbenchSwitchTriggerProps): React.JSX.Element {
  const { locale, selectedTargetKind, targetLabel, targetModel, onClick } = props;

  const targetKindLabel = TARGET_KIND_LABELS[locale][selectedTargetKind];

  const summary = [
    targetKindLabel,
    targetLabel ?? (locale === 'zh' ? '未选择目标' : 'No target selected'),
    targetModel || (locale === 'zh' ? '未指定模型' : 'No model'),
  ].join(' · ');

  return (
    <button type="button" className="workbench-switch-trigger" onClick={onClick}>
      <span className="workbench-switch-trigger-copy">
        <span className="section-label">{locale === 'zh' ? '工作台' : 'Workbench'}</span>
        <strong>{locale === 'zh' ? '切换工作台' : 'Switch workbench'}</strong>
        <span className="mini-meta">{summary}</span>
      </span>
    </button>
  );
}
