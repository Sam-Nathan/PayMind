#!/usr/bin/env node
// Copies packages/core/src/schemas.ts into supabase/functions/_shared/schemas.ts.
// Edge Functions are deployed without access to the rest of the monorepo, so the zod
// schemas are vendored. Run `node scripts/sync-edge-shared.mjs` after editing schemas.ts.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = resolve(root, 'packages/core/src/schemas.ts');
const dst = resolve(root, 'supabase/functions/_shared/schemas.ts');
const header =
  '// GENERATED from packages/core/src/schemas.ts by scripts/sync-edge-shared.mjs - keep in sync, do not edit here.\n';
writeFileSync(
  dst,
  header +
    readFileSync(src, 'utf8')
      .replace("from 'zod'", "from 'npm:zod@4'")
      .replace("'bank_transfer'", "'bank'"), // DB enum payment_via uses 'bank'
);
console.log(`wrote ${dst}`);
