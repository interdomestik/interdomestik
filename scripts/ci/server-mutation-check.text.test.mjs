import assert from 'node:assert/strict';
import test from 'node:test';

import { runCheck, tree } from './fixtures/server-mutation-check/harness.mjs';

const M = 'packages/domain-x/src/text.ts';

test('CHK-05b: a cast .json() body is reported through await, parentheses, catch and const bindings', t => {
  const body = `type Body = { a: string };
export async function a(r: Response) { return (await r.json()) as Body; }
export async function b(r: Response) { const raw = await r.json().catch(() => null); return raw as Body; }
export async function c(r: Response) { return (await r.json()) as unknown as Body; }
export async function d(r: Response) { return <Body>(await r.json()); }`;
  const result = runCheck('CHK-05b', tree(t, { [M]: body }));
  assert.deepEqual(result.findings.map(f => f.id.split('#')[1]).sort(), ['a', 'b', 'c', 'd']);
});

test('CHK-05b: a parse, an unknown assertion and a non-json cast pass; tests are not scanned', t => {
  const body = `import { z } from 'zod';
export async function a(r: Response) { return z.strictObject({ a: z.string() }).parse(await r.json()); }
export async function b(r: Response) { return (await r.json()) as unknown; }
export function c(v: unknown) { return v as string; }`;
  const root = tree(t, {
    [M]: body,
    'packages/domain-x/src/text.test.ts': 'export const x = (r: any) => r.json() as string;\n',
  });
  assert.deepEqual(runCheck('CHK-05b', root).findings, []);
});

test('UNAUTH-TEXT: an Error carrying unauthorized text is reported, case-insensitive, also as a template', t => {
  const body =
    "export function a() { throw new Error('Unauthorized'); }\nexport function b() { throw new Error(`UNAUTHORIZED: ${1}`); }\nexport function c() { throw new Error('not unauthorised spelling'); }";
  const result = runCheck('UNAUTH-TEXT', tree(t, { [M]: body }));
  assert.deepEqual(result.findings.map(f => f.id.split('#')[1]).sort(), ['a', 'b']);
});

test('UNAUTH-TEXT: exempt only when the next statement assigns a refusal code literal to the binding', t => {
  const body = `export function ok() { const e = new Error('Unauthorized client'); (e as Error & { code?: string }).code = 'FORBIDDEN_SCOPE_MISMATCH'; throw e; }
export function wrongCode() { const e = new Error('Unauthorized'); (e as any).code = 'NOT_A_REFUSAL'; throw e; }
export function laterCode() { const e = new Error('Unauthorized'); log(); (e as any).code = 'FORBIDDEN'; throw e; }
export function otherBinding() { const e = new Error('Unauthorized'); const f = e; (f as any).code = 'FORBIDDEN'; throw e; }`;
  const result = runCheck('UNAUTH-TEXT', tree(t, { [M]: body }));
  assert.deepEqual(result.findings.map(f => f.id.split('#')[1]).sort(), [
    'laterCode',
    'otherBinding',
    'wrongCode',
  ]);
});

test('UNAUTH-TEXT: dynamic rethrows form a separate report-only list; client modules and tests are skipped', t => {
  const body =
    'export function a(x: { error: string }) { throw new Error(String(x.error)); }\nexport function b(x: { message: string }) { throw new Error(x.message); }';
  const root = tree(t, {
    [M]: body,
    'apps/web/src/components/c.tsx':
      "'use client';\nexport function C() { throw new Error('Unauthorized'); }\n",
    'packages/domain-x/src/text.test.ts':
      "export const t = () => { throw new Error('Unauthorized'); };\n",
  });
  const result = runCheck('UNAUTH-TEXT', root);
  assert.deepEqual(result.findings, []);
  assert.deepEqual(result.reportOnly.map(f => f.id.split('#')[1]).sort(), ['a', 'b']);
});

test('UNAUTH-TEXT: missing REFUSAL_CODES in the wrapper types is a scanner error', t => {
  const root = tree(t, { 'apps/web/src/lib/safe-action.types.ts': 'export const OTHER = 1;\n' });
  assert.throws(() => runCheck('UNAUTH-TEXT', root), /REFUSAL_CODES not found/u);
});
