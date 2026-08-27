import assert from 'node:assert/strict';
import test from 'node:test';

import {
  approvalMarker,
  classifyWriterPath,
  compareCanonicalText,
} from './lean-current-authority.mjs';

const T116_WRITERS = [
  'packages/domain-member/src/case-summary/types.ts',
  'packages/domain-member/src/case-summary/get-member-case-summaries.ts',
  'packages/domain-member/src/case-summary/get-member-case-summaries.test.ts',
  'packages/domain-member/src/index.ts',
  'apps/web/src/components/dashboard/case-summary/accident-case-summary.tsx',
  'apps/web/src/components/dashboard/case-summary/case-kind-registry.ts',
  'apps/web/src/components/dashboard/case-summary/case-kind-registry.test.tsx',
];
const t116 = {
  sliceId: 'T-116-CASE-SUMMARY',
  tier: 2,
  promotionPrNumber: 1700,
  promotionBaseSha: '0'.repeat(40),
  expectedProductBranch: 'codex/t116-case-summary',
  gateSha256: 'a'.repeat(64),
  admissionSha256: 'b'.repeat(64),
  productWriterPaths: T116_WRITERS,
  closeoutWriterPaths: ['docs/plans/current-program.md', 'docs/plans/current-tracker.md'],
};

test('deny-first classification rejects protected and unknown paths', () => {
  const denied = [
    'docs/plans/current-program.md',
    'apps/web/src/proxy.ts',
    'packages/shared-auth/src/index.ts',
    'packages/database/src/schema/user.ts',
    'packages/domain-ai/src/model.ts',
    'packages/domain-users/src/admin/roles.ts',
    'packages/domain-users/src/utils/ensure-tenant.ts',
    'packages/domain-privacy/src/member/export.ts',
    'apps/web/src/components/auth/login-form.tsx',
    'apps/web/src/components/legal-card.tsx',
    'apps/web/src/components/schema-view.tsx',
    'apps/web/src/components/playwright-panel.tsx',
    'apps/web/src/app/[locale]/(auth)/login/page.tsx',
    'apps/web/src/messages/en/commercialTerms.json',
    'apps/web/src/messages/en/commercial-terms.json',
    'apps/web/src/messages/en/commercial_terms.json',
    '.github/workflows/ci.yml',
    'apps/web/e2e/gate.spec.ts',
    'package.json',
    'Dockerfile',
    '../escape.ts',
    'unmapped/feature.ts',
  ];
  for (const path of denied) assert.equal(classifyWriterPath(path).allowed, false, path);
  for (const path of [
    'apps/web/src/app/[locale]/page.tsx',
    'apps/web/src/app/[locale]/page.test.tsx',
  ]) {
    assert.equal(classifyWriterPath(path).allowed, true, path);
  }
});

test('deny-first classification finds protected tokens anywhere in an allowed component path', () => {
  const disguisedProtectedPaths = [
    'apps/web/src/components/member-access-card.tsx',
    'apps/web/src/components/user-privacy-card.tsx',
    'apps/web/src/components/ensure-tenant.tsx',
    'apps/web/src/components/ai-assistant.tsx',
    'apps/web/src/components/model-picker.tsx',
    'apps/web/src/components/oauth-login-panel.tsx',
    'apps/web/src/components/prompt-evaluation-card.tsx',
    'apps/web/src/components/stripe-checkout-card.tsx',
    'apps/web/src/components/member_access_card.tsx',
  ];
  for (const path of disguisedProtectedPaths) {
    assert.deepEqual(classifyWriterPath(path), { allowed: false, classification: 'protected' });
  }
});

test('canonical path ordering uses an explicit locale-bound comparator', () => {
  const unordered = ['zeta/path.ts', 'alpha/path.ts', 'middle/path.ts'];
  assert.deepEqual([...unordered].sort(compareCanonicalText), [
    'alpha/path.ts',
    'middle/path.ts',
    'zeta/path.ts',
  ]);
});

test('domain_read_projection is exact, Tier-2, T-116-only and keeps tenant proof in-map', () => {
  for (const path of T116_WRITERS.slice(0, 4)) {
    assert.deepEqual(classifyWriterPath(path, t116), {
      allowed: true,
      classification: 'domain_read_projection',
    });
    assert.equal(classifyWriterPath(path).allowed, false, `default deny: ${path}`);
  }
  assert.doesNotThrow(() => approvalMarker(t116, '1'.repeat(40), '2'.repeat(40)));

  const invalid = [
    { ...t116, tier: 1 },
    { ...t116, sliceId: 'T-116-CASE-SUMMARY-COPY' },
    { ...t116, productWriterPaths: T116_WRITERS.slice(0, -1) },
    {
      ...t116,
      productWriterPaths: [
        ...T116_WRITERS,
        'packages/domain-member/src/case-summary/get-cross-tenant-case.ts',
      ],
    },
    {
      ...t116,
      productWriterPaths: T116_WRITERS.map(path =>
        path.endsWith('.test.ts') ? 'packages/domain-member/src/case-summary/update-case.ts' : path
      ),
    },
  ];
  for (const slice of invalid) {
    assert.throws(
      () => approvalMarker(slice, '1'.repeat(40), '2'.repeat(40)),
      /schema or policy mismatch/u
    );
  }
});
