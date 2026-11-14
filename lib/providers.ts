import { get } from './db';
import { decryptSecret } from './crypto';

/* ------------------------------------------------------------------------- */
/* AI provider abstraction.                                                   */
/* Every request uses the signed-in user's own API key, decrypted on demand.  */
/* ------------------------------------------------------------------------- */

export type ProviderId = 'openai' | 'anthropic' | 'gemini' | 'perplexity' | 'openrouter' | 'custom';

export type ModelInfo = { id: string; label: string; free: boolean; note?: string };

export type ProviderInfo = {
  id: ProviderId;
  name: string;
  blurb: string;
  keyUrl: string;
  keyHint: string;
  freeTier: string;
  baseUrl: string;
  requiresBaseUrl?: boolean;
  supportsImages: boolean;
  supportsTts: boolean;
  models: ModelInfo[];
};

/**
 * Curated starting points. Free/paid status reflects each provider's published
 * tiers at the time of writing; providers change quotas and retire models, so
 * any model id can be typed manually and provider errors are shown verbatim.
 */
export const PROVIDERS: ProviderInfo[] = [
  {
    id: 'openrouter',
    name: 'OpenRouter',
    blurb: 'One key for many models, including a large catalogue of :free models.',
    keyUrl: 'https://openrouter.ai/keys',
    keyHint: 'sk-or-v1-...',
    freeTier: 'Many models suffixed :free cost $0 (rate limited per day). No card required to start.',
    baseUrl: 'https://openrouter.ai/api/v1',
    supportsImages: false,
    supportsTts: false,
    models: [
      { id: 'meta-llama/llama-3.3-70b-instruct:free', label: 'Llama 3.3 70B (free)', free: true },
      { id: 'deepseek/deepseek-chat-v3-0324:free', label: 'DeepSeek V3 (free)', free: true },
      { id: 'qwen/qwen-2.5-72b-instruct:free', label: 'Qwen 2.5 72B (free)', free: true },
      { id: 'google/gemma-3-27b-it:free', label: 'Gemma 3 27B (free)', free: true },
      { id: 'mistralai/mistral-small-3.2-24b-instruct:free', label: 'Mistral Small 3.2 (free)', free: true },
    ],
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    blurb: 'Generous free tier on Flash models, plus image generation on Gemini image models.',
    keyUrl: 'https://aistudio.google.com/app/apikey',
    keyHint: 'AIza...',
    freeTier: 'Gemini API free tier covers Flash text models with daily/minute rate limits. No card required.',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    supportsImages: true,
    supportsTts: false,
    models: [
      { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash (free tier)', free: true },
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (free tier)', free: true },
      { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite (free tier)', free: true },
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro (paid tier)', free: false },
    ],
  },
  {
    id: 'perplexity',
    name: 'Perplexity',
    blurb: 'Live web-grounded search answers - ideal for trend research and fact-led scripts.',
    keyUrl: 'https://www.perplexity.ai/settings/api',
    keyHint: 'pplx-...',
    freeTier: 'Perplexity API is credit based; there is no permanent free API tier (monthly Pro users sometimes receive a small credit).',
    baseUrl: 'https://api.perplexity.ai',
    supportsImages: false,
    supportsTts: false,
    models: [
      { id: 'sonar', label: 'Sonar (web search)', free: false },
      { id: 'sonar-pro', label: 'Sonar Pro', free: false },
    ],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    blurb: 'Strong writing models plus image generation and text-to-speech narration.',
    keyUrl: 'https://platform.openai.com/api-keys',
    keyHint: 'sk-...',
    freeTier: 'OpenAI API is paid per token (no free API tier). Narration and AI images use this key.',
    baseUrl: 'https://api.openai.com/v1',
    supportsImages: true,
    supportsTts: true,
    models: [
      { id: 'gpt-4o-mini', label: 'GPT-4o mini (cheap)', free: false },
      { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini', free: false },
      { id: 'gpt-4o', label: 'GPT-4o', free: false },
    ],
  },
  {
    id: 'anthropic',
    name: 'Anthropic Claude',
    blurb: 'Excellent long-form script structure and editing.',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    keyHint: 'sk-ant-...',
    freeTier: 'Anthropic API is paid per token (no free API tier).',
    baseUrl: 'https://api.anthropic.com/v1',
    supportsImages: false,
    supportsTts: false,
    models: [
      { id: 'claude-3-5-haiku-latest', label: 'Claude 3.5 Haiku (cheap)', free: false },
      { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5', free: false },
    ],
  },
  {
    id: 'custom',
    name: 'Compatible endpoint',
    blurb: 'Any OpenAI-compatible server: Groq, Together, DeepInfra, Ollama, LM Studio, vLLM...',
    keyUrl: 'https://groq.com/',
    keyHint: 'provider key (or "local" for keyless local servers)',
    freeTier: 'Groq, Together and similar providers offer free tiers; local servers (Ollama/LM Studio) are free and unlimited.',
    baseUrl: '',
    requiresBaseUrl: true,
    supportsImages: false,
    supportsTts: true,
    models: [
      { id: 'llama-3.3-70b-versatile', label: 'Groq: Llama 3.3 70B', free: true },
      { id: 'llama-3.1-8b-instant', label: 'Groq: Llama 3.1 8B', free: true },
      { id: 'llama3.2', label: 'Ollama local: llama3.2', free: true },
    ],
  },
];

export function providerInfo(id: string): ProviderInfo | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

export type StoredKey = {
  provider: ProviderId;
  apiKey: string;
  baseUrl: string;
  defaultModel: string | null;
};

export async function getStoredKey(userId: string, provider: ProviderId): Promise<StoredKey | null> {
  const row = await get<{
    secret: string;
    base_url: string | null;
    default_model: string | null;
  }>('SELECT secret, base_url, default_model FROM provider_keys WHERE user_id = ? AND provider = ?', [
    userId,
    provider,
  ]);
  if (!row) return null;
  let apiKey = '';
  try {
    apiKey = decryptSecret(row.secret);
  } catch {
    return null;
  }
  const info = providerInfo(provider);
  return {
    provider,
    apiKey,
    baseUrl: row.base_url || info?.baseUrl || '',
    defaultModel: row.default_model,
  };
}

export async function configuredProviders(userId: string): Promise<ProviderId[]> {
  const rows = await get<{ providers: string }>(
    "SELECT group_concat(provider, ',') AS providers FROM provider_keys WHERE user_id = ?",
    [userId],
  );
  return (rows?.providers || '')
    .split(',')
    .filter(Boolean)
    .filter((p): p is ProviderId => PROVIDERS.some((info) => info.id === p));
}

/** Preferred order when the caller does not pin a provider: free-first. */
const PREFERENCE: ProviderId[] = ['openrouter', 'gemini', 'custom', 'openai', 'anthropic', 'perplexity'];

export async function pickProvider(userId: string, preferred?: ProviderId | 'auto'): Promise<ProviderId | null> {
  const configured = await configuredProviders(userId);
  if (!configured.length) return null;
  if (preferred && preferred !== 'auto' && configured.includes(preferred)) return preferred;
  for (const candidate of PREFERENCE) {
    if (configured.includes(candidate)) return candidate;
  }
  return configured[0];
}

export class ProviderError extends Error {
  status: number;
  provider: string;
  constructor(message: string, provider: string, status = 0) {
    super(message);
    this.provider = provider;
    this.status = status;
  }
}

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export type ChatOptions = {
  userId: string;
  provider?: ProviderId | 'auto';
  model?: string;
  messages: ChatMessage[];
  system?: string;
  temperature?: number;
  maxTokens?: number;
  json?: boolean;
  timeoutMs?: number;
};

export type ChatResult = {
  text: string;
  provider: ProviderId;
  model: string;
  citations?: string[];
  usage?: unknown;
};

async function postJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  provider: string,
  timeoutMs: number,
): Promise<any> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
      cache: 'no-store',
    });
  } catch (error: any) {
    throw new ProviderError(
      `${provider} request failed: ${error?.message || 'network error'}. Check connectivity and the base URL.`,
      provider,
    );
  }
  const text = await response.text();
  let payload: any = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const detail =
      payload?.error?.message ||
      payload?.error?.[0]?.message ||
      payload?.message ||
      text.slice(0, 400) ||
      response.statusText;
    throw new ProviderError(`${provider} (${response.status}): ${detail}`, provider, response.status);
  }
  return payload;
}

