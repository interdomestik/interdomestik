import { randomUUID } from 'node:crypto';
import {
  and,
  claimDocuments,
  claims,
  commercialActionIdempotency,
  createAdminClient,
  db,
  E2E_USER_IDS,
  E2E_USERS,
  eq,
  inArray,
  memberLeads,
  user,
  type E2EUserKey,
} from '@interdomestik/database';
import { expect } from '@playwright/test';
import { resolveEvidenceBucketName } from '../../src/lib/storage/evidence-bucket';

export async function requireDoorActor(actor: E2EUserKey) {
  const row = await db.query.user.findFirst({ where: eq(user.id, E2E_USER_IDS[actor]) });
  if (!row) throw new Error(`Missing seeded actor ${actor}`);
  expect(row.tenantId).toBe(E2E_USERS[actor].tenantId);
  expect(row.role).toBe(E2E_USERS[actor].dbRole);
  return { id: row.id, tenantId: row.tenantId, role: row.role, branchId: row.branchId ?? null };
}

export type DoorClaim = typeof claims.$inferSelect;
export async function createDoorClaim(
  member: E2EUserKey,
  overrides: Partial<Pick<DoorClaim, 'branchId' | 'staffId' | 'caseLifecycleState'>> = {}
): Promise<DoorClaim> {
  const owner = await requireDoorActor(member);
  if (!owner.tenantId) throw new Error('Seeded owner lacks tenant');
  const [claim] = await db
    .insert(claims)
    .values({
      id: `one_door_${randomUUID()}`,
      tenantId: owner.tenantId,
      accessTenantId: owner.tenantId,
      userId: owner.id,
      branchId: owner.branchId,
      staffId: null,
      title: 'One-door isolated upload test',
      category: 'vehicle',
      companyName: 'Test Insurer',
      caseLifecycleState: 'submitted',
      recoveryLifecycleState: 'not_started',
      ...overrides,
    })
    .returning();
  return claim;
}

export function doorDocuments(claimId: string) {
  return db.query.claimDocuments.findMany({ where: eq(claimDocuments.claimId, claimId) });
}

export async function doorObjects(claim: DoorClaim): Promise<string[]> {
  const prefix = `pii/tenants/${claim.tenantId}/claims/${claim.id}`;
  const result = await createAdminClient()
    .storage.from(resolveEvidenceBucketName())
    .list(prefix, { limit: 1000 });
  if (result.error) throw result.error;
  return (result.data ?? [])
    .map(object => `${prefix}/${object.name}`)
    .sort((left, right) => left.localeCompare(right));
}

export async function assertDoorDocumentMetadata(
  claim: DoorClaim,
  name: string,
  actor: E2EUserKey,
  bytes: Buffer
) {
  await expect
    .poll(async () => (await doorDocuments(claim.id)).filter(row => row.name === name).length)
    .toBe(1);
  const row = (await doorDocuments(claim.id)).find(document => document.name === name);
  if (!row) throw new Error(`Door document ${name} was not persisted`);
  expect(row).toMatchObject({
    tenantId: claim.tenantId,
    claimId: claim.id,
    uploadedBy: E2E_USER_IDS[actor],
    fileSize: bytes.length,
  });
  expect(row.filePath).toContain(`/tenants/${claim.tenantId}/claims/${claim.id}/`);
  return row;
}

export async function assertStoredDoorDocument(
  document: typeof claimDocuments.$inferSelect,
  bytes: Buffer
): Promise<void> {
  const stored = await createAdminClient()
    .storage.from(document.bucket)
    .download(document.filePath);
  if (stored.error || !stored.data) throw stored.error ?? new Error('Missing stored object');
  expect(Buffer.from(await stored.data.arrayBuffer())).toEqual(bytes);
}

export async function removeDoorClaim(claim: DoorClaim, realStorage: boolean): Promise<void> {
  const paths = realStorage ? await doorObjects(claim) : [];
  if (paths.length) {
    const removed = await createAdminClient()
      .storage.from(resolveEvidenceBucketName())
      .remove(paths);
    if (removed.error) throw removed.error;
  }
  await db.delete(claimDocuments).where(eq(claimDocuments.claimId, claim.id));
  await db.delete(claims).where(eq(claims.id, claim.id));
}

export async function businessEffects(email: string, key: string) {
  const [leads, reservations] = await Promise.all([
    db.query.memberLeads.findMany({ where: eq(memberLeads.email, email) }),
    db.query.commercialActionIdempotency.findMany({
      where: and(
        eq(commercialActionIdempotency.action, 'business-membership.submit'),
        eq(commercialActionIdempotency.idempotencyKey, key)
      ),
    }),
  ]);
  return { leads, reservations };
}

export async function removeBusinessEffects(email: string, keys: string[]): Promise<void> {
  await db.delete(memberLeads).where(eq(memberLeads.email, email));
  if (keys.length)
    await db
      .delete(commercialActionIdempotency)
      .where(
        and(
          eq(commercialActionIdempotency.action, 'business-membership.submit'),
          inArray(commercialActionIdempotency.idempotencyKey, keys)
        )
      );
}
