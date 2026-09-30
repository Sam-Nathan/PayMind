import {
  LlmError,
  type ChatJsonOptions,
  type ChatMessage,
  type ChatToolsOptions,
  type ChatToolsResult,
  type LlmProvider,
} from './types.ts';

export interface OpenAICompatConfig {
  name: string;
  baseUrl: string;
  apiKey: string | undefined;
  models: { text: string; vision: string };
  /** Model-id prefixes that accept response_format json_schema. Others use json_object. */
  jsonSchemaModelPrefixes?: string[];
  timeoutMs?: number;
}

/** Strips reasoning tags / code fences and parses the first JSON object in the text. */
export function parseJsonLoose(text: string): unknown {
  let t = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  try {
    return JSON.parse(t);
  } catch {
    const start = t.indexOf('{');
    const end = t.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(t.slice(start, end + 1));
      } catch {
        /* fall through */
      }
    }
    throw new LlmError('Model did not return valid JSON', null, true);
  }
}

export class OpenAICompatProvider implements LlmProvider {
  readonly name: string;
  readonly models: { text: string; vision: string };
  constructor(private readonly cfg: OpenAICompatConfig) {
    this.name = cfg.name;
    this.models = cfg.models;
  }

  private async post(body: Record<string, unknown>): Promise<Record<string, any>> {
    if (!this.cfg.apiKey) {
      throw new LlmError(`${this.cfg.name}: API key is not configured on the server`, 500);
    }
    let res: Response;
    try {
      res = await fetch(`${this.cfg.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${this.cfg.apiKey}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.cfg.timeoutMs ?? 50_000),
      });
    } catch (e) {
      throw new LlmError(`${this.cfg.name}: request failed (${(e as Error).message})`, null, true);
    }
    if (!res.ok) {
      const detail = (await res.text().catch(() => '')).slice(0, 500);
      throw new LlmError(`${this.cfg.name} returned ${res.status}: ${detail}`, res.status, res.status >= 500 || res.status === 429);
    }
    return await res.json();
  }

  private withImages(messages: ChatMessage[], images: ChatJsonOptions['images']): Record<string, unknown>[] {
    if (!images?.length) return messages as unknown as Record<string, unknown>[];
    const out = messages.map((m) => ({ ...m })) as Record<string, any>[];
    let idx = -1;
    for (let i = out.length - 1; i >= 0; i--) {
      if (out[i].role === 'user') {
        idx = i;
        break;
      }
    }
    if (idx < 0) {
      out.push({ role: 'user', content: '' });
      idx = out.length - 1;
    }
    const text = typeof out[idx].content === 'string' ? out[idx].content : '';
    out[idx].content = [
      { type: 'text', text },
      ...images.map((im) => ({
        type: 'image_url',
        image_url: { url: `data:${im.mimeType};base64,${im.base64}` },
      })),
    ];
    return out;
  }

  async chatJson(opts: ChatJsonOptions): Promise<unknown> {
    const model = opts.model ?? (opts.images?.length ? this.models.vision : this.models.text);
    const useSchema = (this.cfg.jsonSchemaModelPrefixes ?? []).some((p) => model.startsWith(p));
    // The schema is always spelled out in the prompt so json_object mode is reliable too.
    const system =
      `${opts.system}\n\nReturn ONLY a JSON object (no prose, no code fences) that matches this JSON schema:\n` +
      JSON.stringify(opts.jsonSchema);
    const messages = this.withImages(opts.messages, opts.images);
    const base = {
      model,
      messages: [{ role: 'system', content: system }, ...messages],
      temperature: 0.1,
      max_tokens: opts.maxTokens ?? 4096,
    };

    const attempt = async (responseFormat: Record<string, unknown>) => {
      const data = await this.post({ ...base, response_format: responseFormat });
      const content = data.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || !content.trim()) {
        throw new LlmError(`${this.cfg.name}: empty response`, null, true);
      }
      return parseJsonLoose(content);
    };

    if (useSchema) {
      try {
        return await attempt({
          type: 'json_schema',
          json_schema: { name: opts.schemaName, schema: opts.jsonSchema, strict: false },
        });
      } catch (e) {
        // Schema mode unsupported / rejected: fall back to plain JSON mode once.
        if (!(e instanceof LlmError) || e.status !== 400) throw e;
      }
    }
    return await attempt({ type: 'json_object' });
  }

  async chatTools(opts: ChatToolsOptions): Promise<ChatToolsResult> {
    const body: Record<string, unknown> = {
      model: opts.model ?? this.models.text,
      messages: [{ role: 'system', content: opts.system }, ...opts.messages],
      temperature: 0.2,
      max_tokens: opts.maxTokens ?? 2048,
    };
    if (opts.tools.length > 0) {
      body.tools = opts.tools.map((t) => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.parameters },
      }));
      body.tool_choice = 'auto';
    }
    const data = await this.post(body);
    const msg = data.choices?.[0]?.message;
    if (!msg) throw new LlmError(`${this.cfg.name}: empty response`, null, true);
    const toolCalls = (msg.tool_calls ?? []).map((c: any) => {
      let args: unknown = {};
      try {
        args = c.function?.arguments ? JSON.parse(c.function.arguments) : {};
      } catch {
        args = { __invalid_json: String(c.function?.arguments ?? '') };
      }
      return { id: String(c.id), name: String(c.function?.name), arguments: args };
    });
    const text = typeof msg.content === 'string' ? msg.content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim() : null;
    const message: ChatMessage = {
      role: 'assistant',
      content: msg.content ?? null,
      ...(msg.tool_calls?.length ? { tool_calls: msg.tool_calls } : {}),
    };
    return { message, text: text || null, toolCalls };
  }
}
