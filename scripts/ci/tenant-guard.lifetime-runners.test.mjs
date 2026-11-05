import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { HEADER } from './tenant-guard-lifetime-test-support.mjs';
import { byStage, run } from './tenant-guard-test-support.mjs';

// Reviewed runners: a module-private function bound to its file's digest may hand the
// transaction to its callback; each call site's callback is then checked as a source.

const FILE = 'apps/web/src/features/runner.ts';
const LOCK = [
  "import { dbAdmin } from '@interdomestik/database';",
  'async function withLock<T>(id: string, work: (tx: any) => Promise<T>): Promise<T> {',
  '  return dbAdmin.transaction(async (tx: any) => { await tx.execute(id); return work(tx); });',
  '}',
];
const READ = [
  'async function withRead<T>(db: any, id: string, action: (tx: any) => Promise<T>): Promise<T> {',
  '  if (!db.transaction) return action(db);',
  '  return db.transaction(async (tx: any) => { await tx.execute(id); return action(tx); });',
  '}',
];
const digest = text => createHash('sha256').update(text, 'utf8').digest('hex');

function lifetime(lines, { manifest = 'match', runners } = {}) {
  const text = [...HEADER, ...lines].join('\n');
  const sha = manifest === 'match' ? digest(text) : '0'.repeat(64);
  const lifetimeRunners = runners ?? [
    { file: FILE, unit: 'withLock', sha256: sha, callback: 1, lends: [] },
    { file: FILE, unit: 'withRead', sha256: sha, callback: 2, lends: [0] },
  ];
  return byStage(run({ [FILE]: text }, { lifetimeRunners })).lifetime;
}

test('L1 runners: an active runner forwards to its callback; each call site is a source', () => {
  assert.deepEqual(
    lifetime([
      ...LOCK,
      'export const f = (id: string) => withLock(id, async (tx: any) => tx.select());',
    ]),
    []
  );
  assert.deepEqual(
    lifetime([
      ...LOCK,
      'export const f = (id: string) => withLock(id, async (tx: any) => { kept = tx; });',
    ]),
    ['f: the capability escapes its callback (BinaryExpression)']
  );
});

test('L1 runners: a changed file, an export or an unauthenticated binding deactivates it', () => {
  const call = 'export const f = (id: string) => withLock(id, async (tx: any) => tx.select());';
  const refused = ['withLock: a callback read from a parameter (work)'];
  assert.deepEqual(lifetime([...LOCK, call], { manifest: 'stale' }), refused);
  assert.deepEqual(lifetime([...LOCK, call, 'export { withLock };']), refused);
  const helper = "import { readThing } from '../legacy';";
  assert.deepEqual(
    lifetime([helper, ...LOCK.slice(0, 2), '  readThing;', ...LOCK.slice(2), call]),
    refused
  );
});

test('L1 runners: a runner is only called directly with its exact arity', () => {
  const cases = {
    alias: [
      'const r = withLock;',
      'export const f = (id: string) => r(id, async (tx: any) => tx.select());',
    ],
    argument: ['export const f = (g: any) => g(withLock);'],
  };
  for (const [name, body] of Object.entries(cases))
    assert.ok(
      lifetime([...LOCK, ...body]).some(d => /a reviewed runner used as a value/u.test(d)),
      name
    );
  assert.deepEqual(
    lifetime([...LOCK, 'export const f = (args: any) => (withLock as any)(...args);']),
    ['f: a reviewed runner called with another arity']
  );
});

test('L1 runners: a lent borrow must be joined and handed over directly', () => {
  const joined =
    'export const f = () => W(a, async (tx: any) => withRead(tx, "x", async (inner: any) => inner.select()));';
  assert.deepEqual(lifetime([...READ, joined]), []);
  const detached =
    'export const f = () => W(a, async (tx: any) => { withRead(tx, "x", async (inner: any) => inner.select()); });';
  assert.deepEqual(lifetime([...READ, detached]), [
    'f: an asynchronous helper that is not awaited (withRead)',
  ]);
  const leak =
    'export const f = () => W(a, async (tx: any) => withRead(tx, "x", async (inner: any) => { kept = inner; }));';
  assert.deepEqual(lifetime([...READ, leak]), [
    'f: the capability escapes its callback (BinaryExpression)',
  ]);
});
