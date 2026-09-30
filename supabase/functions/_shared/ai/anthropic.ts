import { parseJsonLoose } from './openai_compat.ts';
import {
  LlmError,
  type ChatJsonOptions,
  type ChatToolsOptions,
  type ChatToolsResult,
  type LlmProvider,
} from './types.ts';

// Stub adapter: chatJson works through the Messages API (JSON-only prompting, images
// supported); chatTools is not implemented yet. Set ANTHROPIC_API_KEY + AI_PROVIDER=anthropic
// and AI_MODEL_TEXT / AI_MODEL_VISION (no defaults are guessed).
export function createAnthropicProvider(env: (k: string) => string | undefined): LlmProvider {
  const apiKey = env('ANTHROPIC_API_KEY');
  const text = env('AI_MODEL_TEXT') ?? 'claude-sonnet-4-5';
  const vision = env('AI_MODEL_VISION') ?? text;
  return {
    name: 'anthropic',
    models: { text, vision },
    async chatJson(opts: ChatJsonOptions): Promise<unknown> {
      if (!apiKey) throw new LlmError('anthropic: ANTHROPIC_API_KEY is not configured', 500);
      const messages = opts.messages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({ role: m.role, content: [{ type: 'text', text: m.content ?? '' }] as Record<string, unknown>[] }));
      if (opts.images?.length) {
        const last = [...messages].reverse().find((m) => m.role === 'user') ?? messages[messages.length - 1];
        for (const im of opts.images) {
          last.content.unshift({ type: 'image', source: { type: 'base64', media_type: im.mimeType, data: im.base64 } });
        }
      }
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: opts.model ?? (opts.images?.length ? vision : text),
          max_tokens: opts.maxTokens ?? 4096,
          system: `${opts.system}\n\nReturn ONLY a JSON object matching this JSON schema:\n${JSON.stringify(opts.jsonSchema)}`,
          messages,
        }),
        signal: AbortSignal.timeout(50_000),
      });
      if (!res.ok) throw new LlmError(`anthropic returned ${res.status}`, res.status, res.status >= 500);
      const data = await res.json();
      const out = (data.content ?? []).map((b: { text?: string }) => b.text ?? '').join('');
      return parseJsonLoose(out);
    },
    chatTools(_opts: ChatToolsOptions): Promise<ChatToolsResult> {
      return Promise.reject(new LlmError('anthropic: chatTools is not implemented; use AI_PROVIDER=groq or xai', 501));
    },
  };
}
