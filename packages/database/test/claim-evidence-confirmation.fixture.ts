import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { TestContext } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';

import { claimLifecycleFieldsForStatus } from '../src/claim-lifecycle';
import { openDisposableClient } from '../src/disposable-client';
import {
  aiRuns,
  auditLog,
  branches,
  claimDocumentAiExtractionConsents,
  claimDocuments,
  claimInformationRequestEvidence,
  claimInformationRequests,
  claims,
  user,
} from '../src/schema';
import { mintTestTenantAuthority } from '../src/testing/tenant-authority';
import { quoteIdentifier, TEST_DB_ROLE } from './rls-test-connection';
import { grantRlsTestRole } from './rls-test-grants';
import {
  KS_TENANT_ID,
  MK_TENANT_ID,
  openS8RestrictedSession,
} from './s8-claim-restricted-rls.fixture';

type Persist =
  typeof import('../../../apps/web/src/features/claims/upload/server/claim-document-write').persistClaimDocumentMetadata;
type Db = ReturnType<typeof drizzle>;
export type ProvisionerTx = Parameters<Parameters<Db['transaction']>[0]>[0];

const evidenceTables = [
  'claim_documents',
  'claim_document_ai_extraction_consents',
  'claim_information_requests',
  'claim_information_request_evidence',
  'audit_log',
] as const;
const testRole = quoteIdentifier(TEST_DB_ROLE);

