import assert from 'node:assert/strict';
import test from 'node:test';

import { containsClaimStatusWrite } from '../check-claim-status-writers.mjs';

test('detects raw SQL updates against the quoted singular claim table', () => {
  assert.equal(
    containsClaimStatusWrite(`
      await db.execute(sql\`UPDATE "claim" SET status = 'resolved' WHERE id = \${claimId}\`);
    `),
    true
  );
});

test('detects raw SQL inserts against the quoted singular claim table', () => {
  assert.equal(
    containsClaimStatusWrite(`
      await db.execute(sql\`
        INSERT INTO "claim" (id, tenant_id, status)
        VALUES (\${claimId}, \${tenantId}, 'draft')
      \`);
    `),
    true
  );
});

test('detects seeded false-negative raw SQL regression for unquoted singular claim table', () => {
  assert.equal(
    containsClaimStatusWrite(`
      await db.execute(sql\`update claim set updated_at = now(), status = 'court' where id = \${id}\`);
    `),
    true
  );
});
