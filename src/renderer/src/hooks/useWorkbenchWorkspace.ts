import { useCallback, useEffect, useMemo, useState } from 'react';
import type { BrowseWorkspaceResult, Locale, ReadWorkspaceFileResult, WorkspaceEntry } from '../../../shared/domain.js';
import { getWorkspaceLabelFromPath, toErrorMessage } from './workbenchControllerShared.js';

interface UseWorkbenchWorkspaceInput {
  locale: Locale;
  workspaceRoot: string | null;
  onWorkspaceRootChange: (workspaceRoot: string | null) => Promise<void>;
}

interface UseWorkbenchWorkspaceResult {
  workspaceRoot: string | null;
  workspaceLabel: string | null;
  browseResult: BrowseWorkspaceResult | null;
  browseError: string | null;
  isBrowsing: boolean;
  selectedFile: ReadWorkspaceFileResult | null;
  previewError: string | null;
  isPreviewLoading: boolean;
  isApplyingFile: boolean;
  workspaceStatusMessage: string | null;
  selectWorkspaceFolder: () => Promise<void>;
  loadDirectory: (relativePath: string | null) => Promise<void>;
  loadFilePreview: (entry: WorkspaceEntry) => Promise<void>;
  loadFilePreviewByPath: (relativePath: string) => Promise<void>;
  applyToSelectedFile: (content: string) => Promise<void>;
}

export function useWorkbenchWorkspace({ locale, workspaceRoot, onWorkspaceRootChange }: UseWorkbenchWorkspaceInput): UseWorkbenchWorkspaceResult {
  const [browseResult, setBrowseResult] = useState<BrowseWorkspaceResult | null>(null);
  const [browseError, setBrowseError] = useState<string | null>(null);
  const [isBrowsing, setIsBrowsing] = useState(false);
  const [selectedFile, setSelectedFile] = useState<ReadWorkspaceFileResult | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [isApplyingFile, setIsApplyingFile] = useState(false);
  const [workspaceStatusMessage, setWorkspaceStatusMessage] = useState<string | null>(null);

  const workspaceLabel = useMemo(() => getWorkspaceLabelFromPath(workspaceRoot), [workspaceRoot]);

  const loadDirectory = useCallback(
    async (relativePath: string | null): Promise<void> => {
      if (!workspaceRoot) {
        setBrowseResult(null);
        setBrowseError(null);
        setIsBrowsing(false);
        return;
      }

      setIsBrowsing(true);
      setBrowseError(null);

      try {
        const nextBrowseResult = await window.desktopApi.browseWorkspace({ relativePath, workspaceRoot });
        setBrowseResult(nextBrowseResult);
      } catch (error: unknown) {
        setBrowseError(toErrorMessage(error, locale === 'zh' ? '无法加载项目视图。' : 'Unable to load the project view.'));
      } finally {
        setIsBrowsing(false);
      }
    },
    [locale, workspaceRoot],
  );

  const loadFilePreviewByPath = useCallback(
    async (relativePath: string): Promise<void> => {
      if (!workspaceRoot) {
        return;
      }

      setIsPreviewLoading(true);
      setPreviewError(null);

      try {
        const nextFile = await window.desktopApi.readWorkspaceFile({ relativePath, workspaceRoot });
        setSelectedFile(nextFile);
        setWorkspaceStatusMessage(locale === 'zh' ? `已载入 ${nextFile.relativePath}` : `Loaded ${nextFile.relativePath}`);
      } catch (error: unknown) {
        setPreviewError(toErrorMessage(error, locale === 'zh' ? '无法预览选中的文件。' : 'Unable to preview the selected file.'));
      } finally {
        setIsPreviewLoading(false);
      }
    },
    [locale, workspaceRoot],
  );

  const loadFilePreview = useCallback(
    async (entry: WorkspaceEntry): Promise<void> => {
      await loadFilePreviewByPath(entry.relativePath);
    },
    [loadFilePreviewByPath],
  );

  const selectWorkspaceFolder = useCallback(async (): Promise<void> => {
    const selection = await window.desktopApi.selectWorkspaceFolder();
    if (!selection.wasChanged || !selection.workspaceRoot) {
      return;
    }

    setSelectedFile(null);
    setPreviewError(null);
    setWorkspaceStatusMessage(
      locale === 'zh'
        ? `当前项目已切换到 ${selection.rootLabel ?? selection.workspaceRoot}`
        : `Switched project to ${selection.rootLabel ?? selection.workspaceRoot}`,
    );
    await onWorkspaceRootChange(selection.workspaceRoot);
  }, [locale, onWorkspaceRootChange]);

  const applyToSelectedFile = useCallback(
    async (content: string): Promise<void> => {
      if (!workspaceRoot || !selectedFile) {
        return;
      }

      setIsApplyingFile(true);
      setPreviewError(null);

      try {
        await window.desktopApi.applyWorkspaceFile({
          relativePath: selectedFile.relativePath,
          content,
          workspaceRoot,
          createIfMissing: false,
        });
        const refreshedFile = await window.desktopApi.readWorkspaceFile({ relativePath: selectedFile.relativePath, workspaceRoot });
        setSelectedFile(refreshedFile);
        setWorkspaceStatusMessage(
          locale === 'zh'
            ? `已将代码块应用到 ${selectedFile.relativePath}`
            : `Applied code block to ${selectedFile.relativePath}`,
        );
      } catch (error: unknown) {
        setPreviewError(toErrorMessage(error, locale === 'zh' ? '无法将代码块写入当前文件。' : 'Unable to apply the code block to the current file.'));
      } finally {
        setIsApplyingFile(false);
      }
    },
    [locale, selectedFile, workspaceRoot],
  );

  useEffect(() => {
    if (!workspaceRoot) {
      setBrowseResult(null);
      setSelectedFile(null);
      setPreviewError(null);
      setBrowseError(null);
      setWorkspaceStatusMessage(null);
      setIsBrowsing(false);
      return;
    }

    void loadDirectory(null);
  }, [loadDirectory, workspaceRoot]);

  return {
    workspaceRoot,
    workspaceLabel,
    browseResult,
    browseError,
    isBrowsing,
    selectedFile,
    previewError,
    isPreviewLoading,
    isApplyingFile,
    workspaceStatusMessage,
    selectWorkspaceFolder,
    loadDirectory,
    loadFilePreview,
    loadFilePreviewByPath,
    applyToSelectedFile,
  };
}
