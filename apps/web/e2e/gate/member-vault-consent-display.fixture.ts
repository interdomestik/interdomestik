import type { TestInfo } from '@playwright/test';
import { claimDocumentAiExtractionConsents, claimDocuments, db, eq } from '@interdomestik/database';
import { randomUUID } from 'node:crypto';

import { resolveSeededClaimContext } from '../utils/seeded-claim-context';

interface MemberVaultConsentFixtureContext {
  claimId: string;
  documentId: string | null;
  documentName: string | null;
  documentPath: string | null;
  privacyVersion: string | null;
  recordedDate: string | null;
}

export async function withMemberVaultConsentFixture(
  testInfo: TestInfo,
  run: (context: MemberVaultConsentFixtureContext) => Promise<void>
) {
  const { claimId, memberId, staffId, tenantId } = await resolveSeededClaimContext(testInfo);
  if (testInfo.project.name !== 'gate-mk-mk') {
    return run({
      claimId,
      documentId: null,
      documentName: null,
      documentPath: null,
      privacyVersion: null,
      recordedDate: null,
    });
  }

  const suffix = randomUUID();
  const documentId = `e2e-mob03a-doc-${suffix}`;
  const consentId = `e2e-mob03a-consent-${suffix}`;
  const documentName = `MOB03A-private-${suffix}.pdf`;
  const documentPath = `e2e/mob03a/${suffix}.pdf`;
  const privacyVersion = `privacy-mob03a-${suffix}`;
  const recordedAt = new Date('2026-07-12T10:00:00.000Z');

  try {
    await db.insert(claimDocuments).values({
      id: documentId,
      tenantId,
      claimId,
      name: documentName,
      filePath: documentPath,
      fileType: 'application/pdf',
      fileSize: 2048,
      bucket: 'claim-evidence',
      classification: 'pii',
      category: 'evidence',
      uploadedBy: staffId,
      createdAt: recordedAt,
    });
    await db.insert(claimDocumentAiExtractionConsents).values({
      id: consentId,
      tenantId,
      subjectId: memberId,
      actorId: staffId,
      claimId,
      documentId,
      consentType: 'ai_document_extraction',
      processingPurpose: 'ai_document_extraction',
      status: 'accepted',
      privacyVersion,
      locale: 'mk',
      sourceSurface: 'e2e_mob_03a',
      recordedAt,
      grantedAt: recordedAt,
    });

    await run({
      claimId,
      documentId,
      documentName,
      documentPath,
      privacyVersion,
      recordedDate: '12.07.2026',
    });
  } finally {
    await db
      .delete(claimDocumentAiExtractionConsents)
      .where(eq(claimDocumentAiExtractionConsents.id, consentId));
    await db.delete(claimDocuments).where(eq(claimDocuments.id, documentId));
  }
}
