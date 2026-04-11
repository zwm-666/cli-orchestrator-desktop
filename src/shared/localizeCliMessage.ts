import type { Locale } from './domain.js';

const OPEN_CODE_BLOCKED_LAUNCH_MESSAGE =
  'Adapter OpenCode CLI cannot launch because the local OpenCode session context is currently blocked. Resolve the `Session not found` environment issue before retrying.';

const OPEN_CODE_BLOCKED_LAUNCH_MESSAGE_ZH =
  'OpenCode CLI 当前无法启动，因为本地 OpenCode 会话上下文已被阻塞。请先解决“会话未找到”的环境问题后再重试。';

const OPEN_CODE_SESSION_NOT_FOUND_MESSAGE = 'Process exited with code 1. Error: Session not found';

const OPEN_CODE_SESSION_NOT_FOUND_MESSAGE_ZH = '进程已退出，退出码 1。错误：会话未找到。';

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

  return message;
};
