import type { Locale } from '../../shared/domain.js';

export const localizeProviderRuntimeMessage = (message: string, locale: Locale): string => {
  if (locale !== 'zh') {
    return message;
  }

  const connectedMatch = message.match(/^Connected\.\s+(\d+) model entries returned\.$/i);
  if (connectedMatch) {
    return `连接成功。返回了 ${connectedMatch[1]} 个模型条目。`;
  }

  const mappings: Array<[RegExp, string]> = [
    [/^API key is required\.$/i, '需要填写 API 密钥。'],
    [/^Base URL is required\.$/i, '需要填写服务地址。'],
    [/^Model is required\.$/i, '需要填写模型。'],
    [/^Unable to reach the provider\.$/i, '无法连接当前模型服务。'],
    [/^The provider returned an unexpected response shape\.$/i, '模型服务返回的数据格式无法识别。'],
    [/^No response choices were returned by the provider\.$/i, '模型服务没有返回可用的回答。'],
    [/^The provider returned an empty message payload\.$/i, '模型服务返回了空消息。'],
    [/^The provider returned no readable assistant text\.$/i, '模型服务没有返回可读取的助手内容。'],
    [/^Anthropic returned no readable assistant text\.$/i, 'Anthropic 没有返回可读取的助手内容。'],
    [/^Gemini returned no candidates\.$/i, 'Gemini 没有返回可用候选结果。'],
    [/^Gemini returned an empty candidate payload\.$/i, 'Gemini 返回了空候选结果。'],
    [/^Gemini returned no readable assistant text\.$/i, 'Gemini 没有返回可读取的助手内容。'],
  ];

  for (const [pattern, replacement] of mappings) {
    if (pattern.test(message)) {
      return replacement;
    }
  }

  return message;
};
