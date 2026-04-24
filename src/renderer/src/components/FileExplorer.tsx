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
  onLoadDirectoryEntries: (relativePath: string | null) => Promise<WorkspaceEntry[]>;
  onOpenDirectory: (relativePath: string | null) => void;
  onOpenFile: (entry: WorkspaceEntry) => void;
}

interface BreadcrumbItem {
  label: string;
  relativePath: string | null;
}

interface ContextMenuState {
  entry: WorkspaceEntry;
  x: number;
  y: number;
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

const getFileIconLabel = (entry: WorkspaceEntry, isExpanded: boolean): string => {
  if (entry.type === 'directory') {
    return isExpanded ? '📂' : '📁';
  }

  const extension = (entry.extension ?? '').toLowerCase();
  if (['.ts', '.tsx', '.js', '.jsx', '.json', '.css', '.html', '.md'].includes(extension)) {
    return '🧩';
  }
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'].includes(extension)) {
    return '🖼️';
  }
  if (['.config', '.yaml', '.yml', '.toml'].includes(extension) || entry.name.includes('config')) {
    return '⚙️';
  }

  return '📄';
};

const toAbsoluteWorkspacePath = (workspaceRoot: string, relativePath: string): string => {
  return relativePath ? `${workspaceRoot.replace(/[\\/]+$/u, '')}/${relativePath}` : workspaceRoot;
};

