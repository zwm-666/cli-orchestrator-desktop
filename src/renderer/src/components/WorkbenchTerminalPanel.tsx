import { useEffect, useRef, useState } from 'react';
import type { Locale, TerminalEvent } from '../../../shared/domain.js';

interface WorkbenchTerminalPanelProps {
  locale: Locale;
  cwd: string | null;
  onClose: () => void;
}

const appendTerminalText = (current: string, event: TerminalEvent): string => {
  const prefix = event.stream === 'stderr' ? '[stderr] ' : '';
  const nextValue = `${current}${prefix}${event.data}`;
  return nextValue.length > 50000 ? nextValue.slice(-50000) : nextValue;
};

export function WorkbenchTerminalPanel({ locale, cwd, onClose }: WorkbenchTerminalPanelProps): React.JSX.Element {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [shellLabel, setShellLabel] = useState('');
  const [terminalCwd, setTerminalCwd] = useState(cwd ?? '');
  const [outputText, setOutputText] = useState('');
  const [commandDraft, setCommandDraft] = useState('');
  const [isStarting, setIsStarting] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const outputRef = useRef<HTMLPreElement>(null);
  const sessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    const unsubscribe = window.desktopApi.onTerminalEvent((event) => {
      if (event.sessionId !== sessionIdRef.current) {
        return;
      }

      setOutputText((current) => appendTerminalText(current, event));
      if (event.kind === 'exit' || event.kind === 'error') {
        setIsRunning(false);
      }
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    outputRef.current?.scrollTo({ top: outputRef.current.scrollHeight });
  }, [outputText]);

  const startTerminal = async (): Promise<void> => {
    if (isStarting || isRunning) {
      return;
    }

    setIsStarting(true);
    try {
      const result = await window.desktopApi.startTerminal({ cwd });
      sessionIdRef.current = result.sessionId;
      setSessionId(result.sessionId);
      setShellLabel(result.shell);
      setTerminalCwd(result.cwd);
      setOutputText((current) => `${current}${locale === 'zh' ? '已启动本机终端' : 'Local terminal started'}: ${result.shell}\n`);
      setIsRunning(true);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : locale === 'zh' ? '启动终端失败。' : 'Failed to start terminal.';
      setOutputText((current) => `${current}${message}\n`);
      setIsRunning(false);
    } finally {
      setIsStarting(false);
    }
  };

  useEffect(() => {
    void startTerminal();
    return () => {
      const activeSessionId = sessionIdRef.current;
      if (activeSessionId) {
        void window.desktopApi.stopTerminal({ sessionId: activeSessionId });
      }
    };
  }, []);

  const stopTerminal = async (): Promise<void> => {
    const activeSessionId = sessionIdRef.current;
    if (!activeSessionId) {
      return;
    }

    await window.desktopApi.stopTerminal({ sessionId: activeSessionId });
    sessionIdRef.current = null;
    setSessionId(null);
    setIsRunning(false);
  };

  const submitCommand = async (): Promise<void> => {
    const command = commandDraft.trimEnd();
    if (!command || !sessionId) {
      return;
    }

    setOutputText((current) => `${current}> ${command}\n`);
    setCommandDraft('');
    await window.desktopApi.writeTerminal({ sessionId, data: `${command}\n` });
  };

  return (
    <section className="section-panel inlay-card workbench-terminal-panel" aria-label={locale === 'zh' ? '终端' : 'Terminal'}>
      <div className="workbench-terminal-topline">
        <div>
          <p className="section-label">{locale === 'zh' ? '本机终端' : 'Local terminal'}</p>
          <h3>{shellLabel || (locale === 'zh' ? '正在启动…' : 'Starting…')}</h3>
          <p className="mini-meta">{terminalCwd || cwd || (locale === 'zh' ? '当前项目目录' : 'Current project directory')}</p>
        </div>

        <div className="workbench-terminal-actions">
          <span className={`status-pill ${isRunning ? 'run-status-running' : ''}`}>{isRunning ? (locale === 'zh' ? '运行中' : 'Running') : locale === 'zh' ? '已停止' : 'Stopped'}</span>
          <button type="button" className="secondary-button secondary-button-compact" disabled={isStarting || isRunning} onClick={() => { void startTerminal(); }}>
            {locale === 'zh' ? '重启' : 'Restart'}
          </button>
          <button type="button" className="secondary-button secondary-button-compact" disabled={!isRunning} onClick={() => { void stopTerminal(); }}>
            {locale === 'zh' ? '停止' : 'Stop'}
          </button>
          <button type="button" className="secondary-button secondary-button-compact" onClick={onClose}>
            {locale === 'zh' ? '关闭' : 'Close'}
          </button>
        </div>
      </div>

      <pre ref={outputRef} className="workbench-terminal-output"><code>{outputText || (locale === 'zh' ? '终端输出会显示在这里。' : 'Terminal output will appear here.')}</code></pre>

      <form className="workbench-terminal-input-row" onSubmit={(event) => { event.preventDefault(); void submitCommand(); }}>
        <span aria-hidden="true">$</span>
        <input
          value={commandDraft}
          disabled={!isRunning || !sessionId}
          placeholder={locale === 'zh' ? '输入命令，按 Enter 执行' : 'Type a command and press Enter'}
          onChange={(event) => { setCommandDraft(event.target.value); }}
        />
        <button type="submit" className="primary-button" disabled={!isRunning || !commandDraft.trim()}>
          {locale === 'zh' ? '运行' : 'Run'}
        </button>
      </form>
    </section>
  );
}
