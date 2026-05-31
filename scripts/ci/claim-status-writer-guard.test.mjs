import assert from 'node:assert/strict';
import test from 'node:test';

import {
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

test('repo inventory has no unlisted direct claims.status writers', () => {
  const result = findClaimStatusWriterViolations(process.cwd());
  assert.deepEqual(result.unexpected, []);
  assert.deepEqual(result.missing, []);
  assert.equal(result.discovered.length, CLAIM_STATUS_WRITER_ALLOWLIST.size);
});
