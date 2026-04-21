import type { Locale } from '../../../shared/domain.js';
import { PROMPT_BUILDER_TEMPLATE_ORDER, type PromptBuilderConfig, type PromptBuilderTemplateKey } from '../../../shared/promptBuilder.js';
import type { InlineStatus } from '../configPageShared.js';
import { PROMPT_BUILDER_COPY, PROMPT_BUILDER_TEMPLATE_META } from '../promptBuilderCopy.js';
import { PromptBuilderTemplateEditor } from './PromptBuilderTemplateEditor.js';

interface PromptBuilderConfigSectionProps {
  locale: Locale;
  draftConfig: PromptBuilderConfig;
  isLoading: boolean;
  loadError: string | null;
  saveStatus: InlineStatus | null;
  updateTemplate: (key: PromptBuilderTemplateKey, value: string) => void;
  onSave: () => Promise<void>;
}

export function PromptBuilderConfigSection(props: PromptBuilderConfigSectionProps): React.JSX.Element {
  const { locale, draftConfig, isLoading, loadError, saveStatus, updateTemplate, onSave } = props;
  const copy = PROMPT_BUILDER_COPY[locale];

  return (
    <section id="config-prompt-builder" className="section-panel inlay-card config-section-card">
      <div className="section-heading workspace-pane-heading">
        <div>
          <p className="section-label">{copy.configSectionEyebrow}</p>
          <h3>{copy.configSectionTitle}</h3>
          <p className="muted">{copy.configSectionCopy}</p>
        </div>
      </div>

      <div className="prompt-builder-template-stack">
        {PROMPT_BUILDER_TEMPLATE_ORDER.map((key) => {
          const meta = PROMPT_BUILDER_TEMPLATE_META[key];

          return (
            <PromptBuilderTemplateEditor
              key={key}
              locale={locale}
              title={meta.title[locale]}
              description={meta.description[locale]}
              fileName={meta.fileName}
              value={draftConfig[key]}
              onChange={(value) => {
                updateTemplate(key, value);
              }}
            />
          );
        })}
      </div>

      <div className="card-actions">
        <button type="button" className="primary-button" disabled={isLoading} onClick={() => { void onSave(); }}>
          {isLoading ? copy.configSaving : copy.configSave}
        </button>
      </div>

      {loadError ? <div className="status-banner status-error"><p>{loadError}</p></div> : null}
      {saveStatus ? <div className={`status-banner status-${saveStatus.tone}`}><p>{saveStatus.message}</p></div> : null}
    </section>
  );
}
