import { useState } from 'react';
import type { Locale } from '../../../shared/domain.js';
import { CONFIG_PAGE_COPY } from '../workConfigCopy.js';
import { PROMPT_BUILDER_COPY } from '../promptBuilderCopy.js';

interface ConfigIndexRailProps {
  locale: Locale;
  providerItems: { id: string; label: string }[];
  adapterItems: { id: string; label: string }[];
}

const scrollToSection = (elementId: string): void => {
  const element = document.getElementById(elementId);
  if (!element) {
    return;
  }

  element.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

export function ConfigIndexRail({ locale, providerItems, adapterItems }: ConfigIndexRailProps): React.JSX.Element {
  const [activeItemId, setActiveItemId] = useState('config-providers');
  const copy = CONFIG_PAGE_COPY[locale];
  const promptBuilderCopy = PROMPT_BUILDER_COPY[locale];

  const jumpTo = (elementId: string): void => {
    setActiveItemId(elementId);
    scrollToSection(elementId);
  };

  return (
    <aside className="config-index-rail section-panel inlay-card">
      <div className="section-heading workspace-pane-heading">
        <div>
          <p className="section-label">{copy.indexEyebrow}</p>
          <h3>{copy.indexTitle}</h3>
        </div>
      </div>

      <div className="config-index-group">
        <p className="mini-meta config-index-group-label">{copy.providerGroupLabel}</p>
        <button
          type="button"
          className={`config-index-link ${activeItemId === 'config-providers' ? 'is-active' : ''}`}
          onClick={() => {
            jumpTo('config-providers');
          }}
        >
          {copy.providerOverviewLabel}
        </button>
        {providerItems.map((item) => {
          const anchorId = `config-provider-${item.id}`;
          return (
            <button
              key={anchorId}
              type="button"
              className={`config-index-link ${activeItemId === anchorId ? 'is-active' : ''}`}
              onClick={() => {
                jumpTo(anchorId);
              }}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      <div className="config-index-group">
        <p className="mini-meta config-index-group-label">{copy.localToolsGroupLabel}</p>
        {adapterItems.map((item) => {
          const anchorId = `config-adapter-${item.id}`;
          return (
            <button
              key={anchorId}
              type="button"
              className={`config-index-link ${activeItemId === anchorId ? 'is-active' : ''}`}
              onClick={() => {
                jumpTo(anchorId);
              }}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      <div className="config-index-group">
        <p className="mini-meta config-index-group-label">{copy.otherGroupLabel}</p>
        {[
          { id: 'config-agents', label: locale === 'zh' ? 'Agent 配置' : 'Agent config' },
          { id: 'config-skills', label: copy.skillBindingsLabel },
          { id: 'config-prompt-builder', label: promptBuilderCopy.configSectionEyebrow },
          { id: 'config-actions', label: copy.actionsLabel },
        ].map((item) => (
          <button
            key={item.id}
            type="button"
            className={`config-index-link ${activeItemId === item.id ? 'is-active' : ''}`}
            onClick={() => {
              jumpTo(item.id);
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
    </aside>
  );
}