export async function chat(options: ChatOptions): Promise<ChatResult> {
  const provider = await pickProvider(options.userId, options.provider);
  if (!provider) {
    throw new ProviderError(
      'No AI provider connected yet. Open Settings -> API Keys and add at least one key (OpenRouter and Gemini both have free tiers).',
      'none',
    );
  }
  const stored = await getStoredKey(options.userId, provider);
  if (!stored) {
    throw new ProviderError(`No saved key for ${provider}. Add one in Settings -> API Keys.`, provider);
  }
  const model = options.model || stored.defaultModel || providerInfo(provider)?.models[0]?.id || '';
  const temperature = options.temperature ?? 0.7;
  const maxTokens = options.maxTokens ?? 2048;
  const timeoutMs = options.timeoutMs ?? 120_000;
  const system = options.system?.trim();

  if (provider === 'anthropic') {
    const body: any = {
      model,
      max_tokens: maxTokens,
      temperature,
      messages: options.messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({ role: m.role, content: m.content })),
    };
    if (system) body.system = system;
    const payload = await postJson(
      `${stored.baseUrl.replace(/\/$/, '')}/messages`,
      { 'x-api-key': stored.apiKey, 'anthropic-version': '2023-06-01' },
      body,
      'Anthropic',
      timeoutMs,
    );
    const text = (payload?.content || [])
      .map((part: any) => (part?.type === 'text' ? part.text : ''))
      .join('')
      .trim();
    return { text, provider, model, usage: payload?.usage };
  }

  if (provider === 'gemini') {
    const body: any = {
      contents: options.messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
      generationConfig: {
        temperature,
        maxOutputTokens: maxTokens,
        ...(options.json ? { responseMimeType: 'application/json' } : {}),
      },
    };
    const sys = [system, ...options.messages.filter((m) => m.role === 'system').map((m) => m.content)]
      .filter(Boolean)
      .join('\n\n');
    if (sys) body.systemInstruction = { parts: [{ text: sys }] };
    const payload = await postJson(
      `${stored.baseUrl.replace(/\/$/, '')}/models/${encodeURIComponent(model)}:generateContent`,
      { 'x-goog-api-key': stored.apiKey },
      body,
      'Gemini',
      timeoutMs,
    );
    const text = (payload?.candidates?.[0]?.content?.parts || [])
      .map((part: any) => part?.text || '')
      .join('')
      .trim();
    if (!text) {
      const blocked = payload?.promptFeedback?.blockReason;
      throw new ProviderError(
        blocked ? `Gemini blocked the request (${blocked}).` : 'Gemini returned an empty response.',
        'Gemini',
      );
    }
    return { text, provider, model, usage: payload?.usageMetadata };
  }

  // OpenAI-compatible: openai, openrouter, perplexity, custom
  const messages: ChatMessage[] = [];
  const sys = [system, ...options.messages.filter((m) => m.role === 'system').map((m) => m.content)]
    .filter(Boolean)
    .join('\n\n');
  if (sys) messages.push({ role: 'system', content: sys });
  messages.push(...options.messages.filter((m) => m.role !== 'system'));

  const body: any = { model, messages, temperature, max_tokens: maxTokens };
  if (options.json && provider !== 'perplexity') body.response_format = { type: 'json_object' };

  const headers: Record<string, string> = { authorization: `Bearer ${stored.apiKey}` };
  if (provider === 'openrouter') {
    headers['HTTP-Referer'] = 'https://tj-ai-content-factory.app';
    headers['X-Title'] = 'TJ AI Content Factory';
  }
  const base = stored.baseUrl.replace(/\/$/, '');
  if (!base) {
    throw new ProviderError('This provider needs a base URL (for example http://localhost:11434/v1).', provider);
  }
  const payload = await postJson(`${base}/chat/completions`, headers, body, providerInfo(provider)?.name || provider, timeoutMs);
  const text: string = (payload?.choices?.[0]?.message?.content ?? '').toString().trim();
  if (!text) throw new ProviderError('The provider returned an empty message.', provider);
  const citations: string[] = Array.isArray(payload?.citations) ? payload.citations : [];
  return { text, provider, model, citations, usage: payload?.usage };
}

