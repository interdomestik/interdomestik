import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';
import ts from 'typescript';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const contextModule = 'packages/database/src/free-start-drafts/context.ts';

function getSources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return getSources(path);
    const testSource = /(?:[.-]test-support|\.(?:test|spec))\.[cm]?[jt]sx?$/u.test(path);
    return /\.[cm]?[jt]sx?$/u.test(path) && !testSource ? [path] : [];
  });
}

function findWriters(path: string): string[] {
  const text = readFileSync(path, 'utf8');
  if (!text.includes('app.current_actor_')) return [];
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  const writers: string[] = [];
  function visit(node: ts.Node, name = '<module>') {
    const owner = ts.isFunctionDeclaration(node) ? (node.name?.text ?? name) : name;
    if (ts.isTemplateExpression(node) || ts.isStringLiteralLike(node)) {
      const value = node.getText();
      for (const match of value.matchAll(
        /(?:\bset_config\s*\(\s*['"]|\bset\s+(?:(?:local|session)\s+)?["']?)(app\.current_actor_(?:id|role|branch_id))\b/giu
      )) {
        writers.push(`${relative(root, path)}#${owner}:${match[1]}`);
      }
      if (ts.isTemplateExpression(node)) return;
    }
    node.forEachChild(child => visit(child, owner));
  }
  visit(source);
  return writers;
}

test('only the two admitted transaction functions set actor GUCs', () => {
  const roots = [
    join(root, 'apps/web/src'),
    ...readdirSync(join(root, 'packages'), { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => join(root, 'packages', entry.name, 'src'))
      .filter(path => readdirSync(join(path, '..')).includes('src')),
  ];
  const writers = roots.flatMap(getSources).flatMap(findWriters);
  writers.sort((left, right) => left.localeCompare(right));
  assert.deepEqual(writers, [
    `${contextModule}#withFreeStartDraftContext:app.current_actor_id`,
    `${contextModule}#withPrincipalTenantContext:app.current_actor_branch_id`,
    `${contextModule}#withPrincipalTenantContext:app.current_actor_id`,
    `${contextModule}#withPrincipalTenantContext:app.current_actor_role`,
  ]);
});

test('journal migrations never create or grant the local seed cleanup role', () => {
  const dir = join(root, 'packages/database/drizzle');
  for (const file of readdirSync(dir).filter(name => name.endsWith('.sql'))) {
    const sql = readFileSync(join(dir, file), 'utf8');
    assert.doesNotMatch(
      sql,
      /\b(?:create\s+(?:role|user|group)\s+["']?interdomestik_seed_cleanup\b|grant\b[^;]*\binterdomestik_seed_cleanup\b)/iu,
      file
    );
  }
});
