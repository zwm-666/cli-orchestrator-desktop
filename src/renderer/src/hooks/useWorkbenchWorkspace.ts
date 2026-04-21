import { useCallback, useEffect, useState } from 'react';
import type { BrowseWorkspaceResult, Locale, ReadWorkspaceFileResult, WorkspaceEntry } from '../../../shared/domain.js';
import { toErrorMessage } from './workbenchControllerShared.js';

interface UseWorkbenchWorkspaceInput {
  locale: Locale;
}

interface UseWorkbenchWorkspaceResult {
  browseResult: BrowseWorkspaceResult | null;
  browseError: string | null;
  isBrowsing: boolean;
  selectedFile: ReadWorkspaceFileResult | null;
  previewError: string | null;
  isPreviewLoading: boolean;
  loadDirectory: (relativePath: string | null) => Promise<void>;
  loadFilePreview: (entry: WorkspaceEntry) => Promise<void>;
}

export function useWorkbenchWorkspace({ locale }: UseWorkbenchWorkspaceInput): UseWorkbenchWorkspaceResult {
  const [browseResult, setBrowseResult] = useState<BrowseWorkspaceResult | null>(null);
  const [browseError, setBrowseError] = useState<string | null>(null);
  const [isBrowsing, setIsBrowsing] = useState(true);
  const [selectedFile, setSelectedFile] = useState<ReadWorkspaceFileResult | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);

  const loadDirectory = useCallback(
    async (relativePath: string | null): Promise<void> => {
      setIsBrowsing(true);
      setBrowseError(null);

      try {
        const nextBrowseResult = await window.desktopApi.browseWorkspace({ relativePath });
        setBrowseResult(nextBrowseResult);
      } catch (error: unknown) {
        setBrowseError(toErrorMessage(error, locale === 'zh' ? '无法加载仓库视图。' : 'Unable to load the repository view.'));
      } finally {
        setIsBrowsing(false);
      }
    },
    [locale],
  );

  const loadFilePreview = useCallback(
    async (entry: WorkspaceEntry): Promise<void> => {
      setIsPreviewLoading(true);
      setPreviewError(null);

      try {
        const nextFile = await window.desktopApi.readWorkspaceFile({ relativePath: entry.relativePath });
        setSelectedFile(nextFile);
      } catch (error: unknown) {
        setPreviewError(toErrorMessage(error, locale === 'zh' ? '无法预览选中的文件。' : 'Unable to preview the selected file.'));
      } finally {
        setIsPreviewLoading(false);
      }
    },
    [locale],
  );

  useEffect(() => {
    void loadDirectory(null);
  }, [loadDirectory]);

  return {
    browseResult,
    browseError,
    isBrowsing,
    selectedFile,
    previewError,
    isPreviewLoading,
    loadDirectory,
    loadFilePreview,
  };
}
