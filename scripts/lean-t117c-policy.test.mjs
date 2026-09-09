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

const paths = [
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
  'apps/web/src/app/[locale]/(auth)/login/page.tsx',
  'apps/web/src/app/[locale]/(auth)/register/page.tsx',
  'apps/web/src/app/[locale]/(site)/nps/[token]/page.tsx',
  'apps/web/src/app/[locale]/(site)/pricing/page.tsx',
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
  'apps/web/src/components/pricing/business-lead-form.test.tsx',
  'apps/web/src/components/pricing/business-lead-form.tsx',
  'apps/web/src/components/shell/request-boundary.test.tsx',
  'apps/web/src/components/shell/request-boundary.tsx',
  'apps/web/src/instrumentation.ts',
  'apps/web/src/lib/rendering-build-mode.test.ts',
  'apps/web/src/lib/rendering-build-mode.ts',
];
const regressionRepairPaths = new Set([
  'apps/web/src/app/[locale]/(auth)/login/page.tsx',
  'apps/web/src/app/[locale]/(auth)/register/page.tsx',
  'apps/web/src/app/[locale]/(site)/nps/[token]/page.tsx',
  'apps/web/src/app/[locale]/(site)/pricing/page.tsx',
  'apps/web/src/components/pricing/business-lead-form.test.tsx',
  'apps/web/src/components/pricing/business-lead-form.tsx',
]);
const slice = {
  sliceId: 'T-117C',
  tier: 3,
  promotionPrNumber: 1700,
  promotionBaseSha: '0'.repeat(40),
  expectedProductBranch: 'codex/t117c-rendering',
  gateSha256: 'a'.repeat(64),
  admissionSha256: 'b'.repeat(64),
  productWriterPaths: paths,
  closeoutWriterPaths: ['docs/plans/current-program.md', 'docs/plans/current-tracker.md'],
};

test('T117C accepts 51-path map', () => {
  assert.equal(paths.length, 51);
  assert.equal(
    createHash('sha256').update(JSON.stringify(paths)).digest('hex'),
    '34b78b5355079747ae1166d70a955be94faaff2e7599492daa8b10fc96a1bc1b'
  );
  assert.equal(validateSlice(slice), slice);
  for (const p of paths) assert.equal(classifyWriterPath(p, slice).allowed, true, p);
  assert.match(
    approvalMarker(slice, '1'.repeat(40), '2'.repeat(40)),
    /^LEAN_AUTHORITY_APPROVAL_V1\n/
  );
  for (const invalid of [
    { ...slice, sliceId: 'T-117C-COPY' },
    { ...slice, tier: 2 },
    { ...slice, productWriterPaths: [...paths].reverse() },
    { ...slice, productWriterPaths: paths.slice(1) },
    { ...slice, productWriterPaths: paths.filter(p => !p.includes('/home/footer.')) },
    { ...slice, productWriterPaths: paths.filter(p => !p.includes('/track/[token]/')) },
    { ...slice, productWriterPaths: [...paths, 'apps/web/src/proxy.ts'] },
    {
      ...slice,
      productWriterPaths: paths.map((p, i) => (i ? p : 'apps/web/src/proxy.ts')),
    },
    { ...slice, productWriterPaths: [...paths.slice(1), paths[1]] },
    { ...slice, closeoutWriterPaths: [] },
  ])
    assert.throws(() => validateSlice(invalid), /schema or policy mismatch/);
  assert.equal(classifyWriterPath('apps/web/src/proxy.ts', slice).allowed, false);
  assert.equal(classifyWriterPath('apps/web/next.config.mjs').allowed, false);
});

test('T117C retains its historical 44- and 45-path maps for authority replay', () => {
  const historical45 = {
    ...slice,
    productWriterPaths: paths.filter(p => !regressionRepairPaths.has(p)),
  };
  assert.equal(historical45.productWriterPaths.length, 45);
  assert.equal(
    createHash('sha256').update(JSON.stringify(historical45.productWriterPaths)).digest('hex'),
    'b92e38a0712d08f188630d282f49bb4034aac2388573a061a4043985bc174f17'
  );
  assert.equal(validateSlice(historical45), historical45);

  const historical44 = {
    ...slice,
    productWriterPaths: historical45.productWriterPaths.filter(
      p => !p.endsWith('/use-draft-lifecycle.ts')
    ),
  };
  assert.equal(historical44.productWriterPaths.length, 44);
  assert.equal(
    createHash('sha256').update(JSON.stringify(historical44.productWriterPaths)).digest('hex'),
    '5cb7ef250dab08aa31b5acb7949c915819653febb2326de1fd821edd29bb0118'
  );
  assert.equal(validateSlice(historical44), historical44);
});

test('T117C requires closed CUTOVER predecessor', () => {
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
  assert.equal(validT117BPredecessor(slice), false);
  assert.equal(validT117BPredecessor(slice, evidence), true);
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
    assert.equal(validT117BPredecessor(slice, { ...evidence, ...change }), false);
});
