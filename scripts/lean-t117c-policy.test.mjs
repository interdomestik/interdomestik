import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
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
  'apps/web/src/app/[locale]/components/home/footer.test.tsx',
  'apps/web/src/app/[locale]/components/home/footer.tsx',
  'apps/web/src/app/[locale]/components/home/free-start-intake-shell/use-draft-lifecycle.ts',
  'apps/web/src/app/[locale]/layout.tsx',
  'apps/web/src/app/[locale]/stats/page.tsx',
  'apps/web/src/app/api/claims/route.ts',
  'apps/web/src/app/api/csp-report/route.ts',
  'apps/web/src/app/api/e2e/branches/route.ts',
  'apps/web/src/app/track/[token]/page.test.tsx',
  'apps/web/src/app/track/[token]/page.tsx',
  'apps/web/src/components/dashboard/member-portal-runtime-boundary.test.tsx',
  'apps/web/src/components/dashboard/member-portal-runtime.tsx',
  'apps/web/src/components/shell/request-boundary.test.tsx',
  'apps/web/src/components/shell/request-boundary.tsx',
  'apps/web/src/instrumentation.ts',
  'apps/web/src/lib/rendering-build-mode.test.ts',
  'apps/web/src/lib/rendering-build-mode.ts',
];
const s = {
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

test('T117C accepts the frozen 45-path map', () => {
  assert.equal(writers.length, 45);
  assert.equal(
    createHash('sha256').update(JSON.stringify(writers)).digest('hex'),
    'b92e38a0712d08f188630d282f49bb4034aac2388573a061a4043985bc174f17'
  );
  assert.equal(validateSlice(s), s);
  for (const p of writers) assert.equal(classifyWriterPath(p, s).allowed, true, p);
  assert.match(
    approvalMarker(s, '1'.repeat(40), '2'.repeat(40)),
    /^LEAN_AUTHORITY_APPROVAL_V1\n/
  );
  for (const invalid of [
    { ...s, sliceId: 'T-117C-COPY' },
    { ...s, tier: 2 },
    { ...s, productWriterPaths: [...writers].reverse() },
    { ...s, productWriterPaths: writers.slice(1) },
    { ...s, productWriterPaths: writers.filter(p => !p.includes('/home/footer.')) },
    { ...s, productWriterPaths: writers.filter(p => !p.includes('/track/[token]/')) },
    { ...s, productWriterPaths: [...writers, 'apps/web/src/proxy.ts'] },
    {
      ...s,
      productWriterPaths: writers.map((p, i) => (i ? p : 'apps/web/src/proxy.ts')),
    },
    { ...s, productWriterPaths: [...writers.slice(1), writers[1]] },
    { ...s, closeoutWriterPaths: [] },
  ])
    assert.throws(() => validateSlice(invalid), /schema or policy mismatch/);
  assert.equal(classifyWriterPath('apps/web/src/proxy.ts', s).allowed, false);
  assert.equal(classifyWriterPath('apps/web/next.config.mjs').allowed, false);
});

test('T117C requires the verified closed CUTOVER predecessor', () => {
  const prior = JSON.parse(
    fs.readFileSync(
      new URL('../docs/plans/2026-08-28-t117b-cutover-admission.json', import.meta.url),
      'utf8'
    )
  );
  assert.equal(prior.sliceId, 'T117B-CUTOVER');
  assert.equal(prior.writerPaths.length, 21);
  const hash = createHash('sha256').update(JSON.stringify(prior.writerPaths)).digest('hex');
  assert.equal(hash, prior.productWriterMapSha256);
  const evidence = {
    status: 'verified',
    childId: 'T-117C',
    predecessorSliceId: 'T117B-CUTOVER',
    predecessorWriterMapSha256: hash,
    productPrNumber: 1690,
    productState: 'CLOSED',
    productMerged: true,
    productHeadSha: '1'.repeat(40),
    productHeadTree: '2'.repeat(40),
    productMergeSha: '3'.repeat(40),
    closeoutMergeSha: '4'.repeat(40),
    closeoutState: 'deterministic_closeout_recorded',
  };
  assert.equal(validT117BPredecessor(s), false);
  assert.equal(validT117BPredecessor(s, evidence), true);
  for (const change of [
    { status: 'unavailable' },
    { predecessorSliceId: 'T117B-PORTAL' },
    { predecessorWriterMapSha256: '0'.repeat(64) },
    { productMerged: false },
    { productState: 'OPEN' },
    { productState: 'MERGED' },
    { closeoutMergeSha: '' },
    { closeoutMergeSha: 'not-a-sha' },
    { productPrNumber: 0 },
    { productHeadTree: '' },
    { productMergeSha: '' },
    { closeoutState: 'pending' },
    { productHeadSha: '' },
    { childId: 'T117B-CUTOVER' },
  ])
    assert.equal(validT117BPredecessor(s, { ...evidence, ...change }), false);
});