export async function openEvidenceConfirmationFixture(t: TestContext) {
  const session = await openS8RestrictedSession(t, { DB_MAX_CONNECTIONS: '1' });
  if (!session) return null;

  const { adminDb, fixture, dbRls } = session;
  const url = process.env.DATABASE_URL!;
  const peerClient = openDisposableClient(url, { max: 1, applicationName: 'wp19-evidence-peer' });
  const observer = openDisposableClient(url, { max: 1, applicationName: 'wp19-evidence-observer' });
  const peer = drizzle(peerClient);
  const claimIds: string[] = [];
  const requests: string[] = [];
  const memberId = fixture.ks.userId;
  const otherUserId = fixture.newId('evidence_staff');
  const branchId = fixture.newId('evidence_branch');
  const otherBranchId = fixture.newId('evidence_other_branch');

  const cleanup = async () => {
    await adminDb
      .update(claimInformationRequests)
      .set({
        status: 'open',
        fulfilledAt: null,
        fulfilledByStaffId: null,
        fulfilledDocumentId: null,
      })
      .where(inArray(claimInformationRequests.id, requests));
    await adminDb
      .delete(auditLog)
      .where(
        and(
          eq(auditLog.entityType, 'claim_information_request'),
          inArray(auditLog.entityId, requests)
        )
      );
    await adminDb
      .delete(claimDocumentAiExtractionConsents)
      .where(inArray(claimDocumentAiExtractionConsents.claimId, claimIds));
    await adminDb.delete(claimDocuments).where(inArray(claimDocuments.claimId, claimIds));
    await adminDb
      .delete(claimInformationRequests)
      .where(inArray(claimInformationRequests.id, requests));
    await adminDb.delete(claims).where(inArray(claims.id, claimIds));
    await adminDb.delete(branches).where(inArray(branches.id, [branchId, otherBranchId]));
    await adminDb.delete(user).where(eq(user.id, otherUserId));
  };

  t.after(async () => {
    try {
      await cleanup();
    } finally {
      await Promise.all([
        session.close(),
        peerClient.end({ timeout: 2 }),
        observer.end({ timeout: 2 }),
      ]);
    }
  });

  await grantRlsTestRole(adminDb, [...evidenceTables, 'ai_runs']);
  await adminDb.execute(sql.raw(`grant insert on ${evidenceTables.join(', ')} to ${testRole}`));
  await adminDb.execute(sql.raw(`grant update on claim_information_requests to ${testRole}`));
  const [login] = await dbRls.execute<{ role: string; login: string }>(
    sql`select current_user as role, session_user as login`
  );
  assert.deepEqual(login, { role: TEST_DB_ROLE, login: TEST_DB_ROLE });
  await adminDb.insert(user).values({
    id: otherUserId,
    name: 'Evidence staff fixture',
    email: `${otherUserId}@example.test`,
    role: 'staff',
    tenantId: KS_TENANT_ID,
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await adminDb
    .insert(branches)
    .values(
      [branchId, otherBranchId].map(id => ({ id, tenantId: KS_TENANT_ID, name: id, slug: id }))
    );

  // Delay imports of the production adapter until the restricted connection is configured.
  const { persistClaimDocumentMetadata: confirm } =
    await import('../../../apps/web/src/features/claims/upload/server/claim-document-write');
  const { withTenantAuthority } = await import('../src/tenant-authority-context');
  const home = mintTestTenantAuthority(KS_TENANT_ID, { userId: memberId, role: 'member' });
  const successor = mintTestTenantAuthority(MK_TENANT_ID, {
    userId: fixture.mk.userId,
    role: 'admin',
  });

  async function makeClaim(overrides: Partial<typeof claims.$inferInsert> = {}) {
    const id = fixture.newId('evidence_claim');
    claimIds.push(id);
    await adminDb.insert(claims).values({
      userId: memberId,
      staffId: memberId,
      branchId,
      title: 'Evidence confirmation fixture',
      description: 'Synthetic',
      category: 'property',
      companyName: 'Fixture insurer',
      ...claimLifecycleFieldsForStatus('verification'),
      ...overrides,
      id,
      tenantId: KS_TENANT_ID,
    });
    return id;
  }

  async function makeRequest(claimId: string) {
    const id = randomUUID();
    requests.push(id);
    await adminDb.insert(claimInformationRequests).values({
      id,
      tenantId: KS_TENANT_ID,
      claimId,
      correlationId: randomUUID(),
      requestedInformation: 'Estimate',
      explanationForMember: 'Synthetic request',
      responsibleStaffId: otherUserId,
      createdByStaffId: otherUserId,
      dueAt: new Date(),
      slaPosture: 'incomplete',
    });
    return id;
  }

  function input(
    claimId: string,
    options: {
      role?: string;
      actorId?: string;
      branchId?: string | null;
      tenantId?: string;
      informationRequestId?: string;
    } = {}
  ): Parameters<Persist>[0] {
    const {
      role = 'member',
      actorId = memberId,
      tenantId = KS_TENANT_ID,
      informationRequestId,
    } = options;
    const self = role === 'member' || role === 'user' || role === 'agent';
    const fileId = randomUUID();
    return {
      authority: mintTestTenantAuthority(tenantId, {
        userId: actorId,
        role,
        branchId: options.branchId,
      }),
      actorRole: self ? 'member' : role,
      userId: actorId,
      tenantId,
      claimId,
      fileId,
      fileSize: 12,
      category: 'evidence',
      mimeType: 'application/pdf',
      originalName: 'estimate.pdf',
      resolvedBucket: 'claim-evidence',
      storagePath: `pii/tenants/${tenantId}/claims/${claimId}/${fileId}.pdf`,
      logPrefix: '[RLS evidence proof]',
      informationRequestId,
      aiExtractionConsent: self
        ? {
            granted: true,
            locale: 'sq',
            privacyVersion: 'privacy-2026-05',
            sourceSurface: 'member_claim_evidence_upload',
          }
        : undefined,
    };
  }

  async function waitForWaiter(holderPid: number, expiresAt = Date.now() + 3500): Promise<number> {
    const [row] = await observer<{ pid: number }[]>`
      select pid from pg_stat_activity
      where datname = current_database() and ${holderPid}::int = any(pg_blocking_pids(pid))`;
    if (row) return row.pid;
    await delay(20);
    if (Date.now() >= expiresAt) assert.fail(`No PostgreSQL lock waiter for backend ${holderPid}`);
    return waitForWaiter(holderPid, expiresAt);
  }

  async function visibleClaim(claimId: string, authority = home) {
    return withTenantAuthority(authority, tx =>
      tx.select({ id: claims.id }).from(claims).where(eq(claims.id, claimId))
    );
  }

  async function effects(fileId: string, authority = home) {
    return withTenantAuthority(authority, async tx => ({
      documents: (await tx.select().from(claimDocuments).where(eq(claimDocuments.id, fileId)))
        .length,
      consents: (
        await tx
          .select()
          .from(claimDocumentAiExtractionConsents)
          .where(eq(claimDocumentAiExtractionConsents.documentId, fileId))
      ).length,
      links: (
        await tx
          .select()
          .from(claimInformationRequestEvidence)
          .where(eq(claimInformationRequestEvidence.documentId, fileId))
      ).length,
      audits: (
        await tx
          .select()
          .from(auditLog)
          .where(sql`${auditLog.metadata}->>'documentId' = ${fileId}`)
      ).length,
      aiRuns: (await tx.select().from(aiRuns).where(eq(aiRuns.documentId, fileId))).length,
    }));
  }

  return {
    adminDb,
    peer,
    confirm,
    waitForWaiter,
    input,
    makeClaim,
    makeRequest,
    visibleClaim,
    effects,
    memberId,
    otherUserId,
    branchId,
    otherBranchId,
    successor,
    mkUserId: fixture.mk.userId,
  };
}
