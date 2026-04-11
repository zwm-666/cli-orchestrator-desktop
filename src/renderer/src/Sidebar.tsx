import type { AppState, CliAdapter, Locale } from '../../shared/domain.js';
import { COPY, type PrimaryPage, LOCALE_NAMES, LOCALES } from './copy.js';
import { countEvents } from './helpers.js';

interface SidebarProps {
  locale: Locale;
  state: AppState | null;
  activePage: PrimaryPage;
  isSidebarCompact: boolean;
  enabledAdapters: CliAdapter[];
  visibleAdapters: CliAdapter[];
  totalEvents: number;
  onSetLocale: (locale: Locale) => void;
  onSetActivePage: (page: PrimaryPage) => void;
  onToggleSidebar: () => void;
}

export function Sidebar(props: SidebarProps): React.JSX.Element {
  const {
    locale,
    state,
    activePage,
    isSidebarCompact,
    enabledAdapters,
    visibleAdapters,
    totalEvents,
    onSetLocale,
    onSetActivePage,
    onToggleSidebar
  } = props;

  const copy = COPY[locale];

  const pageTabs: Array<{ id: Exclude<PrimaryPage, 'settings'>; label: string; compactLabel: string }> = [
    { id: 'launch', label: copy.navLaunch, compactLabel: copy.navLaunchShort },
    { id: 'sessions', label: copy.navSessions, compactLabel: copy.navSessionsShort },
    { id: 'orchestration', label: locale === 'zh' ? '编排' : 'Orchestration', compactLabel: locale === 'zh' ? '编排' : 'Orch' }
  ];

  const localeControls = (
    <fieldset className="locale-group">
      <legend className="sr-only">{copy.languageLabel}</legend>
      {LOCALES.map((entry) => (
        <button
          key={entry}
          type="button"
          className={`locale-button ${locale === entry ? 'is-active' : ''}`}
          onClick={() => onSetLocale(entry)}
        >
          {LOCALE_NAMES[entry]}
        </button>
      ))}
    </fieldset>
  );

  return (
    <aside className="sidebar-shell">
      <div className="sidebar card">
        <div className="sidebar-topbar sidebar-topbar-minimal">
          <button
            type="button"
            className="sidebar-toggle"
            aria-label={isSidebarCompact ? copy.sidebarExpand : copy.sidebarCollapse}
            title={isSidebarCompact ? copy.sidebarExpand : copy.sidebarCollapse}
            onClick={onToggleSidebar}
          >
            <span aria-hidden="true">{isSidebarCompact ? '>>' : '<<'}</span>
          </button>
        </div>

        {state ? (
          <>
            <section className="sidebar-block">
              <nav className="sidebar-nav" aria-label={copy.pagesLabel}>
                {pageTabs.map((page) => {
                  const count = page.id === 'launch'
                    ? enabledAdapters.length
                    : page.id === 'orchestration'
                      ? (state.orchestrationRuns?.length ?? 0)
                      : state.runs.length;

                  return (
                    <button
                      key={page.id}
                      type="button"
                      className={`sidebar-nav-button ${activePage === page.id ? 'is-active' : ''}`}
                      aria-current={activePage === page.id ? 'page' : undefined}
                      title={page.label}
                      onClick={() => onSetActivePage(page.id)}
                    >
                      <span className="nav-label-group">
                        <span className="nav-short-label" aria-hidden="true">
                          {page.compactLabel}
                        </span>
                        <span className="nav-label">{page.label}</span>
                      </span>
                      <span className="nav-count">{count}</span>
                    </button>
                  );
                })}
              </nav>
            </section>

            <section className="sidebar-block sidebar-overview-block">
              <div className="sidebar-stats">
                <article className="stat-tile">
                  <p>{copy.statsAdapters}</p>
                  <span>{visibleAdapters.length}</span>
                </article>
                <article className="stat-tile">
                  <p>{copy.statsRuns}</p>
                  <span>{state.runs.length}</span>
                </article>
                <article className="stat-tile">
                  <p>{copy.statsEvents}</p>
                  <span>{totalEvents}</span>
                </article>
              </div>
            </section>

            <div className="sidebar-spacer" />

            <section className="sidebar-block sidebar-utilities-block">
              <div className="utility-cluster inlay-card utility-cluster-discoverable">
                <button
                  type="button"
                  className={`utility-link ${activePage === 'settings' ? 'is-active' : ''}`}
                  onClick={() => onSetActivePage('settings')}
                  disabled={!state}
                  title={copy.navSettings}
                >
                  <span className="nav-label-group">
                    <span className="nav-short-label" aria-hidden="true">
                      {copy.navSettingsShort}
                    </span>
                    <span className="nav-label">{copy.navSettings}</span>
                  </span>
                </button>
                <div className="utility-row utility-row-compact">
                  {localeControls}
                </div>
              </div>
            </section>
          </>
        ) : null}
      </div>
    </aside>
  );
}
