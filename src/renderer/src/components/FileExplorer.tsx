import { useMemo, useState } from 'react';
import type { BrowseWorkspaceResult, Locale, WorkspaceEntry } from '../../../shared/domain.js';

interface FileExplorerProps {
  locale: Locale;
  browseResult: BrowseWorkspaceResult | null;
  isLoading: boolean;
  errorMessage: string | null;
  selectedFilePath: string | null;
  onRefresh: () => void;
  onCollapseAll: () => void;
  onOpenDirectory: (relativePath: string | null) => void;
  onOpenFile: (entry: WorkspaceEntry) => void;
}

interface BreadcrumbItem {
  label: string;
  relativePath: string | null;
}

const getBreadcrumbs = (browseResult: BrowseWorkspaceResult): BreadcrumbItem[] => {
  if (!browseResult.currentPath) {
    return [{ label: browseResult.rootLabel, relativePath: null }];
  }

  const segments = browseResult.currentPath.split('/');
  const breadcrumbs: BreadcrumbItem[] = [{ label: browseResult.rootLabel, relativePath: null }];

  let currentPath = '';
  segments.forEach((segment) => {
    currentPath = currentPath ? `${currentPath}/${segment}` : segment;
    breadcrumbs.push({ label: segment, relativePath: currentPath });
  });

  return breadcrumbs;
};

const getFileIconLabel = (entry: WorkspaceEntry): string => {
  if (entry.type === 'directory') {
    return 'DIR';
  }

  const extension = (entry.extension ?? '').replace('.', '').toUpperCase();

  if (!extension) {
    return 'FILE';
  }

  return extension.slice(0, 4);
};

export function FileExplorer(props: FileExplorerProps): React.JSX.Element {
  const { locale, browseResult, isLoading, errorMessage, selectedFilePath, onRefresh, onCollapseAll, onOpenDirectory, onOpenFile } = props;
  const [searchQuery, setSearchQuery] = useState('');

  const breadcrumbs = browseResult ? getBreadcrumbs(browseResult) : [];
  const filteredEntries = useMemo(() => {
    if (!browseResult) {
      return [];
    }

    const normalizedQuery = searchQuery.trim().toLowerCase();
    if (!normalizedQuery) {
      return browseResult.entries;
    }

    return browseResult.entries.filter((entry) => {
      return entry.name.toLowerCase().includes(normalizedQuery) || entry.relativePath.toLowerCase().includes(normalizedQuery);
    });
  }, [browseResult, searchQuery]);

  return (
    <section className="workspace-sidebar section-panel inlay-card">
      <div className="section-heading workspace-pane-heading">
        <div>
          <p className="section-label">{locale === 'zh' ? '仓库浏览器' : 'Repository explorer'}</p>
          <h3>{locale === 'zh' ? '浏览文件' : 'Browse files'}</h3>
        </div>
        <button type="button" className="secondary-button secondary-button-compact" onClick={onRefresh}>
          {locale === 'zh' ? '刷新' : 'Refresh'}
        </button>
      </div>

      <div className="explorer-toolbar">
        <label className="field">
          <span>{locale === 'zh' ? '搜索文件' : 'Search files'}</span>
          <input
            value={searchQuery}
            placeholder={locale === 'zh' ? '搜索当前目录' : 'Search the current folder'}
            onChange={(event) => {
              setSearchQuery(event.target.value);
            }}
          />
        </label>

        <button type="button" className="secondary-button secondary-button-compact" onClick={onCollapseAll}>
          {locale === 'zh' ? '全部折叠' : 'Collapse all'}
        </button>
      </div>

      {browseResult ? (
        <div className="breadcrumb-row" aria-label={locale === 'zh' ? '当前目录' : 'Current folder'}>
          {breadcrumbs.map((item, index) => (
            <button
              key={`${item.label}-${item.relativePath ?? 'root'}`}
              type="button"
              className="breadcrumb-button"
              onClick={() => {
                onOpenDirectory(item.relativePath);
              }}
            >
              <span>{item.label}</span>
              {index < breadcrumbs.length - 1 ? <span className="breadcrumb-separator">/</span> : null}
            </button>
          ))}
        </div>
      ) : null}

      {browseResult && browseResult.parentPath !== null ? (
        <button
          type="button"
          className="secondary-button secondary-button-compact"
          onClick={() => {
            onOpenDirectory(browseResult.parentPath);
          }}
        >
          {locale === 'zh' ? '返回上一级' : 'Up one level'}
        </button>
      ) : null}

      {errorMessage ? <div className="status-banner status-error"><p>{errorMessage}</p></div> : null}

      {isLoading ? <p className="empty-state">{locale === 'zh' ? '仓库视图加载中...' : 'Loading repository view...'}</p> : null}

      {!isLoading && browseResult && filteredEntries.length === 0 ? (
        <p className="empty-state">{locale === 'zh' ? '当前目录中没有匹配搜索条件的文件。' : 'No files in this folder match the current search.'}</p>
      ) : null}

      {!isLoading && filteredEntries.length > 0 ? (
        <div className="explorer-list" role="tree">
          {filteredEntries.map((entry) => {
            const isDirectory = entry.type === 'directory';
            const isSelected = !isDirectory && selectedFilePath === entry.relativePath;

            return (
              <button
                key={entry.relativePath}
                type="button"
                className={`explorer-row ${isSelected ? 'is-selected' : ''}`}
                role="treeitem"
                onClick={() => {
                  if (isDirectory) {
                    onOpenDirectory(entry.relativePath);
                    return;
                  }

                  onOpenFile(entry);
                }}
              >
                <span className={`explorer-icon ${isDirectory ? 'is-directory' : 'is-file'}`}>{getFileIconLabel(entry)}</span>
                <span className="explorer-copy">
                  <strong>{entry.name}</strong>
                  <span className="mini-meta">{entry.relativePath}</span>
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
