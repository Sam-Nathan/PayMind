import { OpenAICompatProvider } from './openai_compat.ts';

// Stub adapter: xAI is OpenAI-compatible. Set XAI_API_KEY, AI_PROVIDER=xai and (optionally)
// AI_MODEL_TEXT / AI_MODEL_VISION. Defaults are placeholders, verify before switching.
export function createXaiProvider(env: (k: string) => string | undefined) {
  return new OpenAICompatProvider({
    name: 'xai',
    baseUrl: 'https://api.x.ai/v1',
    apiKey: env('XAI_API_KEY'),
    models: {
      text: env('AI_MODEL_TEXT') ?? 'grok-4',
      vision: env('AI_MODEL_VISION') ?? 'grok-4',
    },
    jsonSchemaModelPrefixes: ['grok'],
  });
}
