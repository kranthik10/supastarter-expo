export type ChatRole = 'system' | 'user' | 'assistant';

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

type StreamOptions = {
  signal?: AbortSignal;
};

/**
 * Streams the local assistant fallback token by token.
 *
 * Real completions must be provided through a server-side provider so provider
 * credentials never enter the mobile bundle.
 */
export async function* streamChat(messages: ChatMessage[], options: StreamOptions = {}): AsyncGenerator<string> {
  yield* mockStream(messages, options.signal);
}

async function* mockStream(messages: ChatMessage[], signal?: AbortSignal): AsyncGenerator<string> {
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  const reply =
    `This is the offline mock assistant. You said: "${lastUser?.content ?? '…'}". ` +
    `Configure a server-side assistant provider for real completions.`;
  const tokens = reply.match(/\S+\s*/g) ?? [];
  for (const token of tokens) {
    if (signal?.aborted) return;
    await new Promise((r) => setTimeout(r, 40));
    yield token;
  }
}
