import assert from 'node:assert/strict';
import test from 'node:test';

import {
  approvalMarker,
  classifyWriterPath,
  compareCanonicalText,
} from './lean-current-authority.mjs';

const WEB = 'apps/web/src';
const COMPONENTS = `${WEB}/components`;
const DOMAIN_MEMBER = 'packages/domain-member/src';
const MEMBER_PAGE = `${WEB}/app/[locale]/(app)/member`;
const PORTAL = `${COMPONENTS}/dashboard/member-portal-runtime`;
const E2E = 'apps/web/e2e';
const T116_WRITERS = [
  `${DOMAIN_MEMBER}/case-summary/types.ts`,
  `${DOMAIN_MEMBER}/case-summary/get-member-case-summaries.ts`,
  `${DOMAIN_MEMBER}/case-summary/get-member-case-summaries.test.ts`,
  `${DOMAIN_MEMBER}/index.ts`,
  `${COMPONENTS}/dashboard/case-summary/accident-case-summary.tsx`,
  `${COMPONENTS}/dashboard/case-summary/case-kind-registry.ts`,
  `${COMPONENTS}/dashboard/case-summary/case-kind-registry.test.tsx`,
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
const T117B_LEGACY_WRITERS = [
  `${WEB}/lib/auth.server.ts`,
  `${WEB}/components/shell/member-portal-context.ts`,
  `${DOMAIN_MEMBER}/portal-runtime/get-member-portal-activity.ts`,
  `${DOMAIN_MEMBER}/portal-runtime/get-member-portal-activity.test.ts`,
  `${DOMAIN_MEMBER}/index.ts`,
  `${PORTAL}.tsx`,
  `${PORTAL}-boundary.test.tsx`,
  `${MEMBER_PAGE}/_core.entry.tsx`,
  `${MEMBER_PAGE}/_core.entry.test.tsx`,
  `${MEMBER_PAGE}/page.tsx`,
  `${MEMBER_PAGE}/page.test.tsx`,
];
const T117B_WRITERS = [
  ...T117B_LEGACY_WRITERS,
  `${E2E}/dashboard-access.spec.ts`,
  `${E2E}/gate/member-diaspora.spec.ts`,
  `${E2E}/gate/member-home-cta.spec.ts`,
  `${E2E}/golden/agent-member-overlay.spec.ts`,
  `${E2E}/golden/member-dashboard-empty-state.spec.ts`,
  `${E2E}/golden/member-dashboard-has-claims.spec.ts`,
  `${E2E}/production.spec.ts`,
  `${E2E}/smoke/ida-dashboard-smoke.spec.ts`,
  `${E2E}/ui-v2-onboarding.spec.ts`,
];
const T117B_DATA_WRITERS = [
  `${WEB}/lib/auth.server.ts`,
  `${WEB}/components/shell/member-portal-context.ts`,
  'packages/domain-member/package.json',
  `${DOMAIN_MEMBER}/case-summary/get-member-case-summaries.test.ts`,
  `${DOMAIN_MEMBER}/case-summary/get-member-case-summaries.ts`,
  `${DOMAIN_MEMBER}/case-summary/types.ts`,
  `${DOMAIN_MEMBER}/index.ts`,
  `${DOMAIN_MEMBER}/portal-runtime/get-member-portal-membership.test.ts`,
  `${DOMAIN_MEMBER}/portal-runtime/get-member-portal-membership.ts`,
  'pnpm-lock.yaml',
];
const T117B_PORTAL_WRITERS = [
  `${COMPONENTS}/dashboard/case-summary/accident-case-summary.tsx`,
  `${COMPONENTS}/dashboard/case-summary/case-kind-registry.test.tsx`,
  `${COMPONENTS}/dashboard/case-summary/case-kind-registry.ts`,
  `${COMPONENTS}/dashboard/case-summary/generic-case-summary.tsx`,
  `${COMPONENTS}/dashboard/member-portal-region-boundary.tsx`,
  `${PORTAL}-boundary.test.tsx`,
  `${PORTAL}.tsx`,
  `${WEB}/messages/en/dashboard.json`,
  `${WEB}/messages/mk/dashboard.json`,
  `${WEB}/messages/sq/dashboard.json`,
  `${WEB}/messages/sr/dashboard.json`,
];
const T117B_CUTOVER_WRITERS = [
  `${E2E}/gate/member-diaspora.spec.ts`,
  `${E2E}/gate/member-home-cta.spec.ts`,
  `${E2E}/golden/member-portal-agent-consumer.spec.ts`,
  `${E2E}/golden/member-dashboard-empty-state.spec.ts`,
  `${E2E}/golden/member-dashboard-has-claims.spec.ts`,
  `${E2E}/production.spec.ts`,
  `${E2E}/smoke/ida-dashboard-smoke.spec.ts`,
  `${E2E}/ui-v2-onboarding.spec.ts`,
  `${MEMBER_PAGE}/_core.entry.test.tsx`,
  `${MEMBER_PAGE}/_core.entry.tsx`,
  `${MEMBER_PAGE}/page.test.tsx`,
  `${MEMBER_PAGE}/page.tsx`,
];
const t117b = {
  ...t116,
  sliceId: 'T-117B-PORTAL-RUNTIME',
  tier: 3,
  expectedProductBranch: 'codex/t117b-portal-runtime',
  productWriterPaths: T117B_WRITERS,
};
const t117bChildren = [
  {
    ...t117b,
    sliceId: 'T117B-DATA',
    expectedProductBranch: 'codex/t117b-data',
    productWriterPaths: T117B_DATA_WRITERS,
  },
  {
    ...t117b,
    sliceId: 'T117B-PORTAL',
    expectedProductBranch: 'codex/t117b-portal',
    productWriterPaths: T117B_PORTAL_WRITERS,
  },
  {
    ...t117b,
    sliceId: 'T117B-CUTOVER',
    expectedProductBranch: 'codex/t117b-cutover',
    productWriterPaths: T117B_CUTOVER_WRITERS,
  },
];
const marker = slice => approvalMarker(slice, '1'.repeat(40), '2'.repeat(40));
const withPaths = (slice, productWriterPaths) => ({ ...slice, productWriterPaths });
const rejects = slices => {
  for (const slice of slices) assert.throws(() => marker(slice), /schema or policy mismatch/u);
};

test('deny-first classification rejects protected and unknown paths', () => {
  const denied = [
    'docs/plans/current-program.md',
    `${WEB}/proxy.ts`,
    'packages/shared-auth/src/index.ts',
    'packages/database/src/schema/user.ts',
    'packages/domain-ai/src/model.ts',
    'packages/domain-users/src/admin/roles.ts',
    'packages/domain-users/src/utils/ensure-tenant.ts',
    'packages/domain-privacy/src/member/export.ts',
    `${COMPONENTS}/auth/login-form.tsx`,
    `${COMPONENTS}/legal-card.tsx`,
    `${COMPONENTS}/schema-view.tsx`,
    `${COMPONENTS}/playwright-panel.tsx`,
    `${WEB}/app/[locale]/(auth)/login/page.tsx`,
    `${WEB}/messages/en/commercialTerms.json`,
    `${WEB}/messages/en/commercial-terms.json`,
    `${WEB}/messages/en/commercial_terms.json`,
    '.github/workflows/ci.yml',
    'apps/web/e2e/gate.spec.ts',
    'package.json',
    'Dockerfile',
    '../escape.ts',
    'unmapped/feature.ts',
  ];
  for (const path of denied) assert.equal(classifyWriterPath(path).allowed, false, path);
  for (const path of [`${WEB}/app/[locale]/page.tsx`, `${WEB}/app/[locale]/page.test.tsx`]) {
    assert.equal(classifyWriterPath(path).allowed, true, path);
  }
});

test('deny-first classification finds protected tokens anywhere in an allowed component path', () => {
  const disguisedProtectedPaths = [
    `${COMPONENTS}/member-access-card.tsx`,
    `${COMPONENTS}/user-privacy-card.tsx`,
    `${COMPONENTS}/ensure-tenant.tsx`,
    `${COMPONENTS}/ai-assistant.tsx`,
    `${COMPONENTS}/model-picker.tsx`,
    `${COMPONENTS}/oauth-login-panel.tsx`,
    `${COMPONENTS}/prompt-evaluation-card.tsx`,
    `${COMPONENTS}/stripe-checkout-card.tsx`,
    `${COMPONENTS}/member_access_card.tsx`,
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

test('domain_read_projection stays exact and T-116-only', () => {
  for (const path of T116_WRITERS.slice(0, 4)) {
    assert.deepEqual(classifyWriterPath(path, t116), {
      allowed: true,
      classification: 'domain_read_projection',
    });
    assert.equal(classifyWriterPath(path).allowed, false, `default deny: ${path}`);
  }
  assert.doesNotThrow(() => marker(t116));

  const invalid = [
    { ...t116, tier: 1 },
    { ...t116, sliceId: 'T-116-CASE-SUMMARY-COPY' },
    withPaths(t116, T116_WRITERS.slice(0, -1)),
    withPaths(t116, [
      ...T116_WRITERS,
      'packages/domain-member/src/case-summary/get-cross-tenant-case.ts',
    ]),
    withPaths(
      t116,
      T116_WRITERS.map(path =>
        path.endsWith('.test.ts') ? 'packages/domain-member/src/case-summary/update-case.ts' : path
      )
    ),
  ];
  rejects(invalid);
});

test('tier3_portal_runtime accepts only historical T-117B hashes and exact sequential children', () => {
  for (const path of T117B_WRITERS) {
    assert.deepEqual(classifyWriterPath(path, t117b), {
      allowed: true,
      classification: 'tier3_portal_runtime',
    });
    assert.throws(() => marker(withPaths(t117b, [path])), /schema or policy mismatch/u);
  }
  assert.doesNotThrow(() => marker(t117b));
  assert.doesNotThrow(() => marker(withPaths(t117b, T117B_LEGACY_WRITERS)));

  for (const child of t117bChildren) {
    assert.doesNotThrow(() => marker(child));
    for (const path of child.productWriterPaths) {
      assert.deepEqual(classifyWriterPath(path, child), {
        allowed: true,
        classification: 'tier3_portal_runtime',
      });
    }
    rejects([
      withPaths(child, [...child.productWriterPaths].reverse()),
      withPaths(child, child.productWriterPaths.slice(1)),
      withPaths(child, [...child.productWriterPaths, 'next.config.mjs']),
    ]);
  }

  const invalid = [
    { ...t117b, tier: 2 },
    { ...t117b, sliceId: 'T-117B-PORTAL-RUNTIME-COPY' },
    withPaths(t117b, [...T117B_WRITERS].reverse()),
    withPaths(t117b, T117B_WRITERS.slice(1)),
    withPaths(t117b, [...T117B_WRITERS, 'next.config.mjs']),
    { ...t117bChildren[0], sliceId: 'T117B-DATA-COPY' },
    withPaths(
      t116,
      Array.from({ length: 13 }, (_, index) => `apps/web/src/components/example-${index}.tsx`)
    ),
    withPaths(
      t117b,
      T117B_WRITERS.map(path =>
        path.endsWith('page.tsx') ? 'apps/web/src/app/[locale]/(app)/member/@cases/page.tsx' : path
      )
    ),
  ];
  rejects(invalid);
});
