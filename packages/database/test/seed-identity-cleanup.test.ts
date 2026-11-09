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

test('KS overlay only matches catalogue tuples, never a pack ID with a real mailbox or other tenant', () => {
  const query = new PgDialect().sqlToQuery(seedIdentityCleanupPredicate(user, ['pack_ks_'])!);
  assert.doesNotMatch(query.sql, /\blike\b/i);
  assert.equal(query.params.length, 27 * 4);
  const tuples = Array.from({ length: 27 }, (_, i) => query.params.slice(i * 4, i * 4 + 4));
  const matches = (id: string, tenant: string, email: string) =>
    tuples.some(
      tuple => tuple[0] === id && tuple[1] === tenant && (tuple[2] === email || tuple[3] === email)
    );
  assert.equal(
    matches('pack_ks_member_1', 'tenant_ks', 'ks.member.pack.1@plan070.example.invalid'),
    true
  );
  assert.equal(
    matches('pack_ks_member_1', 'tenant_ks', 'ks.member.pack.1@interdomestik.com'),
    true
  );
  assert.equal(matches('pack_ks_member_1', 'tenant_ks', 'real@example.com'), false);
  assert.equal(
    matches('pack_ks_member_1', 'tenant_mk', 'ks.member.pack.1@interdomestik.com'),
    false
  );
  const empty = new PgDialect().sqlToQuery(seedIdentityCleanupPredicate(user, ['unrecognised'])!);
  assert.equal(empty.sql, 'false');
});

test('workload cleanup uses exact workload tuples and does not widen E2E cleanup', () => {
  const query = new PgDialect().sqlToQuery(seedIdentityCleanupPredicate(user, ['work_'])!);
  assert.equal(query.params.length, 59 * 4);
  assert.doesNotMatch(query.sql, /\blike\b/i);
  const tuples = Array.from({ length: 59 }, (_, i) => query.params.slice(i * 4, i * 4 + 4));
  const matches = (id: string, tenant: string, email: string) =>
    tuples.some(tuple => tuple[0] === id && tuple[1] === tenant && tuple[2] === email);
  assert.equal(matches('work_ks_member_1', 'tenant_ks', 'member.ks.work1@example.com'), true);
  assert.equal(matches('work_mk_mgr', 'tenant_mk', 'mgr.mk.work@example.com'), true);
  assert.equal(matches('real-user', 'tenant_ks', 'member.ks.work1@example.com'), false);
  assert.equal(matches('work_ks_member_1', 'tenant_ks', 'real.person@example.com'), false);
  assert.equal(matches('work_ks_member_1', 'tenant_mk', 'member.ks.work1@example.com'), false);
  const e2e = new PgDialect().sqlToQuery(seedIdentityCleanupPredicate(user)!);
  assert.ok(!e2e.params.includes('work_ks_member_1'));
});
