import type { AiProviderConfig, AiProviderId } from './aiConfig.js';
import { getProviderDefinition } from './aiConfig.js';

export type ProviderChatRole = 'system' | 'user' | 'assistant';

export interface ProviderChatMessage {
  role: ProviderChatRole;
  content: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

const resolveProviderUrl = (baseUrl: string, relativePath: string): URL => {
  const normalizedBaseUrl = requireConfiguredValue(baseUrl, 'Base URL');
  const parsedUrl = new URL(normalizedBaseUrl);

  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error('Base URL must use http or https.');
  }

  if (parsedUrl.username || parsedUrl.password || parsedUrl.search || parsedUrl.hash) {
    throw new Error('Base URL must not include credentials, query parameters, or fragments.');
  }

  const baseHref = parsedUrl.href.endsWith('/') ? parsedUrl.href : `${parsedUrl.href}/`;
  return new URL(relativePath.replace(/^\/+/, ''), baseHref);
};

const readString = (value: unknown): string | null => {
  return typeof value === 'string' ? value : null;
};

const readArray = (value: unknown): unknown[] => {
  return Array.isArray(value) ? value : [];
};

const requireConfiguredValue = (value: string, label: string): string => {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    throw new Error(`${label} is required.`);
  }

  return trimmedValue;
};

const parseJsonText = (value: string): unknown => {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
};

const extractErrorMessage = (payload: unknown): string | null => {
  if (!isRecord(payload)) {
    return null;
  }

  const directMessage = readString(payload.message);
  if (directMessage) {
    return directMessage;
  }

  const errorValue = payload.error;
  if (!isRecord(errorValue)) {
    return null;
  }

  return readString(errorValue.message) ?? readString(errorValue.code);
};

const getFailureMessage = async (response: Response): Promise<string> => {
  const responseText = await response.text();
  const parsedPayload = parseJsonText(responseText);
  const parsedMessage = extractErrorMessage(parsedPayload);

  if (parsedMessage) {
    return parsedMessage;
  }

  return responseText || `Provider request failed with status ${response.status}.`;
};

const parseOpenAiMessage = (payload: unknown): string => {
  if (!isRecord(payload)) {
    throw new Error('The provider returned an unexpected response shape.');
  }

  const firstChoice = readArray(payload.choices)[0];
  if (!isRecord(firstChoice)) {
    throw new Error('No response choices were returned by the provider.');
  }

  const message = firstChoice.message;
  if (!isRecord(message)) {
    throw new Error('The provider returned an empty message payload.');
  }

  const directContent = readString(message.content);
  if (directContent) {
    return directContent;
  }

  const parts = readArray(message.content)
    .map((entry) => {
      if (!isRecord(entry)) {
        return null;
      }

      return readString(entry.text);
    })
    .filter((entry): entry is string => entry !== null && entry.length > 0);

  if (parts.length === 0) {
    throw new Error('The provider returned no readable assistant text.');
  }

  return parts.join('\n');
};

const parseAnthropicMessage = (payload: unknown): string => {
  if (!isRecord(payload)) {
    throw new Error('The provider returned an unexpected response shape.');
  }

  const contentBlocks = readArray(payload.content)
    .map((entry) => {
      if (!isRecord(entry)) {
        return null;
      }

      return readString(entry.text);
    })
    .filter((entry): entry is string => entry !== null && entry.length > 0);

  if (contentBlocks.length === 0) {
    throw new Error('Anthropic returned no readable assistant text.');
  }

  return contentBlocks.join('\n');
};

const parseGoogleMessage = (payload: unknown): string => {
  if (!isRecord(payload)) {
    throw new Error('The provider returned an unexpected response shape.');
  }

  const firstCandidate = readArray(payload.candidates)[0];
  if (!isRecord(firstCandidate)) {
    throw new Error('Gemini returned no candidates.');
  }

  const candidateContent = firstCandidate.content;
  if (!isRecord(candidateContent)) {
    throw new Error('Gemini returned an empty candidate payload.');
  }

  const parts = readArray(candidateContent.parts)
    .map((entry) => {
      if (!isRecord(entry)) {
        return null;
      }

      return readString(entry.text);
    })
    .filter((entry): entry is string => entry !== null && entry.length > 0);

  if (parts.length === 0) {
    throw new Error('Gemini returned no readable assistant text.');
  }

  return parts.join('\n');
};

