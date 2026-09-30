import { createAnthropicProvider } from './anthropic.ts';
import { createGroqProvider } from './groq.ts';
import { createXaiProvider } from './xai.ts';
import type { LlmProvider } from './types.ts';

export * from './types.ts';
export { parseJsonLoose } from './openai_compat.ts';

const env = (k: string) => Deno.env.get(k) || undefined;

/** Provider chosen by env AI_PROVIDER (groq | xai | anthropic; default groq). */
export function getProvider(): LlmProvider {
  switch ((env('AI_PROVIDER') ?? 'groq').toLowerCase()) {
    case 'xai':
      return createXaiProvider(env);
    case 'anthropic':
      return createAnthropicProvider(env);
    default:
      return createGroqProvider(env);
  }
}