export function FileExplorer(props: FileExplorerProps): React.JSX.Element {
  const { locale, browseResult, isLoading, errorMessage, selectedFilePath, onRefresh, onCollapseAll, onLoadDirectoryEntries, onOpenDirectory, onOpenFile } = props;
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedPaths, setExpandedPaths] = useState(() => new Set<string>());
  const [childrenByPath, setChildrenByPath] = useState<Record<string, WorkspaceEntry[]>>({});
  const [loadingPath, setLoadingPath] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const breadcrumbs = browseResult ? getBreadcrumbs(browseResult) : [];
  const rootEntries = browseResult?.entries ?? [];
  const loadedEntries = useMemo(() => {
    return [...rootEntries, ...Object.values(childrenByPath).flat()];
  }, [childrenByPath, rootEntries]);
  const filteredEntries = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    if (!normalizedQuery) {
      return [];
    }

    return loadedEntries.filter((entry) => {
      return entry.name.toLowerCase().includes(normalizedQuery) || entry.relativePath.toLowerCase().includes(normalizedQuery);
    });
  }, [loadedEntries, searchQuery]);

  const toggleDirectory = async (entry: WorkspaceEntry): Promise<void> => {
    setContextMenu(null);
    if (expandedPaths.has(entry.relativePath)) {
      setExpandedPaths((current) => {
        const nextPaths = new Set(current);
        nextPaths.delete(entry.relativePath);
        return nextPaths;
      });
      return;
    }

    setExpandedPaths((current) => new Set(current).add(entry.relativePath));
    if (childrenByPath[entry.relativePath]) {
      return;
    }

    setLoadingPath(entry.relativePath);
    try {
      const children = await onLoadDirectoryEntries(entry.relativePath);
      setChildrenByPath((current) => ({ ...current, [entry.relativePath]: children }));
    } finally {
      setLoadingPath(null);
    }
  };

  const copyText = async (value: string): Promise<void> => {
    setContextMenu(null);
    await navigator.clipboard.writeText(value);
  };

  const renderEntry = (entry: WorkspaceEntry, depth: number): React.JSX.Element => {
    const isDirectory = entry.type === 'directory';
    const isExpanded = expandedPaths.has(entry.relativePath);
    const isSelected = !isDirectory && selectedFilePath === entry.relativePath;
    const children = childrenByPath[entry.relativePath] ?? [];

    return (
      <div key={entry.relativePath}>
        <button
          type="button"
          className={`explorer-row file-tree-node ${isDirectory ? 'is-directory' : 'is-file'} ${isSelected ? 'is-selected' : ''}`}
          style={{ '--depth': String(depth) } as React.CSSProperties}
          role="treeitem"
          aria-expanded={isDirectory ? isExpanded : undefined}
          onContextMenu={(event) => {
            event.preventDefault();
            setContextMenu({ entry, x: event.clientX, y: event.clientY });
          }}
          onClick={() => {
            if (isDirectory) {
              void toggleDirectory(entry);
              return;
            }

            setContextMenu(null);
            onOpenFile(entry);
          }}
        >
          <span className="file-tree-toggle">{isDirectory ? (isExpanded ? '▾' : '▸') : ''}</span>
          <span className={`explorer-icon ${isDirectory ? 'is-directory' : 'is-file'}`}>{getFileIconLabel(entry, isExpanded)}</span>
          <span className="explorer-copy file-tree-label">
            <strong>{entry.name}</strong>
            {!isDirectory ? <span className="mini-meta">{entry.relativePath}</span> : null}
          </span>
          {loadingPath === entry.relativePath ? <span className="mini-meta">…</span> : null}
        </button>
        {isDirectory && isExpanded ? children.map((child) => renderEntry(child, depth + 1)) : null}
      </div>
    );
  };

  return (
    <section className="workspace-sidebar section-panel inlay-card" onMouseLeave={() => { setContextMenu(null); }}>
      <div className="section-heading workspace-pane-heading">
        <div>
          <p className="section-label">{locale === 'zh' ? '文件树' : 'File tree'}</p>
          <h3>{locale === 'zh' ? '浏览文件' : 'Browse files'}</h3>
        </div>
        <button type="button" className="secondary-button secondary-button-compact" onClick={onRefresh}>
          {locale === 'zh' ? '刷新' : 'Refresh'}
        </button>
      </div>

      <div className="explorer-toolbar">
        <label className="field">
          <span>{locale === 'zh' ? '搜索已加载文件' : 'Search loaded files'}</span>
          <input
            value={searchQuery}
            placeholder={locale === 'zh' ? '输入文件名' : 'Type a file name'}
            onChange={(event) => {
              setSearchQuery(event.target.value);
            }}
          />
        </label>

        <button
          type="button"
          className="secondary-button secondary-button-compact"
          onClick={() => {
            setExpandedPaths(new Set(loadedEntries.filter((entry) => entry.type === 'directory').map((entry) => entry.relativePath)));
          }}
        >
          {locale === 'zh' ? '展开已加载' : 'Expand loaded'}
        </button>
        <button
          type="button"
          className="secondary-button secondary-button-compact"
          onClick={() => {
            setExpandedPaths(new Set());
            onCollapseAll();
          }}
        >
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

      {errorMessage ? <div className="status-banner status-error"><p>{errorMessage}</p></div> : null}
      {isLoading ? <p className="empty-state">{locale === 'zh' ? '仓库视图加载中...' : 'Loading repository view...'}</p> : null}
      {!isLoading && browseResult && searchQuery.trim() && filteredEntries.length === 0 ? (
        <p className="empty-state">{locale === 'zh' ? '已加载文件中没有匹配项。' : 'No loaded files match the current search.'}</p>
      ) : null}

      {!isLoading && browseResult ? (
        <div className="explorer-list" role="tree">
          {searchQuery.trim()
            ? filteredEntries.map((entry) => renderEntry(entry, 0))
            : rootEntries.map((entry) => renderEntry(entry, 0))}
        </div>
      ) : null}

      {contextMenu && browseResult ? (
        <div className="file-context-menu card" style={{ left: contextMenu.x, top: contextMenu.y }}>
          <button
            type="button"
            onClick={() => {
              if (contextMenu.entry.type === 'directory') {
                void toggleDirectory(contextMenu.entry);
                return;
              }

              onOpenFile(contextMenu.entry);
            }}
          >
            {locale === 'zh' ? '打开' : 'Open'}
          </button>
          <button type="button" onClick={() => { void copyText(toAbsoluteWorkspacePath(browseResult.workspaceRoot, contextMenu.entry.relativePath)); }}>
            {locale === 'zh' ? '复制路径' : 'Copy path'}
          </button>
          <button type="button" onClick={() => { void copyText(contextMenu.entry.relativePath); }}>
            {locale === 'zh' ? '复制相对路径' : 'Copy relative path'}
          </button>
        </div>
      ) : null}
    </section>
  );
}
