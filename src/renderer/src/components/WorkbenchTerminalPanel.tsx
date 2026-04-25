import { useMemo, useState } from 'react';
import type { Locale, RunSession } from '../../../shared/domain.js';
import { RUN_STATUS_LABELS } from '../copy.js';
import { collectRunOutputText } from '../workbench.js';

interface WorkbenchTerminalPanelProps {
  locale: Locale;
  runs: RunSession[];
  onClose: () => void;
  onCancelRun: (runId: string) => void;
}

const isMutableRun = (run: RunSession): boolean => run.status === 'pending' || run.status === 'running';

const formatRunLabel = (run: RunSession): string => {
  const modelLabel = run.model ? ` · ${run.model}` : '';
  return `${run.adapterId}${modelLabel}`;
};

const getTerminalOutput = (run: RunSession): string => {
  const output = collectRunOutputText(run).trim();
  if (output) {
    return output;
  }

  return run.commandPreview;
};

export function WorkbenchTerminalPanel({ locale, runs, onClose, onCancelRun }: WorkbenchTerminalPanelProps): React.JSX.Element {
  const [selectedRunId, setSelectedRunId] = useState('');
  const selectedRun = useMemo(() => {
    return runs.find((run) => run.id === selectedRunId) ?? runs.find(isMutableRun) ?? runs[0] ?? null;
  }, [runs, selectedRunId]);
  const outputText = selectedRun ? getTerminalOutput(selectedRun) : '';

  return (
    <section className="section-panel inlay-card workbench-terminal-panel" aria-label={locale === 'zh' ? '终端' : 'Terminal'}>
      <div className="workbench-terminal-topline">
        <div>
          <p className="section-label">{locale === 'zh' ? '终端' : 'Terminal'}</p>
          <h3>{selectedRun ? formatRunLabel(selectedRun) : locale === 'zh' ? '当前线程暂无运行' : 'No runs in this thread'}</h3>
        </div>

        <div className="workbench-terminal-actions">
          {runs.length > 0 ? (
            <label className="composer-control-chip terminal-run-picker">
              <span className="sr-only">{locale === 'zh' ? '选择运行' : 'Select run'}</span>
              <select value={selectedRun?.id ?? ''} onChange={(event) => { setSelectedRunId(event.target.value); }}>
                {runs.map((run) => (
                  <option key={run.id} value={run.id}>{formatRunLabel(run)}</option>
                ))}
              </select>
            </label>
          ) : null}

          {selectedRun ? <span className="status-pill">{RUN_STATUS_LABELS[locale][selectedRun.status]}</span> : null}

          {selectedRun && isMutableRun(selectedRun) ? (
            <button type="button" className="secondary-button secondary-button-compact" onClick={() => { onCancelRun(selectedRun.id); }}>
              {locale === 'zh' ? '取消' : 'Cancel'}
            </button>
          ) : null}

          <button type="button" className="secondary-button secondary-button-compact" onClick={onClose}>
            {locale === 'zh' ? '关闭' : 'Close'}
          </button>
        </div>
      </div>

      <pre className="workbench-terminal-output"><code>{outputText || (locale === 'zh' ? '运行输出会显示在这里。' : 'Run output will appear here.')}</code></pre>
    </section>
  );
}
