import assert from 'node:assert/strict';
import test from 'node:test';
import { kernelAnchorPins, proveSchemaAdmission } from './tenant-guard/rules-schema-admission.mjs';
import { KERNEL_ANCHOR } from './tenant-guard/manifest.mjs';
import { kernelWalk } from './tenant-guard/rules-trust.mjs';
import { gitIdentity, readSchemaTree } from './tenant-guard/sources.mjs';

const ROOT = new URL('../../', import.meta.url);

// First-parent sample ending at c51d656dc. Its twenty changes preserve the kernel.
// ACQ-3b edits existing kernel modules. The original WP-07 inserts mid-barrel.
const cases = [
  ['c51d656dc516eed4e5248accf958d8a358b299cf', '44033ca8c00f82152649a34cb9596e9dbc3f97a5', true],
  ['44033ca8c00f82152649a34cb9596e9dbc3f97a5', '24139380d6e1247eaa593d9e590e73b58f477e6d', true],
  ['24139380d6e1247eaa593d9e590e73b58f477e6d', 'c266f094b5249903f75e5c4e1b29e52959d30370', true],
  ['c266f094b5249903f75e5c4e1b29e52959d30370', 'cb039c4bb1ddfc55b97def9590258bbe5dcf342d', true],
  ['cb039c4bb1ddfc55b97def9590258bbe5dcf342d', 'c04e0df212cf226ef122ba1fd990d0bb16f69f12', true],
  ['c04e0df212cf226ef122ba1fd990d0bb16f69f12', 'f136a9700da2ae6bdd3486debc781030a8dbb74c', true],
  ['f136a9700da2ae6bdd3486debc781030a8dbb74c', '796a338eeb27f25f2ef9e665878b63b0eb5f860e', true],
  ['796a338eeb27f25f2ef9e665878b63b0eb5f860e', '938cdfa7f3b8bf6bae7f7593e109767e49fc0ee2', true],
  ['938cdfa7f3b8bf6bae7f7593e109767e49fc0ee2', '2c91b274de1efee308120ed46cb2a5932f7a6316', true],
  ['2c91b274de1efee308120ed46cb2a5932f7a6316', '777b23133a6d909dfec852b9bc956e8ab2445a4b', true],
  ['777b23133a6d909dfec852b9bc956e8ab2445a4b', '52a931c163556c73717ea8d32cca594ada47c840', true],
  ['52a931c163556c73717ea8d32cca594ada47c840', '3af83bc43cb88791fceb28679f131764a2e8f11d', true],
  ['3af83bc43cb88791fceb28679f131764a2e8f11d', 'cb40cf83bdec637f7bb4fa8458e3630e69002254', true],
  ['cb40cf83bdec637f7bb4fa8458e3630e69002254', 'c06d90aefa90856dbc1ebd5d41a940b95069278a', true],
  ['c06d90aefa90856dbc1ebd5d41a940b95069278a', 'a349864630090348dc0f5f92fb820454f887ed9a', true],
  ['a349864630090348dc0f5f92fb820454f887ed9a', '2739be37f0ebe2f9cdc41d4c4370ce9b697ed12d', true],
  ['2739be37f0ebe2f9cdc41d4c4370ce9b697ed12d', 'ef1bd0ef5c608d856615154921f9386f615d11de', true],
  ['ef1bd0ef5c608d856615154921f9386f615d11de', 'c95fceb7a5897b662bdfab4b5f511282906297f1', true],
  ['c95fceb7a5897b662bdfab4b5f511282906297f1', '77c5855e951c1ee4bd9a574e1d99a48c1d1f1607', true],
  ['77c5855e951c1ee4bd9a574e1d99a48c1d1f1607', 'cebbbf82b9bf13c5b095af558f60c53eb6721728', true],
  ['51739130eadd4551028b577b7e9d1eb2be33f7c8', '4488a6543555d9ca3edab073db23cf17caaf7d70', false],
  ['1b592d7eb7a94774b72eb5e95a92a8a8686592d4', 'faff03119cb915c42bc84f760fcd8eb299dd5872', false],
];

for (const [merge, parent, expected] of cases) {
  test(`schema replay ${merge.slice(0, 9)} expects ${expected ? 'admission' : 'refusal'}`, () => {
    const base = readSchemaTree(ROOT, gitIdentity(ROOT, parent), 'base');
    const candidate = readSchemaTree(ROOT, gitIdentity(ROOT, merge), 'candidate');
    const result = proveSchemaAdmission(
      { anchor: base, base, candidate },
      kernelAnchorPins(base),
      candidate.graph,
      candidate.sources
    );
    assert.equal(result.ok, expected, result.reason);
  });
}

test('the anchor db walk visits the reviewed set of 53 kernel modules', () => {
  const anchor = readSchemaTree(ROOT, KERNEL_ANCHOR, 'anchor');
  const prefix = 'packages/database/src/';
  const root = [
    'constants.ts',
    'db.ts',
    'pooler-mode.ts',
    'rls-role-assertion.ts',
    'rls-role-readiness.ts',
    'schema.ts',
    'transaction-lifetime.ts',
  ];
  const schema = [
    'agents',
    'ai',
    'auth',
    'automation',
    'billing',
    'case-scoped-access-grants',
    'claim-commercial',
    'claim-core',
    'claim-document-ai-consents',
    'claim-information-requests',
    'claim-recovery-no-fee',
    'claim-support-tables',
    'claim-threads',
    'claim-transition-evidence',
    'claims',
    'commercial-action-idempotency',
    'counters',
    'crm',
    'documents',
    'domain-event-deliveries',
    'domain-event-keys',
    'domain-events',
    'enums',
    'event-pii-references',
    'exchange-rates',
    'free-start-drafts',
    'index',
    'leads',
    'member-counters',
    'membership-plans',
    'memberships',
    'notes',
    'notifications',
    'policies',
    'rbac',
    'relations',
    'seed-meta',
    'services',
    'sponsor-handover',
    'sponsor-roster',
    'sponsors',
    'subscriptions',
    'tenant-entity-decomposition',
    'tenants',
    'tracking',
    'webhooks',
  ];
  const expected = [...root, ...schema.map(name => `schema/${name}.ts`)].map(file => prefix + file);
  assert.deepEqual(kernelWalk(anchor.graph, `${prefix}db.ts#db`).seen, new Set(expected));
});
