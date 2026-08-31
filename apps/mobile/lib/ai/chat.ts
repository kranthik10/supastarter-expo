import { config } from '../config';

export type ChatRole = 'system' | 'user' | 'assistant';

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

type StreamOptions = {
  apiKey?: string;
  model?: string;
  signal?: AbortSignal;
};

/**
 * Streams a chat completion token by token.
 *
 * Set EXPO_PUBLIC_AI_API_KEY to use an OpenAI-compatible endpoint
 * (OpenAI, Groq, OpenRouter, Ollama, …). Without a key it falls back to
 * a local mock provider so the UI works fully offline.
 */
export async function* streamChat(
  messages: ChatMessage[],
  options: StreamOptions = {}
): AsyncGenerator<string> {
  const { apiKey, model = config.aiModel, signal } = options;

  if (!apiKey) {
    yield* mockStream(messages, signal);
    return;
  }

  const res = await fetch(`${config.apiUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, messages, stream: true }),
    signal,
  });

  if (!res.ok || !res.body) throw new Error(`AI request failed (${res.status})`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === '[DONE]') return;
      try {
        const json = JSON.parse(payload) as {
          choices?: { delta?: { content?: string } }[];
        };
        const token = json.choices?.[0]?.delta?.content;
        if (token) yield token;
      } catch {}
    }
  }
}

async function* mockStream(messages: ChatMessage[], signal?: AbortSignal): AsyncGenerator<string> {
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  const reply =
    `This is the offline mock assistant. You said: "${lastUser?.content ?? '…'}". ` +
    `Set EXPO_PUBLIC_AI_API_KEY in .env to stream real completions.`;
  const tokens = reply.match(/\S+\s*/g) ?? [];
  for (const token of tokens) {
    if (signal?.aborted) return;
    await new Promise((r) => setTimeout(r, 40));
    yield token;
  }
}
