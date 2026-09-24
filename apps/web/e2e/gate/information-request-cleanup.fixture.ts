import {
  and,
  auditLog,
  claimDocuments,
  claimInformationRequestEvidence,
  claimInformationRequests,
  claims,
  claimStageHistory,
  createAdminClient,
  db,
  eq,
  inArray,
} from '@interdomestik/database';
import { expect } from '../fixtures/auth.fixture';
import { hasConfiguredSupabaseStorage } from '@/lib/storage/storage-credentials';

export async function cleanupInformationRequest(claimId: string, tenantId: string) {
  if (!/^s4-[a-f0-9-]{36}$/u.test(claimId)) throw new Error('S4 cleanup identity invalid');
  const [requests, documents] = await Promise.all([
    db
      .select({ id: claimInformationRequests.id })
      .from(claimInformationRequests)
      .where(
        and(
          eq(claimInformationRequests.tenantId, tenantId),
          eq(claimInformationRequests.claimId, claimId)
        )
      ),
    db
      .select({ bucket: claimDocuments.bucket, path: claimDocuments.filePath })
      .from(claimDocuments)
      .where(and(eq(claimDocuments.tenantId, tenantId), eq(claimDocuments.claimId, claimId))),
  ]);
  if (hasConfiguredSupabaseStorage()) {
    for (const bucket of new Set(documents.map(document => document.bucket))) {
      const paths = documents
        .filter(document => document.bucket === bucket)
        .map(document => document.path);
      if (paths.length) await createAdminClient().storage.from(bucket).remove(paths);
    }
  }
  await db.transaction(async tx => {
    if (requests.length) {
      await tx.delete(auditLog).where(
        and(
          eq(auditLog.tenantId, tenantId),
          inArray(
            auditLog.entityId,
            requests.map(row => row.id)
          )
        )
      );
    }
    await tx
      .delete(claimInformationRequestEvidence)
      .where(
        and(
          eq(claimInformationRequestEvidence.tenantId, tenantId),
          eq(claimInformationRequestEvidence.claimId, claimId)
        )
      );
    await tx
      .delete(claimDocuments)
      .where(and(eq(claimDocuments.tenantId, tenantId), eq(claimDocuments.claimId, claimId)));
    await tx
      .delete(claimInformationRequests)
      .where(
        and(
          eq(claimInformationRequests.tenantId, tenantId),
          eq(claimInformationRequests.claimId, claimId)
        )
      );
    await tx
      .delete(claimStageHistory)
      .where(and(eq(claimStageHistory.tenantId, tenantId), eq(claimStageHistory.claimId, claimId)));
    await tx.delete(claims).where(and(eq(claims.tenantId, tenantId), eq(claims.id, claimId)));
  });
  expect(
    await db
      .select({ id: claimInformationRequests.id })
      .from(claimInformationRequests)
      .where(eq(claimInformationRequests.claimId, claimId))
  ).toEqual([]);
  expect(
    await db
      .select({ documentId: claimInformationRequestEvidence.documentId })
      .from(claimInformationRequestEvidence)
      .where(eq(claimInformationRequestEvidence.claimId, claimId))
  ).toEqual([]);
  expect(
    await db
      .select({ id: claimDocuments.id })
      .from(claimDocuments)
      .where(eq(claimDocuments.claimId, claimId))
  ).toEqual([]);
  expect(await db.select({ id: claims.id }).from(claims).where(eq(claims.id, claimId))).toEqual([]);
}
