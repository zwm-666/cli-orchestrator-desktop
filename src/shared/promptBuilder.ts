export const PROMPT_BUILDER_TEMPLATE_ORDER = ['projectContext', 'engineeringRules', 'outputFormat'] as const;

export type PromptBuilderTemplateKey = (typeof PROMPT_BUILDER_TEMPLATE_ORDER)[number];

export const PROMPT_BUILDER_TEMPLATE_FILES: Record<PromptBuilderTemplateKey, string> = {
  projectContext: 'project-context.md',
  engineeringRules: 'engineering-rules.md',
  outputFormat: 'output-format.md',
};

export interface PromptBuilderConfig {
  projectContext: string;
  engineeringRules: string;
  outputFormat: string;
  continuityTemplates?: {
    en: string;
    zh: string;
  };
}

export interface SavePromptBuilderConfigInput {
  config: PromptBuilderConfig;
}

export const DEFAULT_PROMPT_BUILDER_CONFIG: PromptBuilderConfig = {
  projectContext: '',
  engineeringRules: '',
  outputFormat: '',
  continuityTemplates: {
    en: '',
    zh: '',
  },
};
