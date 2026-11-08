import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const BILLING = 'packages/domain-membership-billing/src/';
const WEB = 'apps/web/src/';
const MEMBER = `${WEB}app/[locale]/(app)/member/membership/`;
const AGENT = `${WEB}app/[locale]/(agent)/agent/`;

// §3.6.3 includes downstream projections: retain their classification after direct reads move
// behind the resolver. Other helpers own subscription.ts, matter-allowance.ts, queue.ts and
// agent/get-users.ts; this inventory does not authorize edits to them.
const INVENTORY = {
  A: [
    `${BILLING}subscription.ts`,
    'packages/domain-member/src/portal-runtime/get-member-portal-membership.ts',
    `${WEB}components/dashboard/member-dashboard-view/data.ts`,
    `${WEB}components/dashboard/member-dashboard-view/index.tsx`,
    `${MEMBER}_core.ts`,
    `${MEMBER}_entity-disclosure.ts`,
    `${WEB}lib/entity-disclosure.core.ts`,
    `${MEMBER}card/_core.entry.tsx`,
    `${WEB}app/[locale]/admin/users/[id]/_core.ts`,
    `${AGENT}clients/[id]/_core.ts`,
    `${WEB}components/pricing/pricing-table/pricing-decisions.ts`,
    `${WEB}app/api/cron/dunning/_core.ts`,
    // Dunning delivery is explicitly class A even though it lives among Paddle handlers.
    `${BILLING}paddle-webhooks/handlers/dunning-context.ts`,
    'packages/domain-claims/src/staff-claims/matter-allowance.ts',
    'packages/domain-claims/src/support-handoffs/queue.ts',
    'packages/domain-users/src/agent/get-users.ts',
  ],
  B: [
    `${BILLING}subscription/lifecycle-reporting.ts`,
    `${WEB}features/admin/dashboard-v2/server/fetchers/fetchKpis.ts`,
    `${WEB}app/api/cron/_scheduled-members.ts`,
    `${WEB}actions/analytics/get-admin.core.ts`,
    'packages/domain-communications/src/cron-service.ts',
    'packages/domain-users/src/admin/update-user-agent.ts',
    `${AGENT}_core.ts`,
    `${BILLING}commissions/admin/payability.ts`,
    `${BILLING}enterprise-controls.ts`,
    'packages/domain-claims/src/staff-claims/save-success-fee-collection.ts',
    `${BILLING}success-fees/recovery-success-fee-snapshot.ts`,
    `${BILLING}success-fees/paddle-success-fee-charge.ts`,
    'packages/domain-claims/src/support-handoffs/create-store-queries.ts',
    'packages/domain-users/src/user-settings/residence-country.ts',
  ],
  C: [
    'packages/database/src/paddle-provider-resolution.ts',
    `${BILLING}paddle-webhooks/handlers/subscription-event-order.ts`,
    `${BILLING}paddle-webhooks/handlers/subscription-upsert.ts`,
    `${BILLING}paddle-webhooks/handlers/dunning-order.ts`,
    `${BILLING}paddle-webhooks/handlers/dunning.ts`,
    `${BILLING}subscription/get-payment-update-url.ts`,
    `${BILLING}subscription/cancel.ts`,
    `${WEB}actions/billing-test.ts`,
  ],
  sponsor: [
    `${BILLING}sponsor-coverage/resolve.ts`,
    `${BILLING}sponsors/cache-job.ts`,
    `${BILLING}sponsors/mail-producers.ts`,
    `${BILLING}sponsors/provisioning.ts`,
    `${BILLING}sponsors/staff-tasks-queries.ts`,
  ],
  seed: [
    'packages/database/src/seed-assert-branch-membership.ts',
    'packages/database/src/seed-assert-cash.ts',
    'packages/database/src/seed-assert-lifecycle.ts',
    'packages/database/src/seed-utils/cleanup.ts',
  ],
  'retired-none': [
    `${WEB}actions/subscription.core.ts`,
    `${WEB}features/agent/import/server/get-group-dashboard-summary.ts`,
  ],
  // unclassified-existing: no current direct readers remain unnamed by §3.6.3 or sponsor scope.
  // Add an existing omission here only with an explicit report to the integration owner.
  'unclassified-existing': [],
} satisfies Record<string, string[]>;

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(file);
    if (!/\.[cm]?[jt]sx?$/.test(entry.name)) return [];
    if (/(?:\.test\.|\.spec\.|[.-]test-(?:support|core)\.|\.fixture\.|\.d\.ts$)/.test(entry.name)) {
      return [];
    }
    if (file.split(path.sep).some(part => ['__tests__', '__mocks__'].includes(part))) return [];
    return [file];
  });
}

