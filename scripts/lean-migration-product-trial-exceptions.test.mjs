import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyWriterPath, validateSlice } from './lean-current-authority-policy.mjs';
import { resolveAuthority } from './lean-current-authority-lifecycle.mjs';

const maps = [
  [
    'MIGRATION-CURRENCY-PARSING-TRIAL-1',
    [
      'packages/domain-ai/src/claims/intake-extract.test.ts',
      'packages/domain-ai/src/claims/intake-extract.ts',
    ],
  ],
];

function slice(sliceId, productWriterPaths) {
  return {
    sliceId,
    tier: 3,
    promotionPrNumber: 1,
    promotionBaseSha: '0'.repeat(40),
    expectedProductBranch: 'codex/migration-product-trial',
    gateSha256: 'a'.repeat(64),
    admissionSha256: 'b'.repeat(64),
    productWriterPaths,
    closeoutWriterPaths: ['docs/plans/current-program.md', 'docs/plans/current-tracker.md'],
  };
}

test('admits only the exact currency migration product-trial map', () => {
  for (const [sliceId, writers] of maps) {
    const valid = slice(sliceId, writers);
    assert.doesNotThrow(() => validateSlice(valid));
    for (const path of writers) {
      assert.deepEqual(classifyWriterPath(path, valid), {
        allowed: true,
        classification: 'tier3_migration_product_trial',
      });
    }
    for (const invalid of [
      { ...valid, tier: 2 },
      { ...valid, sliceId: `${sliceId}-OTHER` },
      { ...valid, productWriterPaths: writers.slice(1) },
      { ...valid, productWriterPaths: [...writers].reverse() },
      { ...valid, productWriterPaths: [...writers, 'packages/database/src/tenant.ts'] },
    ]) {
      assert.throws(() => validateSlice(invalid), /schema or policy mismatch/);
    }
  }
});

test('keeps adjacent protected AI and tenant paths denied', () => {
  const valid = slice(maps[0][0], maps[0][1]);
  for (const path of [
    'packages/domain-ai/src/claims/summary.ts',
    'apps/web/src/lib/ai/claim-pipeline-run.ts',
    'packages/database/src/tenant.ts',
  ]) {
    assert.equal(classifyWriterPath(path, valid).allowed, false);
  }
});

test('recognized maps grant no runtime before exact owner promotion', () => {
  for (const [sliceId, writers] of maps) {
    const result = resolveAuthority(
      {
        schemaVersion: 1,
        authority: 'lean-tier12-v1',
        lifecycle: 'promotion_pending',
        owner: { login: 'arbenl', id: 62884977 },
        activeSlice: slice(sliceId, writers),
      },
      {}
    );
    assert.equal(result.runtimeAuthorized, false);
    assert.equal(result.reason, 'promotion_identity_mismatch');
  }
});
