import type { Locale } from '../../../shared/domain.js';
import { PROMPT_BUILDER_TEMPLATE_ORDER } from '../../../shared/promptBuilder.js';
import { PROMPT_BUILDER_COPY, PROMPT_BUILDER_TEMPLATE_META } from '../promptBuilderCopy.js';

interface SplitCommandBuilderPanelProps {
  locale: Locale;
  task: string;
  materials: string;
  boundaries: string;
  generatedCommand: string;
  isLoading: boolean;
  loadError: string | null;
  copyStatus: string | null;
  isApplied: boolean;
  onTaskChange: (value: string) => void;
  onMaterialsChange: (value: string) => void;
  onBoundariesChange: (value: string) => void;
  onCopy: () => Promise<void>;
  onApplyToPrompt: () => void;
  onClearApplied: () => void;
}

export function SplitCommandBuilderPanel(props: SplitCommandBuilderPanelProps): React.JSX.Element {
  const {
    locale,
    task,
    materials,
    boundaries,
    generatedCommand,
    isLoading,
    loadError,
    copyStatus,
    isApplied,
    onTaskChange,
    onMaterialsChange,
    onBoundariesChange,
    onCopy,
    onApplyToPrompt,
    onClearApplied,
  } = props;
  const copy = PROMPT_BUILDER_COPY[locale];

  return (
    <section className="section-panel inlay-card split-command-builder-panel">
      <div className="section-heading workspace-pane-heading">
        <div>
          <p className="section-label">{copy.workPanelEyebrow}</p>
          <h3>{copy.workPanelTitle}</h3>
          <p className="muted">{copy.workPanelCopy}</p>
        </div>
      </div>

      <div className="settings-grid compact-settings-grid">
        <label className="field span-two">
          <span>{copy.taskLabel}</span>
          <textarea rows={5} value={task} placeholder={copy.taskPlaceholder} onChange={(event) => { onTaskChange(event.target.value); }} />
        </label>

        <label className="field">
          <span>{copy.materialsLabel}</span>
          <textarea rows={5} value={materials} placeholder={copy.materialsPlaceholder} onChange={(event) => { onMaterialsChange(event.target.value); }} />
        </label>

        <label className="field">
          <span>{copy.boundariesLabel}</span>
          <textarea rows={5} value={boundaries} placeholder={copy.boundariesPlaceholder} onChange={(event) => { onBoundariesChange(event.target.value); }} />
        </label>
      </div>

      <div className="prompt-builder-source-row">
        <span className="mini-meta">{copy.sourceTemplates}</span>
        <div className="badge-pair">
          {PROMPT_BUILDER_TEMPLATE_ORDER.map((key) => (
            <span key={key} className="status-pill">{PROMPT_BUILDER_TEMPLATE_META[key].fileName}</span>
          ))}
        </div>
      </div>

      <label className="field">
        <span>{copy.previewLabel}</span>
        <textarea
          className="prompt-builder-preview"
          rows={18}
          readOnly
          value={generatedCommand || copy.emptyPreview}
        />
      </label>

      <div className="card-actions split-command-builder-actions">
        <button type="button" className="secondary-button" disabled={!generatedCommand || isLoading} onClick={() => { void onCopy(); }}>
          {copy.copyResult}
        </button>
        <button type="button" className="primary-button" disabled={!generatedCommand || isLoading} onClick={onApplyToPrompt}>
          {copy.applyToPrompt}
        </button>
        {isApplied ? (
          <button type="button" className="secondary-button" onClick={onClearApplied}>
            {copy.clearApplied}
          </button>
        ) : null}
      </div>

      {isApplied ? <p className="mini-meta prompt-builder-inline-status">{copy.applied}</p> : null}
      {copyStatus ? <p className="mini-meta prompt-builder-inline-status">{copyStatus}</p> : null}
      {loadError ? <div className="status-banner status-error"><p>{loadError}</p></div> : null}
    </section>
  );
}