function subscriptionReads(source: string): boolean {
  // Every detection path needs the token, possibly spelled with a Unicode escape; skip the AST
  // only for files that contain neither.
  if (!/subscriptions/i.test(source) && !source.includes('\\u')) return false;
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
  function isTable(node: ts.Node): boolean {
    return (
      (ts.isIdentifier(node) && tableNames.has(node.text)) ||
      (ts.isPropertyAccessExpression(node) && node.name.text === 'subscriptions')
    );
  }
  function includesSubscriptionRelation(node: ts.Node): boolean {
    if (
      ts.isPropertyAssignment(node) &&
      node.name.getText(ast).replace(/['"]/g, '') === 'subscriptions'
    ) {
      return node.initializer.kind !== ts.SyntaxKind.FalseKeyword;
    }
    return ts.forEachChild(node, includesSubscriptionRelation) ?? false;
  }
  let found = false;
  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const operation = node.expression.name.text;
      const table = node.arguments[0];
      const receiver = node.expression.expression;
      if (
        [
          'from',
          'innerJoin',
          'leftJoin',
          'rightJoin',
          'fullJoin',
          'crossJoin',
          'innerJoinLateral',
          'leftJoinLateral',
          'crossJoinLateral',
        ].includes(operation) &&
        table &&
        isTable(table)
      )
        found = true;
      if (
        ['findFirst', 'findMany'].includes(operation) &&
        ts.isPropertyAccessExpression(receiver) &&
        ts.isPropertyAccessExpression(receiver.expression) &&
        receiver.expression.name.text === 'query'
      ) {
        if (
          receiver.name.text === 'subscriptions' ||
          node.arguments.some(includesSubscriptionRelation)
        )
          found = true;
      }
    }
    // Seed assertions also read subscriptions via literal SQL; ignore comments and ordinary strings.
    if (ts.isTaggedTemplateExpression(node) && /(?:^|\.)sql$/.test(node.tag.getText(ast))) {
      const sqlText = node.template.getText(ast);
      if (
        /\b(?:from|join)\s+(?:"?\w+"?\.)?"?subscriptions"?\b/i.test(sqlText) ||
        (ts.isTemplateExpression(node.template) &&
          node.template.templateSpans.some(span => isTable(span.expression)))
      )
        found = true;
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return found;
}

function unlistedReaders(readers: string[]): string[] {
  const classified = new Set(
    Object.entries(INVENTORY)
      .filter(([classification]) => classification !== 'retired-none')
      .flatMap(([, files]) => files)
  );
  return readers.filter(file => !classified.has(file));
}

describe('ACQ-3 §3.6.3 subscription reader inventory', () => {
  it('classifies every non-test package/app source reader, including seeds', () => {
    const roots = ['apps', 'packages'].flatMap(group =>
      readdirSync(path.join(ROOT, group), { withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .map(entry => path.join(ROOT, group, entry.name, 'src'))
        .filter(existsSync)
    );
    const readers = roots
      .flatMap(sourceFiles)
      .filter(file => subscriptionReads(readFileSync(file, 'utf8')))
      .map(file => path.relative(ROOT, file));
    expect(readers.length).toBeGreaterThan(0);
    expect(unlistedReaders(readers)).toEqual([]);
    expect(readers.filter(file => INVENTORY['retired-none'].includes(file))).toEqual([]);
    const entries = Object.values(INVENTORY).flat();
    expect(new Set(entries).size).toBe(entries.length);
  }, 30_000);

  it.each([
    'tx.select().from(subscriptions)',
    "import { subscriptions as seats } from '@interdomestik/database'; tx.select().from( /* x */ seats)",
    'tx.select().from(user).leftJoin(schema.subscriptions, condition)',
    'tx.select().from(user).innerJoin(\n subscriptions, condition)',
    'tx.query.subscriptions.findFirst({})',
    'db.query.subscriptions.findMany({})',
    'tx.query.user.findMany({ with: { subscriptions: { limit: 1 } } })',
    'sql`select s.id from subscriptions s join branches b on b.id = s.branch_id`',
    'sql`select * from ${schema.subscriptions}`',
    "import { subscript\\u0069ons as seats } from '@interdomestik/database'; tx.select().from(seats)",
  ])('detects readers despite aliases, namespaces and relational access: %s', source => {
    expect(subscriptionReads(source)).toBe(true);
  });

  it.each([
    '// tx.select().from(subscriptions)',
    "const example = 'db.query.subscriptions.findMany()'",
    "import type { subscriptions } from '@interdomestik/database'",
    'tx.update(subscriptions).set({ status: "active" })',
    'tx.select().from(user)',
    'tx.query.user.findMany({ with: { subscriptions: false } })',
    'hoisted.db.query.subscriptions.findFirst.mockReset()',
  ])('does not invent a reader from comments, types or writes: %s', source => {
    expect(subscriptionReads(source)).toBe(false);
  });

  it('rejects a new unlisted reader and a reintroduced retired reader', () => {
    expect(unlistedReaders([`${WEB}new-reader.ts`, `${WEB}actions/subscription.core.ts`])).toEqual([
      `${WEB}new-reader.ts`,
      `${WEB}actions/subscription.core.ts`,
    ]);
  });
});
