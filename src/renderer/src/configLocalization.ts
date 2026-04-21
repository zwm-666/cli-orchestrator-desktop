import type { CliAdapterAvailability, CliAdapterLaunchMode, Locale } from '../../shared/domain.js';

const PROVIDER_DESCRIPTIONS_ZH: Record<string, string> = {
  anthropic: '通过 Anthropic 消息接口访问 Claude。',
  openai: '通过 OpenAI 对话补全接口调用 GPT 模型。',
  groq: '通过 OpenAI 兼容接口使用 Groq 的高速推理。',
  gemini: '通过 Google Gemini 内容生成接口调用模型。',
  deepseek: '通过 OpenAI 兼容端点访问 DeepSeek 托管模型。',
  sambanova: '通过 OpenAI 兼容接口访问 SambaNova 云服务。',
  cerebras: '通过 OpenAI 兼容接口访问 Cerebras 推理服务。',
  huggingface: '通过 Hugging Face 路由接口访问托管模型。',
  custom: '自定义 OpenAI 兼容服务地址和凭据。',
};

const ADAPTER_DESCRIPTIONS_ZH: Record<string, string> = {
  claude: '通过 WSL 中的 Ubuntu-24.04 调用 Claude Code CLI。',
  codex: '使用本机已安装的 Codex CLI 执行本地代码任务。',
  openai: '当本机存在可用安装时，使用 OpenAI CLI。',
  opencode: '使用本机已安装的 OpenCode CLI 执行本地代码工作流。',
  cursor: '为 Cursor 准备手动交接内容，便于把当前工作无缝带入编辑器。',
  vscode: '为 VS Code 准备手动交接内容，便于把当前工作无缝带入编辑器。',
};

export const getProviderDescription = (providerId: string, fallback: string, locale: Locale): string => {
  if (locale === 'zh') {
    return PROVIDER_DESCRIPTIONS_ZH[providerId] ?? fallback;
  }

  return fallback;
};

export const getAdapterDescription = (adapterId: string, fallback: string, locale: Locale): string => {
  if (locale === 'zh') {
    return ADAPTER_DESCRIPTIONS_ZH[adapterId] ?? fallback;
  }

  return fallback;
};

const LAUNCH_MODE_LABELS: Record<Locale, Record<CliAdapterLaunchMode, string>> = {
  en: {
    cli: 'CLI',
    manual_handoff: 'Manual handoff',
  },
  zh: {
    cli: 'CLI',
    manual_handoff: '手动交接',
  },
};

const AVAILABILITY_LABELS: Record<Locale, Record<CliAdapterAvailability, string>> = {
  en: {
    available: 'Available',
    unavailable: 'Unavailable',
  },
  zh: {
    available: '可用',
    unavailable: '未发现',
  },
};

export const getLaunchModeLabel = (launchMode: CliAdapterLaunchMode, locale: Locale): string => {
  return LAUNCH_MODE_LABELS[locale][launchMode];
};

export const getAvailabilityLabel = (availability: CliAdapterAvailability, locale: Locale): string => {
  return AVAILABILITY_LABELS[locale][availability];
};
