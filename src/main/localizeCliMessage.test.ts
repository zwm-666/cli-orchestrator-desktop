import assert from 'node:assert/strict';
import test from 'node:test';
import { localizeCliMessage } from '../shared/localizeCliMessage.js';

void test('localizeCliMessage translates the known OpenCode blocked launch error for zh locale', () => {
  const blockedLaunchMessage =
    'Adapter OpenCode CLI cannot launch because the local OpenCode session context is currently blocked. Resolve the `Session not found` environment issue before retrying.';

  assert.equal(
    localizeCliMessage(blockedLaunchMessage, 'zh'),
    'OpenCode CLI 当前无法启动，因为本地 OpenCode 会话上下文已被阻塞。请先解决“会话未找到”的环境问题后再重试。'
  );
  assert.equal(localizeCliMessage(blockedLaunchMessage, 'en'), blockedLaunchMessage);
});

void test('localizeCliMessage translates the known OpenCode readiness reason for zh locale', () => {
  const readinessReason = 'Process exited with code 1. Error: Session not found';

  assert.equal(localizeCliMessage(readinessReason, 'zh'), '进程已退出，退出码 1。错误：会话未找到。');
  assert.equal(localizeCliMessage(readinessReason, 'en'), readinessReason);
});

void test('localizeCliMessage leaves unrelated messages unchanged', () => {
  const originalMessage = 'Something else went wrong.';

  assert.equal(localizeCliMessage(originalMessage, 'zh'), originalMessage);
  assert.equal(localizeCliMessage(originalMessage, 'en'), originalMessage);
});
