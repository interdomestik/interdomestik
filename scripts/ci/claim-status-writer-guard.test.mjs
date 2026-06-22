import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  CLAIM_STATUS_COMPAT_REPAIR_WRITERS,
  CLAIM_STATUS_FIXTURE_WRITERS,
  CLAIM_STATUS_INITIALIZATION_WRITERS,
  CLAIM_STATUS_TRANSITION_WRITERS,
  CLAIM_STATUS_WRITER_ALLOWLIST,
  containsClaimStatusWrite,
  findClaimStatusWriterViolations,
} from '../check-claim-status-writers.mjs';

test('detects direct claims.status updates', () => {
  assert.equal(
    containsClaimStatusWrite(`
      await db
        .update(claims)
        .set({ status: 'resolved', updatedAt: new Date() })
        .where(eq(claims.id, claimId));
    `),
    true
  );
});

test('detects explicit initial claims.status inserts', () => {
  assert.equal(
    containsClaimStatusWrite(`
      await tx.insert(claims).values({
        id: claimId,
        tenantId,
        status: 'submitted',
      });
    `),
    true
  );
});

test('detects raw SQL claims.status updates', () => {
  assert.equal(
    containsClaimStatusWrite(`
      await db.execute(sql\`UPDATE claims SET status = 'resolved' WHERE id = \${claimId}\`);
    `),
    true
  );
  assert.equal(
    containsClaimStatusWrite(`
      db.run(sql\`insert into claims (id, status) values (1, 'draft')\`);
    `),
    true
  );
});

test('ignores claim status reads', () => {
  assert.equal(
    containsClaimStatusWrite(`
      const rows = await db.select({ status: claims.status }).from(claims);
      return rows.map(row => row.status);
    `),
    false
  );
});

test('classifies claim creation and submit as initial status writers', () => {
  assert.deepEqual(
    [...CLAIM_STATUS_INITIALIZATION_WRITERS].sort((a, b) => a.localeCompare(b)),
    ['packages/domain-claims/src/claims/create.ts', 'packages/domain-claims/src/claims/submit.ts']
  );
  assert.equal(
    CLAIM_STATUS_TRANSITION_WRITERS.has('packages/domain-claims/src/claims/create.ts'),
    false
  );
  assert.equal(
    CLAIM_STATUS_FIXTURE_WRITERS.has('packages/domain-claims/src/claims/submit.ts'),
    false
  );
});

test('keeps stale compat repair transition-owned', () => {
  assert.deepEqual([...CLAIM_STATUS_COMPAT_REPAIR_WRITERS], []);
  assert.equal(
    CLAIM_STATUS_TRANSITION_WRITERS.has('packages/domain-claims/src/admin-claims/update-status.ts'),
    false
  );
  assert.equal(
    CLAIM_STATUS_TRANSITION_WRITERS.has('packages/domain-claims/src/claims/transition.ts'),
    true
  );
});

test('initial status writers do not update existing claim statuses', () => {
  for (const writer of CLAIM_STATUS_INITIALIZATION_WRITERS) {
    const source = fs.readFileSync(path.join(process.cwd(), writer), 'utf8');
    assert.equal(hasExistingClaimUpdate(source), false, `${writer} must remain an init writer`);
  }
});

function hasExistingClaimUpdate(source) {
  const compactSource = source.replaceAll(/\s+/gu, '');
  return (
    compactSource.includes('.update(claims)') ||
    compactSource.includes('.update(schema.claims)') ||
    compactSource.toUpperCase().includes('UPDATECLAIMSSET')
  );
}
test('keeps unexpected post-create status writers outside the inventory', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'claim-status-writer-'));
  try {
    const file = path.join(root, 'packages/domain-claims/src/claims/new-writer.ts');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(
      file,
      `
        import { claims } from '@interdomestik/database';
        export async function updateExistingClaim(tx, claimId) {
          return tx.update(claims).set({ status: 'resolved' }).where(eq(claims.id, claimId));
        }
      `
    );

    const result = findClaimStatusWriterViolations(root);
    assert.deepEqual(result.unexpected, ['packages/domain-claims/src/claims/new-writer.ts']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('repo inventory has no unlisted direct claims.status writers', () => {
  const result = findClaimStatusWriterViolations(process.cwd());
  assert.deepEqual(result.unexpected, []);
  assert.deepEqual(result.missing, []);
  assert.equal(result.discovered.length, CLAIM_STATUS_WRITER_ALLOWLIST.size);
});
