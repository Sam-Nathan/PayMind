// Provider-agnostic LLM interface. Messages use the OpenAI chat format because Groq and xAI
// speak it natively; other adapters translate.

export type JsonSchema = Record<string, unknown>;

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ImageInput {
  mimeType: string;
  /** Raw base64 (no data: prefix). */
  base64: string;
}

export interface ToolDef {
  name: string;
  description: string;
  /** JSON schema of the arguments object. */
  parameters: JsonSchema;
}

export interface ChatJsonOptions {
  system: string;
  messages: ChatMessage[];
  /** Attached to the last user message. Selects the vision model by default. */
  images?: ImageInput[];
  schemaName: string;
  jsonSchema: JsonSchema;
  model?: string;
  maxTokens?: number;
}

export interface ChatToolsOptions {
  system: string;
  messages: ChatMessage[];
  tools: ToolDef[];
  model?: string;
  maxTokens?: number;
}

export interface ChatToolsResult {
  /** The assistant message to append to the transcript (contains tool_calls when present). */
  message: ChatMessage;
  text: string | null;
  toolCalls: { id: string; name: string; arguments: unknown }[];
}

export interface LlmProvider {
  readonly name: string;
  readonly models: { text: string; vision: string };
  /** Returns the parsed JSON object the model produced. Callers validate it with zod. */
  chatJson(opts: ChatJsonOptions): Promise<unknown>;
  chatTools(opts: ChatToolsOptions): Promise<ChatToolsResult>;
}

export class LlmError extends Error {
  constructor(
    message: string,
    readonly status: number | null = null,
    readonly retryable = false,
  ) {
    super(message);
    this.name = 'LlmError';
  }
}
