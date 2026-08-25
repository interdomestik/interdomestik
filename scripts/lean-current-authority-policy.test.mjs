import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyWriterPath, compareCanonicalText } from './lean-current-authority.mjs';

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
