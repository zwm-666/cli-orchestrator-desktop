import { NavLink } from 'react-router-dom';
import type { Locale } from '../../../shared/domain.js';
import { LOCALE_NAMES } from '../copy.js';

interface TopNavProps {
  locale: Locale;
  workspaceLabel?: string | null;
  onSetLocale: (locale: Locale) => void;
  onSwitchProject: () => void;
}

export function TopNav({ locale, workspaceLabel, onSetLocale, onSwitchProject }: TopNavProps): React.JSX.Element {
  return (
    <header className="top-nav card">
      <div className="top-nav-brand-block top-nav-brand-block-compact">
        <div className="brand-mark">CO</div>
        <div className="top-nav-copy top-nav-copy-compact">
          <strong className="top-nav-title">CLI Orchestrator</strong>
          <p className="mini-meta">{locale === 'zh' ? '统一工作台' : 'Unified workbench'}</p>
        </div>
      </div>

      <nav className="top-nav-links" aria-label="Primary">
        <NavLink to="/plan" className={({ isActive }) => `route-link ${isActive ? 'is-active' : ''}`}>
          {locale === 'zh' ? '计划' : 'Plan'}
        </NavLink>
        <NavLink to="/work" className={({ isActive }) => `route-link ${isActive ? 'is-active' : ''}`}>
          {locale === 'zh' ? '工作台' : 'Work'}
        </NavLink>
        <NavLink to="/config" className={({ isActive }) => `route-link ${isActive ? 'is-active' : ''}`}>
          {locale === 'zh' ? '配置' : 'Config'}
        </NavLink>
      </nav>

      <div className="locale-inline-group">
        {workspaceLabel ? <span className="status-pill">{workspaceLabel}</span> : null}
        <button type="button" className="secondary-button secondary-button-compact" onClick={onSwitchProject}>
          {locale === 'zh' ? '更换文件夹' : 'Change folder'}
        </button>
        {(['en', 'zh'] as const).map((entry) => (
          <button
            key={entry}
            type="button"
            className={`locale-button ${locale === entry ? 'is-active' : ''}`}
            onClick={() => {
              onSetLocale(entry);
            }}
          >
            {LOCALE_NAMES[entry]}
          </button>
        ))}
      </div>
    </header>
  );
}