const buildGoogleMessages = (messages: ProviderChatMessage[]): Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> => {
  const systemMessage = messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content.trim())
    .filter((message) => message.length > 0)
    .join('\n\n');

  const conversationalMessages = messages.filter((message) => message.role !== 'system');

  if (systemMessage && conversationalMessages.length > 0) {
    const firstMessage = conversationalMessages[0];

    if (firstMessage) {
      conversationalMessages[0] = {
        role: firstMessage.role,
        content: `System context:\n${systemMessage}\n\n${firstMessage.content}`,
      };
    }
  }

  if (systemMessage && conversationalMessages.length === 0) {
    conversationalMessages.push({ role: 'user', content: `System context:\n${systemMessage}` });
  }

  return conversationalMessages.map((message) => ({
    role: message.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: message.content }],
  }));
};

const performJsonRequest = async (
  input: RequestInfo | URL,
  init: RequestInit,
): Promise<unknown> => {
  const response = await fetch(input, init);

  if (!response.ok) {
    throw new Error(await getFailureMessage(response));
  }

  return (await response.json()) as unknown;
};

export async function testProviderConnection(providerId: AiProviderId, config: AiProviderConfig): Promise<string> {
  const apiKey = requireConfiguredValue(config.api_key, 'API key');
  const baseUrl = requireConfiguredValue(config.base_url, 'Base URL');
  const provider = getProviderDefinition(providerId);

  let payload: unknown;

  if (provider.apiStyle === 'gemini') {
    payload = await performJsonRequest(resolveProviderUrl(baseUrl, 'models'), {
      method: 'GET',
      headers: {
        'x-goog-api-key': apiKey,
      },
    });
    const modelCount = readArray(isRecord(payload) ? payload.models : null).length;
    return `Connected. ${modelCount} model entries returned.`;
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  if (provider.apiStyle === 'anthropic') {
    headers['x-api-key'] = apiKey;
    headers['anthropic-version'] = '2023-06-01';
    payload = await performJsonRequest(resolveProviderUrl(baseUrl, 'models'), {
      method: 'GET',
      headers,
    });
  } else {
    headers.Authorization = `Bearer ${apiKey}`;
    payload = await performJsonRequest(resolveProviderUrl(baseUrl, 'models'), {
      method: 'GET',
      headers,
    });
  }

  const modelCount = readArray(isRecord(payload) ? payload.data : null).length;
  return `Connected. ${modelCount} model entries returned.`;
}

export async function sendProviderChat(
  providerId: AiProviderId,
  config: AiProviderConfig,
  model: string,
  messages: ProviderChatMessage[],
): Promise<string> {
  const apiKey = requireConfiguredValue(config.api_key, 'API key');
  const baseUrl = requireConfiguredValue(config.base_url, 'Base URL');
  const resolvedModel = requireConfiguredValue(model, 'Model');
  const provider = getProviderDefinition(providerId);

  if (provider.apiStyle === 'anthropic') {
    const systemMessage = messages
      .filter((message) => message.role === 'system')
      .map((message) => message.content)
      .join('\n\n');

    const payload = await performJsonRequest(resolveProviderUrl(baseUrl, 'messages'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: resolvedModel,
        max_tokens: 1024,
        system: systemMessage || undefined,
        messages: messages
          .filter((message) => message.role !== 'system')
          .map((message) => ({ role: message.role, content: message.content })),
      }),
    });

    return parseAnthropicMessage(payload);
  }

  if (provider.apiStyle === 'gemini') {
    const payload = await performJsonRequest(
      resolveProviderUrl(baseUrl, `models/${encodeURIComponent(resolvedModel)}:generateContent`),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          contents: buildGoogleMessages(messages),
          generationConfig: {
            maxOutputTokens: 1024,
          },
        }),
      },
    );

    return parseGoogleMessage(payload);
  }

  const payload = await performJsonRequest(resolveProviderUrl(baseUrl, 'chat/completions'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: resolvedModel,
      messages: messages.map((message) => ({ role: message.role, content: message.content })),
    }),
  });

  return parseOpenAiMessage(payload);
}
