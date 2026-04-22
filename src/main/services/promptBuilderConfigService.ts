import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  DEFAULT_PROMPT_BUILDER_CONFIG,
  PROMPT_BUILDER_TEMPLATE_FILES,
  PROMPT_BUILDER_TEMPLATE_ORDER,
  type PromptBuilderConfig,
  type PromptBuilderTemplateKey,
} from '../../shared/promptBuilder.js';

const normalizeTemplateContent = (value: string): string => {
  return value.replace(/\r\n/g, '\n');
};

export class PromptBuilderConfigService {
  private readonly promptBuilderDir: string;
  private readonly promptTemplateDir: string;
  private cachedConfig: PromptBuilderConfig | null = null;

  public constructor(private readonly rootDir: string) {
    this.promptBuilderDir = path.resolve(this.rootDir, 'config', 'prompt-builder');
    this.promptTemplateDir = path.resolve(this.rootDir, 'config', 'prompt-templates');
  }

  public async loadConfig(): Promise<PromptBuilderConfig> {
    if (this.cachedConfig) {
      return structuredClone(this.cachedConfig);
    }

    const entries = await Promise.all(
      PROMPT_BUILDER_TEMPLATE_ORDER.map(async (key) => {
        const content = await this.readTemplateFile(key);
        return [key, content] as const;
      }),
    );

    const [continuityHandoffEn, continuityHandoffZh] = await Promise.all([
      this.readPromptTemplateFile('continuity-handoff-en.md'),
      this.readPromptTemplateFile('continuity-handoff-zh.md'),
    ]);

    this.cachedConfig = {
      ...DEFAULT_PROMPT_BUILDER_CONFIG,
      ...Object.fromEntries(entries),
      continuityTemplates: {
        en: continuityHandoffEn,
        zh: continuityHandoffZh,
      },
    };

    return structuredClone(this.cachedConfig);
  }

  public async saveConfig(config: PromptBuilderConfig): Promise<PromptBuilderConfig> {
    await mkdir(this.promptBuilderDir, { recursive: true });

    await Promise.all(
      PROMPT_BUILDER_TEMPLATE_ORDER.map(async (key) => {
        const filePath = this.getTemplatePath(key);
        await writeFile(filePath, normalizeTemplateContent(config[key]), 'utf8');
      }),
    );

    this.cachedConfig = null;
    return this.loadConfig();
  }

  private async readTemplateFile(key: PromptBuilderTemplateKey): Promise<string> {
    const filePath = this.getTemplatePath(key);

    try {
      const content = await readFile(filePath, 'utf8');
      return normalizeTemplateContent(content);
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return DEFAULT_PROMPT_BUILDER_CONFIG[key];
      }

      throw error;
    }
  }

  private getTemplatePath(key: PromptBuilderTemplateKey): string {
    return path.resolve(this.promptBuilderDir, PROMPT_BUILDER_TEMPLATE_FILES[key]);
  }

  private async readPromptTemplateFile(fileName: string): Promise<string> {
    const filePath = path.resolve(this.promptTemplateDir, fileName);

    try {
      const content = await readFile(filePath, 'utf8');
      return normalizeTemplateContent(content);
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return '';
      }

      throw error;
    }
  }
}
