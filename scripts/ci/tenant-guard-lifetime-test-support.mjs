import assert from 'node:assert/strict';
import { byStage, run } from './tenant-guard-test-support.mjs';

// L1 fixtures: each body runs in a changed feature file after HEADER, which opens nothing itself.
// A refused case names the L1 detail it must produce; a safe control must produce no L1 at all.

export const HEADER = [
  "import { withTenantAuthority as W } from '@interdomestik/database/tenant-authority-context';",
  "import * as ns from '@interdomestik/database/tenant-authority-context';",
  "import { authorizeSessionTenant } from '../lib/tenant-authority.server';",
  'let kept: any;',
  'const box: any[] = [];',
  "const a: any = authorizeSessionTenant({ user: { tenantId: 't' } });",
  'async function later(v: any) { await new Promise(r => setTimeout(r, 5)); return v.select(); }',
  'async function delay() { await new Promise(r => setTimeout(r, 5)); }',
];

export const ENTRY = '@interdomestik/database/tenant-authority-context';

/** The L1 details (prefix removed) and other violations of one fixture. */
export function lifetimeOf(body, { files = {}, file = 'sample.ts' } = {}) {
  return byStage(
    run({ ...files, [`apps/web/src/features/${file}`]: [...HEADER, body].join('\n') })
  );
}

/** Every refused case produces its named L1 detail; every safe control produces no L1. */
export function assertLifetime(refused, safe = {}) {
  for (const [name, [detail, body, options]] of Object.entries(refused)) {
    const { lifetime } = lifetimeOf(body, options);
    assert.ok(lifetime.includes(detail), `${name}: expected "${detail}"; got ${lifetime}`);
  }
  for (const [name, spec] of Object.entries(safe)) {
    const [body, options] = typeof spec === 'string' ? [spec] : spec;
    assert.deepEqual(lifetimeOf(body, options).lifetime, [], name);
  }
}
