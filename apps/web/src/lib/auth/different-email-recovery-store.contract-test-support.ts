import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { expect } from 'vitest';

import * as store from './different-email-recovery-store';

export const recoverySql = postgres(
  process.env.DIFFERENT_EMAIL_RECOVERY_DATABASE_URL ??
    process.env.DATABASE_URL ??
    'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
  { max: 4 }
);

const owners = new Set<string>();
const challengePattern = (userId: string) => `ida-ui03b:${userId}:%`;

export async function createRecoveryOwner(label: string, email?: string) {
  const id = randomUUID();
  const address = email ?? `ida-ui03b-${label}-${randomUUID()}@example.com`;
  owners.add(id);
  // prettier-ignore
  await recoverySql`insert into "tenants" ("id", "name", "legal_name", "code", "country_code") values ('tenant_ks', 'Kosovo', 'Interdomestik Kosovo', 'KS', 'XK') on conflict ("id") do nothing`;
  // prettier-ignore
  await recoverySql`insert into "user" ("id", "tenant_id", "name", "email", "emailVerified", "role", "tenant_classification_pending", "createdAt", "updatedAt") values (${id}, 'tenant_ks', 'Recovery owner', ${address}, true, 'user', false, now(), now())`;
  return { id, email: address };
}

export async function challengeRows(userId: string) {
  const pattern = challengePattern(userId);
  // prettier-ignore
  return recoverySql<{ identifier: string; value: string }[]>`select "identifier", "value" from "verification" where "identifier" like ${pattern} order by "identifier"`;
}

export async function ownerSnapshot(userId: string) {
  // prettier-ignore
  type Owner = { email: string; emailVerified: boolean; id: string; role: string; tenantId: string };
  // prettier-ignore
  const [row] = await recoverySql<Owner[]>`select "id", "email", "emailVerified", "role", "tenant_id" as "tenantId" from "user" where "id" = ${userId}`;
  return row;
}

async function ownershipSnapshot(userId: string) {
  const [identity, accounts, subscriptions, cards, drafts] = await Promise.all([
    recoverySql`select "id", "tenant_id", "role", "member_number" from "user" where "id" = ${userId}`,
    recoverySql`select "id", "accountId", "providerId", "userId" from "account" where "userId" = ${userId}`,
    recoverySql`select "id", "tenant_id", "user_id", "status", "plan_id" from "subscriptions" where "user_id" = ${userId}`,
    recoverySql`select "id", "tenant_id", "user_id", "subscription_id", "status" from "membership_cards" where "user_id" = ${userId}`,
    recoverySql`select "id", "tenant_id", "access_tenant_id", "owner_user_id", "version" from "free_start_drafts" where "owner_user_id" = ${userId}`,
  ]);
  return { accounts, cards, drafts, identity, subscriptions };
}

async function stageReplacement(userId: string, currentEmail: string, target: string, tag: string) {
  const current = randomUUID(),
    replacement = randomUUID();
  // prettier-ignore
  expect(await store.reserveCurrentProof({ currentEmail, digest: `${tag}-c`, nonce: current, now: new Date(0), userId })).toEqual({ ok: true });
  expect(await store.activateCurrentProof(userId, current, currentEmail, new Date(0))).toBe(true);
  // prettier-ignore
  expect(await store.reserveReplacementProof({ currentDigest: `${tag}-c`, newEmail: target, nonce: replacement, now: new Date(0), replacementDigest: `${tag}-r`, userId })).toEqual({ ok: true });
  expect(await store.activateReplacementProof(userId, replacement, new Date(0))).toBe(true);
  return replacement;
}

