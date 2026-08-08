import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { findAdminPreflightImports } from './admin-connection-preflight.support';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = resolve(ROOT, '../..');
const TEST = join(ROOT, 'test');
const RUNTIME = [
  join(TEST, 'pg16/migration-runtime-role-fixture.test.ts'),
  join(TEST, 'migration-runtime-role-lifecycle.support.ts'),
  join(TEST, 'migration-runtime-role-fixture.support.ts'),
  join(TEST, 'migration-runtime-role-manifest.support.ts'),
];
const ALLOWED = new Set([
  ...RUNTIME,
  join(TEST, 'migration-runtime-role-fixture-boundary.test.ts'),
]);
const IMPORTS = [
  /\b(?:import|export)\s+(?:type\s+)?(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/gu,
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/gu,
  /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/gu,
];
const source = (path: string) => readFileSync(path, 'utf8');
const lines = (path: string) => source(path).split(/\r?\n/u).length - 1;

function specifiers(text: string): string[] {
  return IMPORTS.flatMap(pattern => [...text.matchAll(pattern)].map(match => match[1]!));
}

function localFile(importer: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) return null;
  const base = resolve(dirname(importer), specifier);
  const candidates = extname(base) ? [base] : [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts')];
  return candidates.find(existsSync) ?? null;
}

function closure(roots: string[]): Set<string> {
  const visited = new Set<string>();
  const pending = [...roots];
  while (pending.length) {
    const path = pending.pop()!;
    if (visited.has(path)) continue;
    assert.ok(existsSync(path), `missing runtime root: ${path}`);
    visited.add(path);
    for (const specifier of specifiers(source(path))) {
      const next = localFile(path, specifier);
      if (next) pending.push(next);
    }
  }
  return visited;
}

function typescriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    if (
      entry.isDirectory() &&
      ['.git', '.next', 'dist', 'node_modules', 'tmp'].includes(entry.name)
    )
      return [];
    return entry.isDirectory() ? typescriptFiles(path) : /\.tsx?$/u.test(path) ? [path] : [];
  });
}

test('pins the focused command, opt-in and static collector boundary', () => {
  const packageJson = JSON.parse(source(join(ROOT, 'package.json')));
  const command = packageJson.scripts['test:migration-runtime-role'];
  assert.equal(
    command,
    'tsx --test --test-concurrency=1 test/pg16/migration-runtime-role-fixture.test.ts'
  );
  assert.doesNotMatch(command, /IDA_PG16_FIXTURE/u);
  const dynamic = source(RUNTIME[0]!);
  assert.doesNotMatch(dynamic, /\.(?:skip|todo)\b|IDA_PG16_FIXTURE\s*=/u);
  assert.deepEqual(findAdminPreflightImports(), [
    'packages/database/test/admin-connection-preflight.support.ts',
    'packages/database/test/admin-connection-preflight.test.ts',
  ]);
});

test('closes every runtime import root without production clients or forbidden supports', () => {
  const files = closure(RUNTIME);
  const forbiddenFiles = new Set([join(ROOT, 'src/index.ts'), join(ROOT, 'src/db.ts')]);
  for (const path of files) {
    const text = source(path);
    assert.ok(lines(path) <= 150, `${path} exceeds 150 lines`);
    assert.equal(forbiddenFiles.has(path), false, `production client reached: ${path}`);
    assert.doesNotMatch(text, /['"]@interdomestik\/database(?:\/db)?['"]/u);
    assert.doesNotMatch(text, /import\s*\{[^}]*\b(?:db|dbAdmin|dbRls)\b[^}]*\}\s*from/su);
    for (const specifier of specifiers(text)) {
      assert.doesNotMatch(
        specifier,
        /(?:migration-execution|admin-connection-preflight)\.support$/u
      );
      assert.equal(
        specifier === 'drizzle-orm' || specifier.startsWith('@supabase/'),
        false,
        `forbidden client import: ${path}`
      );
      const withoutPostgresTypes = text.replace(
        /import\s+type\s+[^;]+\s+from\s+['"]postgres['"];?/gu,
        ''
      );
      if (specifier === 'postgres' && /['"]postgres['"]/u.test(withoutPostgresTypes)) {
        assert.match(
          path,
          /(?:migration-runtime-role-(?:fixture|manifest)\.support|src\/admin-connection-preflight)\.ts$/u
        );
      }
    }
  }
});

test('allows no ungoverned consumer of the new runtime helpers', () => {
  const names = RUNTIME.slice(1).map(path => path.split('/').at(-1)!.replace(/\.ts$/u, ''));
  for (const path of typescriptFiles(REPO)) {
    if (ALLOWED.has(path)) continue;
    const text = source(path);
    for (const name of names) assert.doesNotMatch(text, new RegExp(name, 'u'), path);
  }
});
