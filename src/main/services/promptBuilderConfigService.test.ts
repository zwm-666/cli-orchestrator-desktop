import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { PromptBuilderConfigService } from './promptBuilderConfigService.js';

const createRootDir = (name: string): string => {
  const rootDir = path.resolve('tmp', name);
  rmSync(rootDir, { recursive: true, force: true });
  mkdirSync(rootDir, { recursive: true });
  return rootDir;
};

void test('PromptBuilderConfigService loads prompt-builder template files', async () => {
  const rootDir = createRootDir('prompt-builder-load');
  const templateDir = path.resolve(rootDir, 'config', 'prompt-builder');
  const continuityTemplateDir = path.resolve(rootDir, 'config', 'prompt-templates');
  mkdirSync(templateDir, { recursive: true });
  mkdirSync(continuityTemplateDir, { recursive: true });
  writeFileSync(path.resolve(templateDir, 'project-context.md'), '# Project\n', 'utf8');
  writeFileSync(path.resolve(templateDir, 'engineering-rules.md'), '# Rules\n', 'utf8');
  writeFileSync(path.resolve(templateDir, 'output-format.md'), '# Output\n', 'utf8');
  writeFileSync(path.resolve(continuityTemplateDir, 'continuity-handoff-en.md'), '# Handoff EN\n', 'utf8');
  writeFileSync(path.resolve(continuityTemplateDir, 'continuity-handoff-zh.md'), '# 交接 ZH\n', 'utf8');

  const service = new PromptBuilderConfigService(rootDir);
  const config = await service.loadConfig();

  assert.equal(config.projectContext, '# Project\n');
  assert.equal(config.engineeringRules, '# Rules\n');
  assert.equal(config.outputFormat, '# Output\n');
  assert.equal(config.continuityTemplates?.en, '# Handoff EN\n');
  assert.equal(config.continuityTemplates?.zh, '# 交接 ZH\n');
});

void test('PromptBuilderConfigService saves prompt-builder template files', async () => {
  const rootDir = createRootDir('prompt-builder-save');
  const service = new PromptBuilderConfigService(rootDir);

  const config = await service.saveConfig({
    projectContext: '# Context\r\nA\r\n',
    engineeringRules: '# Rules\nB\n',
    outputFormat: '# Output\nC\n',
  });

  assert.equal(config.projectContext, '# Context\nA\n');
  assert.equal(config.engineeringRules, '# Rules\nB\n');
  assert.equal(config.outputFormat, '# Output\nC\n');

  const templateDir = path.resolve(rootDir, 'config', 'prompt-builder');
  assert.equal(readFileSync(path.resolve(templateDir, 'project-context.md'), 'utf8'), '# Context\nA\n');
  assert.equal(readFileSync(path.resolve(templateDir, 'engineering-rules.md'), 'utf8'), '# Rules\nB\n');
  assert.equal(readFileSync(path.resolve(templateDir, 'output-format.md'), 'utf8'), '# Output\nC\n');
});
