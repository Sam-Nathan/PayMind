// CORS + JSON helpers and a handler wrapper that turns thrown HttpErrors into JSON errors.

export const corsHeaders: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
}

/** Wraps a POST handler: CORS preflight, method check, JSON error envelope `{error:{code,message}}`. */
export function serveJson(handler: (req: Request) => Promise<Response>): (req: Request) => Promise<Response> {
  return async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return json({ error: { code: 'method_not_allowed', message: 'Use POST' } }, 405);
    try {
      return await handler(req);
    } catch (e) {
      if (e instanceof HttpError) {
        return json({ error: { code: e.code, message: e.message, details: e.details } }, e.status);
      }
      console.error('unhandled', e);
      return json({ error: { code: 'internal', message: 'Something went wrong' } }, 500);
    }
  };
}

/**
 * Reads a JSON body of at most `maxBytes`. The limit is enforced on the bytes actually streamed,
 * not only on Content-Length (a chunked request has none). Pick a per-function limit.
 */
export async function readJson(req: Request, maxBytes = 64_000): Promise<unknown> {
  const tooLarge = () => new HttpError(413, 'payload_too_large', 'Request body is too large');
  const len = Number(req.headers.get('content-length') ?? 0);
  if (len > maxBytes) throw tooLarge();
  if (!req.body) throw new HttpError(400, 'invalid_json', 'Body must be valid JSON');

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw tooLarge();
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    bytes.set(c, off);
    off += c.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new HttpError(400, 'invalid_json', 'Body must be valid JSON');
  }
}
