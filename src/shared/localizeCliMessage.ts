import type { Locale } from './domain.js';

const OPEN_CODE_BLOCKED_LAUNCH_MESSAGE =
  'Adapter OpenCode CLI cannot launch because the local OpenCode session context is currently blocked. Resolve the `Session not found` environment issue before retrying.';

const OPEN_CODE_BLOCKED_LAUNCH_MESSAGE_ZH =
  'OpenCode CLI 当前无法启动，因为本地 OpenCode 会话上下文已被阻塞。请先解决“会话未找到”的环境问题后再重试。';

const OPEN_CODE_SESSION_NOT_FOUND_MESSAGE = 'Process exited with code 1. Error: Session not found';

const OPEN_CODE_SESSION_NOT_FOUND_MESSAGE_ZH = '进程已退出，退出码 1。错误：会话未找到。';

const ADAPTER_REASON_PATTERNS: Array<[RegExp, string]> = [
  [/^"(.+)" was not found in PATH\. Ensure it is installed globally \(e\.g\. npm install -g (.+)\)\.$/i, '未在 PATH 中找到“$1”。请确认它已正确安装，并且当前终端环境可以直接调用。'],
  [/^Found "(.+)" in PATH\.$/i, '已在 PATH 中找到“$1”。'],
  [/^Found "(.+)" in PATH\. Current Windows non-interactive runs may still depend on terminal\/TTY behavior even when auth is valid\.$/i, '已在 PATH 中找到“$1”。即使认证有效，当前 Windows 环境下的非交互运行仍可能依赖终端或 TTY 行为。'],
  [/^Found "(.+)" in PATH\. Non-interactive JSON mode is available and currently the most reliable integration path\.$/i, '已在 PATH 中找到“$1”。当前最稳定的集成方式仍是非交互 JSON 模式。'],
  [/^Found "(.+)" in PATH\. Non-interactive run mode may still depend on local session\/server state in this environment\.$/i, '已在 PATH 中找到“$1”。但当前环境下的非交互运行仍可能依赖本地会话或服务状态。'],
  [/^"(.+)" is available, but the configured command inside WSL could not be verified\. Check the distro\/tool installation and any custom command override\.$/i, '已找到“$1”，但无法验证 WSL 内部配置的命令。请检查发行版、工具安装状态和自定义命令覆盖。'],
  [/^Manual handoff adapter is always available for copy\/paste workflows\.$/i, '手动交接类工具始终可用，可直接用于复制粘贴式工作流。'],
  [/^Discovery not required \(internal adapter\)\.$/i, '此工具无需额外检测（内部适配器）。'],
  [/^Process completed successfully\.$/i, '进程已成功完成。'],
];

export const localizeCliMessage = (message: string, locale: Locale): string => {
  if (locale !== 'zh') {
    return message;
  }

  if (message === OPEN_CODE_BLOCKED_LAUNCH_MESSAGE) {
    return OPEN_CODE_BLOCKED_LAUNCH_MESSAGE_ZH;
  }

  if (message === OPEN_CODE_SESSION_NOT_FOUND_MESSAGE) {
    return OPEN_CODE_SESSION_NOT_FOUND_MESSAGE_ZH;
  }

  for (const [pattern, replacement] of ADAPTER_REASON_PATTERNS) {
    if (pattern.test(message)) {
      return message.replace(pattern, replacement);
    }
  }

  return message;
};
