import assert from 'node:assert/strict';
import test from 'node:test';
import {
  approvalMarker,
  classifyWriterPath,
  validateSlice,
} from './lean-current-authority-policy.mjs';
import { validT117BPredecessor } from './lean-exact-writer-exceptions.mjs';

const writers = [
  'apps/web/e2e/gate/member-home-cta.spec.ts',
  'apps/web/e2e/gate/member-parallel-routes.spec.ts',
  'apps/web/e2e/gate/rendering-build-mode.spec.ts',
  'apps/web/next.config.mjs',
  'apps/web/src/app/[locale]/_core.entry.test.tsx',
  'apps/web/src/app/[locale]/_core.entry.tsx',
  'apps/web/src/app/[locale]/(agent)/agent/layout.tsx',
  'apps/web/src/app/[locale]/(app)/layout.tsx',
  'apps/web/src/app/[locale]/(app)/member/(portal)/@actions/default.tsx',
  'apps/web/src/app/[locale]/(app)/member/(portal)/@actions/page.tsx',
  'apps/web/src/app/[locale]/(app)/member/(portal)/@case/default.tsx',
  'apps/web/src/app/[locale]/(app)/member/(portal)/@case/page.tsx',
  'apps/web/src/app/[locale]/(app)/member/(portal)/@updates/default.tsx',
  'apps/web/src/app/[locale]/(app)/member/(portal)/@updates/page.tsx',
  'apps/web/src/app/[locale]/(app)/member/(portal)/default.tsx',
  'apps/web/src/app/[locale]/(app)/member/(portal)/layout.tsx',
  'apps/web/src/app/[locale]/(app)/member/(portal)/page.tsx',
  'apps/web/src/app/[locale]/(app)/member/(portal)/portal-context.test.ts',
  'apps/web/src/app/[locale]/(app)/member/(portal)/portal-context.ts',
  'apps/web/src/app/[locale]/(app)/member/layout.tsx',
  'apps/web/src/app/[locale]/(app)/member/page.test.tsx',
  'apps/web/src/app/[locale]/(app)/member/page.tsx',
  'apps/web/src/app/[locale]/(staff)/staff/layout.tsx',
  'apps/web/src/app/[locale]/admin/commissions/page.tsx',
  'apps/web/src/app/[locale]/admin/layout.tsx',
  'apps/web/src/app/[locale]/admin/members/number/[memberNumber]/page.tsx',
  'apps/web/src/app/[locale]/admin/settings/page.tsx',
  'apps/web/src/app/[locale]/admin/users/[id]/page.tsx',
  'apps/web/src/app/[locale]/layout.tsx',
  'apps/web/src/app/[locale]/stats/page.tsx',
  'apps/web/src/app/api/claims/route.ts',
  'apps/web/src/app/api/csp-report/route.ts',
  'apps/web/src/app/api/e2e/branches/route.ts',
  'apps/web/src/components/dashboard/member-portal-runtime-boundary.test.tsx',
  'apps/web/src/components/dashboard/member-portal-runtime.tsx',
  'apps/web/src/components/shell/request-boundary.test.tsx',
  'apps/web/src/components/shell/request-boundary.tsx',
  'apps/web/src/instrumentation.ts',
  'apps/web/src/lib/rendering-build-mode.test.ts',
  'apps/web/src/lib/rendering-build-mode.ts',
];
const slice = {
  sliceId: 'T-117C',
  tier: 3,
  promotionPrNumber: 1700,
  promotionBaseSha: '0'.repeat(40),
  expectedProductBranch: 'codex/t117c-rendering',
  gateSha256: 'a'.repeat(64),
  admissionSha256: 'b'.repeat(64),
  productWriterPaths: writers,
  closeoutWriterPaths: ['docs/plans/current-program.md', 'docs/plans/current-tracker.md'],
};

test('T117C accepts only the frozen 40-path rendering map', () => {
  assert.equal(validateSlice(slice), slice);
  for (const path of writers) assert.equal(classifyWriterPath(path, slice).allowed, true, path);
  assert.match(
    approvalMarker(slice, '1'.repeat(40), '2'.repeat(40)),
    /^LEAN_AUTHORITY_APPROVAL_V1\n/
  );
  for (const invalid of [
    { ...slice, sliceId: 'T-117C-COPY' },
    { ...slice, tier: 2 },
    { ...slice, productWriterPaths: [...writers].reverse() },
    { ...slice, productWriterPaths: writers.slice(1) },
    { ...slice, productWriterPaths: [...writers, 'apps/web/src/proxy.ts'] },
    {
      ...slice,
      productWriterPaths: writers.map((path, i) => (i ? path : 'apps/web/src/proxy.ts')),
    },
    { ...slice, productWriterPaths: [...writers.slice(1), writers[1]] },
    { ...slice, closeoutWriterPaths: [] },
  ])
    assert.throws(() => validateSlice(invalid), /schema or policy mismatch/);
  assert.equal(classifyWriterPath('apps/web/src/proxy.ts', slice).allowed, false);
  assert.equal(classifyWriterPath('apps/web/next.config.mjs').allowed, false);
});

test('T117C requires the verified closed 21-path CUTOVER predecessor', () => {
  const evidence = {
    status: 'verified',
    childId: 'T-117C',
    predecessorSliceId: 'T117B-CUTOVER',
    predecessorWriterMapSha256: '2ad45d3a297b0bc686594f4d2855a38dfbe3c825446ae740682fe7a1fb2d440b',
    productPrNumber: 1690,
    productState: 'CLOSED',
    productMerged: true,
    productHeadSha: '1'.repeat(40),
    productHeadTree: '2'.repeat(40),
    productMergeSha: '3'.repeat(40),
    closeoutMergeSha: '4'.repeat(40),
    closeoutState: 'deterministic_closeout_recorded',
  };
  assert.equal(validT117BPredecessor(slice), false);
  assert.equal(validT117BPredecessor(slice, evidence), true);
  for (const change of [
    { status: 'unavailable' },
    { predecessorSliceId: 'T117B-PORTAL' },
    { predecessorWriterMapSha256: '0'.repeat(64) },
    { productMerged: false },
    { closeoutState: 'pending' },
    { productHeadSha: '' },
    { childId: 'T117B-CUTOVER' },
  ])
    assert.equal(validT117BPredecessor(slice, { ...evidence, ...change }), false);
});
