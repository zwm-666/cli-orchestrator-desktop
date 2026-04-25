import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { DEFAULT_ROUTING_SETTINGS } from '../../shared/domain.js';
import { CliAgentRouterService } from './cliAgentRouterService.js';
import { LocalToolRegistryService } from './localToolRegistryService.js';

const createRootDir = (name: string): string => {
  const rootDir = path.resolve('tmp', name);
  rmSync(rootDir, { recursive: true, force: true });
  mkdirSync(rootDir, { recursive: true });
  return rootDir;
};

const writeAdaptersConfig = (rootDir: string): void => {
  mkdirSync(path.resolve(rootDir, 'config'), { recursive: true });
  writeFileSync(
    path.resolve(rootDir, 'config', 'adapters.json'),
    `${JSON.stringify([
      {
        id: 'fake-adapter',
        displayName: 'Fake Adapter',
        command: 'fake-local-tool',
        capabilities: ['verification'],
      },
    ])}\n`,
    'utf8',
  );
};

const writeFakeTool = (rootDir: string): string => {
  const binDir = path.resolve(rootDir, 'bin');
  mkdirSync(binDir, { recursive: true });
  if (process.platform === 'win32') {
    writeFileSync(path.resolve(binDir, 'fake-local-tool.cmd'), '@echo off\r\necho fake-local-tool:%1\r\n', 'utf8');
    return binDir;
  }

  const executablePath = path.resolve(binDir, 'fake-local-tool');
  writeFileSync(executablePath, '#!/bin/sh\necho fake-local-tool:$1\n', 'utf8');
  chmodSync(executablePath, 0o755);
  return binDir;
};

const writeNamedTool = (binDir: string, name: string): void => {
  if (process.platform === 'win32') {
    writeFileSync(path.resolve(binDir, `${name}.cmd`), `@echo off\r\necho ${name}:%*\r\n`, 'utf8');
    return;
  }

  const executablePath = path.resolve(binDir, name);
  writeFileSync(executablePath, `#!/bin/sh\necho ${name}:$*\n`, 'utf8');
  chmodSync(executablePath, 0o755);
};

void test('LocalToolRegistryService scans PATH and calls registered tools', async () => {
  const rootDir = createRootDir('local-tool-registry-service');
  const previousPath = process.env.PATH;
  const previousPathExt = process.env.PATHEXT;

  try {
    writeAdaptersConfig(rootDir);
    const binDir = writeFakeTool(rootDir);
    process.env.PATH = [binDir, previousPath ?? ''].filter((entry) => entry.length > 0).join(path.delimiter);
    process.env.PATHEXT = '.COM;.EXE;.BAT;.CMD';

    const service = new LocalToolRegistryService(rootDir);
    const registry = await service.refreshRegistry();

    assert.ok(registry.tools.some((tool) => tool.name === 'fake-local-tool' && (tool.source === 'windows_path' || tool.source === 'posix_path')));
    assert.ok(registry.tools.some((tool) => tool.name === 'fake-adapter' && tool.source === 'adapter_config'));
    assert.ok(registry.tools.some((tool) => tool.name === 'node' && tool.source === 'node_runtime'));

    const result = await service.callLocalTool({ toolName: 'fake-local-tool', args: ['hello'], timeoutMs: 5000 });
    assert.equal(result.success, true);
    assert.equal(result.error, null);
    assert.match(result.result?.stdout ?? '', /fake-local-tool:hello/u);
    assert.equal(result.logEntry.success, true);

    await assert.rejects(
      service.callLocalTool({ toolName: 'fake-local-tool', cwd: path.resolve(rootDir, '..'), timeoutMs: 5000 }),
      /cwd must stay inside/u,
    );
  } finally {
    process.env.PATH = previousPath;
    process.env.PATHEXT = previousPathExt;
  }
});

void test('LocalToolRegistryService scans configured custom discovery roots', async () => {
  const rootDir = createRootDir('local-tool-registry-custom-root');
  const customRoot = path.resolve(rootDir, 'ai-models');
  mkdirSync(customRoot, { recursive: true });
  writeNamedTool(customRoot, 'custom-ai');
  writeAdaptersConfig(rootDir);

  const service = new LocalToolRegistryService(rootDir);
  const registry = await service.refreshRegistry({
    ...DEFAULT_ROUTING_SETTINGS,
    discoveryRoots: [customRoot],
    customAdapters: [
      {
        id: 'custom-ai-adapter',
        displayName: 'Custom AI Adapter',
        command: 'custom-ai',
        args: ['{{prompt}}'],
        promptTransport: 'arg',
        description: 'Custom adapter discovered from configured root.',
        capabilities: ['local execution'],
        defaultTimeoutMs: null,
        defaultModel: '',
        supportedModels: [],
        enabled: true,
      },
    ],
  });

  assert.ok(registry.scanRoots.includes(customRoot));
  assert.ok(registry.tools.some((tool) => tool.name === 'custom-ai' && tool.source === 'custom_root'));
  assert.ok(registry.tools.some((tool) => tool.name === 'custom-ai-adapter' && tool.source === 'custom_adapter'));
});

void test('CliAgentRouterService routes tasks by task type and complexity', async () => {
  const rootDir = createRootDir('cli-agent-router-service');
  const previousPath = process.env.PATH;
  const previousPathExt = process.env.PATHEXT;
  const binDir = path.resolve(rootDir, 'bin');
  mkdirSync(binDir, { recursive: true });
  writeNamedTool(binDir, 'codex');
  const localTools = new LocalToolRegistryService(rootDir);
  const router = new CliAgentRouterService(rootDir, localTools);

  try {
    process.env.PATH = [binDir, previousPath ?? ''].filter((entry) => entry.length > 0).join(path.delimiter);
    process.env.PATHEXT = '.COM;.EXE;.BAT;.CMD';

    assert.equal(router.decideRoute('hi').route, 'self');
    assert.equal(router.decideRoute('Research the official docs for this library and compare examples.').route, 'claude');
    assert.equal(router.decideRoute('Implement the TypeScript fix and run tests.', { taskType: 'code' }).route, 'codex');

    const result = await router.callCliAgent({ agent: 'codex', prompt: 'Plan a small change.', context: { taskType: 'planning', timeoutMs: 5000 } });
    assert.equal(result.success, true);
    assert.equal(result.decision.route, 'codex');
    assert.match(result.decision.reason, /Explicit codex invocation requested/u);
    assert.equal(result.logEntry.toolName, 'codex');
  } finally {
    process.env.PATH = previousPath;
    process.env.PATHEXT = previousPathExt;
  }
});
