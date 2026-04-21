import type { Locale } from '../../../shared/domain.js';

interface PromptBuilderTemplateEditorProps {
  locale: Locale;
  title: string;
  description: string;
  fileName: string;
  value: string;
  onChange: (value: string) => void;
}

export function PromptBuilderTemplateEditor(props: PromptBuilderTemplateEditorProps): React.JSX.Element {
  const { locale, title, description, fileName, value, onChange } = props;

  return (
    <article className="section-panel inlay-card prompt-builder-template-card">
      <div className="section-heading workspace-pane-heading">
        <div>
          <p className="section-label">{title}</p>
          <h3>{fileName}</h3>
          <p className="mini-meta">{description}</p>
        </div>
      </div>

      <label className="field">
        <span>{locale === 'zh' ? '模板内容' : 'Template content'}</span>
        <textarea
          className="prompt-builder-template-input"
          rows={12}
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
          }}
        />
      </label>
    </article>
  );
}
