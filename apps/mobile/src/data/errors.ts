/**
 * Supabase/Postgres errors from our RPCs are raised as '<code>: detail' (docs/schema.md).
 * The code -> copy mapping is shared with the web app via @paymind/core.
 */
import { errorCodeOf, friendlyError as friendlyDbError } from '@paymind/core';

export { errorCodeOf };

/** Thrown by payload builders with a message that is safe to show as-is. */
export class ValidationError extends Error {
  override name = 'ValidationError';
}

export function friendlyError(err: unknown): string {
  if (err instanceof ValidationError) return err.message;
  return friendlyDbError(err);
}
