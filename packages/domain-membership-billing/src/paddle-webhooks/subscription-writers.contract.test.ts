import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const BILLING = 'packages/domain-membership-billing/src/';
const WEBHOOK_WRITERS = [
  `${BILLING}paddle-webhooks/handlers/subscription-upsert.ts`,
  `${BILLING}paddle-webhooks/handlers/dunning.ts`,
  `${BILLING}paddle-webhooks/handlers/dunning-order.ts`,
];
const OTHER_WRITERS = [
  `${BILLING}sponsors/provisioning-effects.ts`,
  `${BILLING}sponsors/cache-job.ts`,
  'packages/domain-leads/src/convert.ts',
  'apps/web/src/lib/actions/agent/register-member.core.ts',
  'apps/web/src/app/api/cron/dunning/_core.ts',
  'packages/domain-users/src/admin/update-user-agent.ts',
  `${BILLING}subscription/cancel.ts`,
  'apps/web/src/actions/billing-test.ts',
];
// §3.6.3 explicitly separates seed/local-test tooling from tenant runtime writers.
// Inventory these too: a new seed writer must be reviewed, not silently excluded by a glob.
const SEED_WRITERS = [
  'packages/database/src/seed-full/memberships.ts',
  'packages/database/src/seed-golden/cash-states.ts',
  'packages/database/src/seed-golden/lifecycle-memberships.ts',
  'packages/database/src/seed-golden/memberships.ts',
  'packages/database/src/seed-packs/agent-pack.ts',
  'packages/database/src/seed-utils/cleanup.ts',
  'packages/database/src/seed-workload/memberships.ts',
];

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(file);
    if (!/\.[cm]?[jt]sx?$/.test(entry.name)) return [];
    if (/(?:\.test\.|\.spec\.|\.test-support\.|\.fixture\.|\.d\.ts$)/.test(entry.name)) {
      return [];
    }
    if (file.split(path.sep).some(part => ['__tests__', '__mocks__'].includes(part))) return [];
    return [file];
  });
}

/** Parse calls, so whitespace, comments, aliased imports and schema namespaces cannot hide a writer. */
function subscriptionWrites(source: string): string[] {
  const ast = ts.createSourceFile('source.tsx', source, ts.ScriptTarget.Latest, true);
  const tableNames = new Set(['subscriptions']);
  for (const statement of ast.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const entry of bindings.elements) {
      if ((entry.propertyName ?? entry.name).text === 'subscriptions')
        tableNames.add(entry.name.text);
    }
  }
  const writes: string[] = [];
  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const operation = node.expression.name.text;
      const table = node.arguments[0];
      if (
        ['insert', 'update'].includes(operation) &&
        table &&
        ((ts.isIdentifier(table) && tableNames.has(table.text)) ||
          (ts.isPropertyAccessExpression(table) && table.name.text === 'subscriptions'))
      )
        writes.push(operation);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return writes;
}

describe('ACQ-3 subscription writer inventory', () => {
  it('lists every package/app source module that inserts or updates subscriptions', () => {
    const roots = ['apps', 'packages'].flatMap(group =>
      readdirSync(path.join(ROOT, group), { withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .map(entry => path.join(ROOT, group, entry.name, 'src'))
        .filter(existsSync)
    );
    const writers = roots
      .flatMap(sourceFiles)
      .filter(file => subscriptionWrites(readFileSync(file, 'utf8')).length > 0)
      .map(file => path.relative(ROOT, file));
    expect(writers.sort()).toEqual([...WEBHOOK_WRITERS, ...OTHER_WRITERS, ...SEED_WRITERS].sort());
    expect(writers.filter(file => file.includes('/paddle-webhooks/')).sort()).toEqual(
      [...WEBHOOK_WRITERS].sort()
    );
  }, 30_000);

  it('keeps the sponsor writer insert-only and explicitly sponsored', () => {
    const source = readFileSync(
      path.join(ROOT, BILLING, 'sponsors/provisioning-effects.ts'),
      'utf8'
    );
    expect(subscriptionWrites(source)).toEqual(['insert']);
    expect(source).toContain('provider: GROUP_SPONSOR_PROVIDER');
    expect(source).not.toContain('.onConflictDoUpdate(');
    // §3.7: the display cache only updates status, conditional on the sponsored provider.
    const cache = readFileSync(path.join(ROOT, BILLING, 'sponsors/cache-job.ts'), 'utf8');
    expect(subscriptionWrites(cache)).toEqual(['update']);
    expect(cache).toContain("eq(subscriptions.provider, 'group_sponsor')");
  });

  it('detects new writers despite aliases, multiline calls or schema namespaces', () => {
    expect(
      subscriptionWrites(`
      import { subscriptions as seats } from '@interdomestik/database';
      tx.insert( /* new row */ seats ).values({});
      tx.update(\n schema.subscriptions\n ).set({});
      tx.update(subscriptions).set({});
    `)
    ).toEqual(['insert', 'update', 'update']);
    expect(
      subscriptionWrites(`
      // tx.update(subscriptions)
      const example = 'tx.insert(subscriptions)';
      tx.update(user).set({});
    `)
    ).toEqual([]);
  });
});