export async function proveOwnerGraphAndConcurrentWriter() {
  const owner = await createRecoveryOwner('continuity');
  // prettier-ignore
  const [accountId, subscriptionId, cardId, draftId] = Array.from({ length: 4 }, () => randomUUID()) as [string, string, string, string];
  await recoverySql`update "user" set "role" = 'member', "member_number" = ${'IDA-' + owner.id} where "id" = ${owner.id}`;
  await recoverySql`insert into "account" ("id", "accountId", "providerId", "userId", "createdAt", "updatedAt") values (${accountId}, ${accountId}, 'credential', ${owner.id}, now(), now())`;
  await recoverySql`insert into "subscriptions" ("id", "tenant_id", "user_id", "status", "plan_id", "provider") values (${subscriptionId}, 'tenant_ks', ${owner.id}, 'active', 'ida-proof', 'paddle')`;
  await recoverySql`insert into "membership_cards" ("id", "tenant_id", "user_id", "subscription_id", "status", "card_number", "qr_code_token") values (${cardId}, 'tenant_ks', ${owner.id}, ${subscriptionId}, 'active', ${cardId}, ${randomUUID()})`;
  await recoverySql`insert into "free_start_drafts" ("id", "tenant_id", "access_tenant_id", "owner_user_id", "client_request_id", "category", "resume_step") values (${draftId}, 'tenant_ks', 'tenant_ks', ${owner.id}, ${randomUUID()}, 'vehicle', 'category')`;
  const before = await ownershipSnapshot(owner.id);
  const firstTarget = `first-${owner.email}`,
    finalTarget = `final-${owner.email}`;
  const superseded = await stageReplacement(owner.id, owner.email, firstTarget, 'first');
  await stageReplacement(owner.id, owner.email, finalTarget, 'final');
  expect(await store.activateReplacementProof(owner.id, superseded, new Date(0))).toBe(false);
  const confirms = await Promise.all([
    store.confirmReplacementProof(owner.id, () => 'final-r', new Date(0)),
    store.confirmReplacementProof(owner.id, () => 'final-r', new Date(0)),
  ]);
  expect(confirms.filter(result => result.ok)).toHaveLength(1);
  expect(await ownershipSnapshot(owner.id)).toEqual(before);
  expect(await challengeRows(owner.id)).toHaveLength(0);

  const blockedTarget = `blocked-${owner.email}`;
  await stageReplacement(owner.id, finalTarget, blockedTarget, 'blocked');
  const writerId = randomUUID();
  owners.add(writerId);
  let writerReady!: () => void, releaseWriter!: () => void;
  const ready = new Promise<void>(resolve => (writerReady = resolve));
  const release = new Promise<void>(resolve => (releaseWriter = resolve));
  const writer = recoverySql.begin(async tx => {
    await tx`lock table "user" in row exclusive mode`;
    await tx`insert into "user" ("id", "tenant_id", "name", "email", "emailVerified", "role", "tenant_classification_pending", "createdAt", "updatedAt") values (${writerId}, 'tenant_ks', 'Concurrent writer', ${blockedTarget}, true, 'user', false, now(), now())`;
    writerReady();
    await release;
  });
  await ready;
  const blockedConfirm = store.confirmReplacementProof(owner.id, () => 'blocked-r', new Date(0));
  let serialized = false;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const [waiting] =
      await recoverySql`select exists(select 1 from pg_stat_activity where wait_event_type = 'Lock' and query ilike 'lock table %user%') as value`;
    // prettier-ignore
    if (waiting?.value) { serialized = true; break; }
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  expect(serialized).toBe(true);
  releaseWriter();
  await writer;
  expect(await blockedConfirm).toEqual({ ok: false });
  expect(await ownerSnapshot(owner.id)).toMatchObject({ email: finalTarget, id: owner.id });
  expect(await ownershipSnapshot(owner.id)).toEqual(before);

  await recoverySql.unsafe(
    'do $$ begin create role ida_ui03b_owner_rls nologin; exception when duplicate_object then null; end $$; grant select, update, delete on table "free_start_drafts" to ida_ui03b_owner_rls;'
  );
  const rls = await recoverySql.begin(async tx => {
    await tx.unsafe('set local role ida_ui03b_owner_rls');
    await tx`select set_config('app.current_tenant_id', 'tenant_ks', true), set_config('app.current_access_tenant_id', 'tenant_ks', true), set_config('app.current_actor_id', ${owner.id}, true)`;
    const listed = await tx`select "id" from "free_start_drafts"`,
      resumed =
        await tx`select "id", "owner_user_id", "version" from "free_start_drafts" where "id" = ${draftId}`;
    const updated =
      await tx`update "free_start_drafts" set "resume_step" = 'details', "version" = "version" + 1 where "id" = ${draftId} and "version" = 1 returning "id", "owner_user_id", "version"`;
    const deleted =
      await tx`delete from "free_start_drafts" where "id" = ${draftId} and "version" = 2 returning "id"`;
    return { deleted, listed, resumed, updated };
  });
  // prettier-ignore
  expect(rls).toMatchObject({ deleted: [{ id: draftId }], listed: [{ id: draftId }], resumed: [{ id: draftId, owner_user_id: owner.id, version: 1 }], updated: [{ id: draftId, owner_user_id: owner.id, version: 2 }] });
}

export async function cleanupRecoveryRows() {
  for (const id of owners) {
    const pattern = challengePattern(id);
    await recoverySql`delete from "verification" where "identifier" like ${pattern}`;
    await recoverySql`delete from "free_start_drafts" where "owner_user_id" = ${id}`;
    await recoverySql`delete from "membership_cards" where "user_id" = ${id}`;
    await recoverySql`delete from "subscriptions" where "user_id" = ${id}`;
    await recoverySql`delete from "session" where "userId" = ${id}`;
    await recoverySql`delete from "account" where "userId" = ${id}`;
    await recoverySql`delete from "user" where "id" = ${id}`;
  }
  owners.clear();
}
