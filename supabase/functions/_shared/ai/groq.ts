import { OpenAICompatProvider } from './openai_compat.ts';

// Model ids checked 2026-09-30 against GroqDocs: llama-3.3-70b-versatile and
// llama-4-scout were shut down in Jul/Aug 2026, qwen3.6-27b on 14 Sep 2026.
export const GROQ_DEFAULT_TEXT_MODEL = 'openai/gpt-oss-120b';
export const GROQ_DEFAULT_VISION_MODEL = 'qwen/qwen3.8-27b';

export function createGroqProvider(env: (k: string) => string | undefined) {
  return new OpenAICompatProvider({
    name: 'groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    apiKey: env('GROQ_API_KEY'),
    models: {
      text: env('AI_MODEL_TEXT') ?? GROQ_DEFAULT_TEXT_MODEL,
      vision: env('AI_MODEL_VISION') ?? GROQ_DEFAULT_VISION_MODEL,
    },
    // gpt-oss supports json_schema; the Qwen vision model is used in json_object mode.
    jsonSchemaModelPrefixes: ['openai/gpt-oss'],
  });
}
