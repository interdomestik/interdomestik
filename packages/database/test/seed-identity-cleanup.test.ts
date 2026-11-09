import assert from 'node:assert/strict';
import test from 'node:test';
import { PgDialect } from 'drizzle-orm/pg-core';
import { E2E_EMAIL_DOMAIN } from '../src/e2e-users';
import { user } from '../src/schema';
import {
  seedCleanupIdentities,
  seedIdentityCleanupPredicate,
} from '../src/seed-utils/identity-cleanup';

test('the full E2E seed stays at 85 unique identities in one non-sending domain', () => {
  const identities = seedCleanupIdentities();
  assert.equal(identities.length, 85);
  assert.ok(identities.length <= 100);
  assert.equal(new Set(identities.map(identity => identity.id)).size, 85);
  assert.equal(new Set(identities.map(identity => identity.email.trim().toLowerCase())).size, 85);
  for (const identity of identities) {
    assert.ok(identity.email.endsWith(`@${E2E_EMAIL_DOMAIN}`));
    assert.notEqual(identity.email, identity.legacyEmail);
  }
});

test('legacy cleanup SQL requires exact ID, tenant and mailbox together for every identity', () => {
  const predicate = seedIdentityCleanupPredicate(user);
  assert.ok(predicate);
  const query = new PgDialect().sqlToQuery(predicate);
  const identities = seedCleanupIdentities();
  assert.equal(query.params.length, identities.length * 4);
  for (const [i, identity] of identities.entries()) {
    const index = i * 4;
    assert.deepEqual(query.params.slice(index, index + 4), [
      identity.id,
      identity.tenantId,
      identity.email,
      identity.legacyEmail,
    ]);
    const n = index + 1;
    assert.ok(
      query.sql.includes(
        `("user"."id" = $${n} and "user"."tenant_id" = $${n + 1} and "user"."email" in ($${n + 2}, $${n + 3}))`
      )
    );
  }
  assert.doesNotMatch(query.sql, /\blike\b/i);
  assert.ok(!query.params.includes('real.person@interdomestik.com'));
  assert.ok(!query.params.includes('admin.real@interdomestik.com'));
});