/** Strips markdown fences and returns the first JSON object/array in a reply. */
export function parseJsonLoose<T = any>(text: string): T {
  const cleaned = String(text || '')
    .replace(/^\uFEFF/, '')
    .trim();
  const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : cleaned;
  try {
    return JSON.parse(candidate) as T;
  } catch {
    /* fall through */
  }
  const firstBrace = candidate.search(/[[{]/);
  if (firstBrace >= 0) {
    const lastBrace = Math.max(candidate.lastIndexOf('}'), candidate.lastIndexOf(']'));
    if (lastBrace > firstBrace) {
      try {
        return JSON.parse(candidate.slice(firstBrace, lastBrace + 1)) as T;
      } catch {
        /* fall through */
      }
    }
  }
  throw new Error('The model did not return valid JSON. Try again or pick another model.');
}

/* ------------------------------- images ---------------------------------- */

export type ImageRequest = {
  userId: string;
  provider?: ProviderId | 'auto';
  model?: string;
  prompt: string;
  aspect: string;
};

export function imageSizeFor(aspect: string, model = ''): string {
  const openaiNew = /gpt-image/i.test(model);
  if (openaiNew) {
    if (aspect === '16:9') return '1536x1024';
    if (aspect === '1:1') return '1024x1024';
    return '1024x1536';
  }
  if (aspect === '16:9') return '1792x1024';
  if (aspect === '1:1') return '1024x1024';
  return '1024x1792';
}

export async function generateImageAI(
  request: ImageRequest,
): Promise<{ buffer: Buffer; mime: string; provider: ProviderId; model: string }> {
  const provider = (request.provider && request.provider !== 'auto' ? request.provider : 'openai') as ProviderId;
  const stored = await getStoredKey(request.userId, provider);
  if (!stored) {
    throw new ProviderError(
      `No ${provider} key saved. AI images need an OpenAI or Gemini key - or use the free built-in Designer (no key needed).`,
      provider,
    );
  }

  if (provider === 'gemini') {
    const model = request.model || 'gemini-2.5-flash-image';
    const payload = await postJson(
      `${stored.baseUrl.replace(/\/$/, '')}/models/${encodeURIComponent(model)}:generateContent`,
      { 'x-goog-api-key': stored.apiKey },
      {
        contents: [{ role: 'user', parts: [{ text: request.prompt }] }],
        generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
      },
      'Gemini image',
      180_000,
    );
    const parts = payload?.candidates?.[0]?.content?.parts || [];
    for (const part of parts) {
      const data = part?.inlineData?.data || part?.inline_data?.data;
      if (data) {
        return { buffer: Buffer.from(data, 'base64'), mime: part.inlineData?.mimeType || 'image/png', provider, model };
      }
    }
    throw new ProviderError('Gemini returned no image data. Try a different image model id.', 'Gemini image');
  }

  const model = request.model || 'gpt-image-1';
  const size = imageSizeFor(request.aspect, model);
  const body: any = { model, prompt: request.prompt, n: 1, size };
  const payload = await postJson(
    `${stored.baseUrl.replace(/\/$/, '')}/images/generations`,
    { authorization: `Bearer ${stored.apiKey}` },
    body,
    'OpenAI image',
    180_000,
  );
  const item = payload?.data?.[0];
  if (item?.b64_json) {
    return { buffer: Buffer.from(item.b64_json, 'base64'), mime: 'image/png', provider, model };
  }
  if (item?.url) {
    const res = await fetch(item.url, { signal: AbortSignal.timeout(120_000) });
    if (!res.ok) throw new ProviderError('Could not download the generated image.', 'OpenAI image', res.status);
    return {
      buffer: Buffer.from(await res.arrayBuffer()),
      mime: res.headers.get('content-type') || 'image/png',
      provider,
      model,
    };
  }
  throw new ProviderError('The image provider returned no image.', 'OpenAI image');
}

/* --------------------------------- TTS ----------------------------------- */

export const TTS_VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer', 'coral', 'sage'];

export async function synthesizeSpeech(options: {
  userId: string;
  provider?: ProviderId | 'auto';
  model?: string;
  voice?: string;
  text: string;
  speed?: number;
}): Promise<{ buffer: Buffer; mime: string; provider: ProviderId; model: string }> {
  const preferred = options.provider && options.provider !== 'auto' ? options.provider : 'openai';
  const stored = await getStoredKey(options.userId, preferred as ProviderId);
  if (!stored) {
    throw new ProviderError(
      'AI narration needs an OpenAI (or OpenAI-compatible) key with text-to-speech. You can also upload your own voiceover audio.',
      String(preferred),
    );
  }
  const model = options.model || 'gpt-4o-mini-tts';
  const res = await fetch(`${stored.baseUrl.replace(/\/$/, '')}/audio/speech`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${stored.apiKey}` },
    body: JSON.stringify({
      model,
      voice: options.voice || 'alloy',
      input: options.text.slice(0, 4000),
      response_format: 'mp3',
      speed: options.speed ?? 1,
    }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new ProviderError(`Narration failed (${res.status}): ${detail.slice(0, 300)}`, String(preferred), res.status);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  return { buffer, mime: 'audio/mpeg', provider: preferred as ProviderId, model };
}

/* --------------------------- convenience helpers ------------------------- */

export async function hasProvider(userId: string): Promise<boolean> {
  const list = await configuredProviders(userId);
  return list.length > 0;
}

export async function chatJson<T = any>(
  userId: string,
  options: {
    system: string;
    user: string;
    temperature?: number;
    maxTokens?: number;
    provider?: ProviderId | 'auto';
    model?: string;
  },
): Promise<{ data: T; provider: ProviderId; model: string }> {
  const result = await chat({
    userId,
    provider: options.provider,
    model: options.model,
    system: options.system,
    messages: [{ role: 'user', content: options.user }],
    temperature: options.temperature,
    maxTokens: options.maxTokens,
    json: true,
  });
  return { data: parseJsonLoose<T>(result.text), provider: result.provider, model: result.model };
}

export type SavedKeyView = {
  provider: ProviderId;
  name: string;
  hint: string;
  baseUrl: string;
  defaultModel: string | null;
  createdAt: number;
};

export async function listProviderKeys(userId: string): Promise<SavedKeyView[]> {
  const { all } = await import('./db');
  const rows = await all<{
    provider: string;
    secret: string;
    base_url: string | null;
    default_model: string | null;
    created_at: number;
  }>('SELECT provider, secret, base_url, default_model, created_at FROM provider_keys WHERE user_id = ?', [
    userId,
  ]);
  return rows.map((row) => {
    let hint = '••••';
    try {
      const value = decryptSecret(row.secret);
      hint = value.length > 4 ? `••••${value.slice(-4)}` : '••••';
    } catch {
      hint = 'unreadable';
    }
    const info = providerInfo(row.provider);
    return {
      provider: row.provider as ProviderId,
      name: info?.name || row.provider,
      hint,
      baseUrl: row.base_url || info?.baseUrl || '',
      defaultModel: row.default_model,
      createdAt: row.created_at,
    };
  });
}
