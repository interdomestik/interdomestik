import { buildVaultConsentDisplay, type VaultConsentDisplay } from '@interdomestik/domain-claims';
import { db } from '@interdomestik/database';
import {
  claimDocumentAiExtractionConsents,
  claimDocuments,
  tenants,
} from '@interdomestik/database/schema';
import { and, desc, eq, inArray } from 'drizzle-orm';
import 'server-only';

export interface GetMemberVaultConsentDisplayParams {
  tenantId: string;
  memberId: string;
  claimId: string;
  claimCategory: string;
  piiStatus: 'available' | 'erased_or_unavailable';
}

export async function getMemberVaultConsentDisplay(
  params: GetMemberVaultConsentDisplayParams
): Promise<VaultConsentDisplay> {
  // db-access-guard: tenant-scoped -- reason: tenant identity is resolved by the authorized member claim-detail boundary before this exact tenant gate
  const tenantRows = await db
    .select({ code: tenants.code, countryCode: tenants.countryCode })
    .from(tenants)
    .where(eq(tenants.id, params.tenantId))
    .limit(1);
  const tenant = tenantRows[0];
  const gated = buildVaultConsentDisplay({
    tenantCode: tenant?.code ?? null,
    tenantCountryCode: tenant?.countryCode ?? null,
    claimCategory: params.claimCategory,
    piiStatus: params.piiStatus,
    documents: [],
    consents: [],
  });
  if (gated.kind !== 'ready') return gated;

  // db-access-guard: tenant-scoped -- reason: exact MK tenant gate passed and the claim was already resolved through the member-scoped claim-detail query
  const documents = await db
    .select({
      id: claimDocuments.id,
      category: claimDocuments.category,
      createdAt: claimDocuments.createdAt,
    })
    .from(claimDocuments)
    .where(
      and(
        eq(claimDocuments.tenantId, params.tenantId),
        eq(claimDocuments.claimId, params.claimId),
        eq(claimDocuments.category, 'evidence')
      )
    );
  if (documents.length === 0) return gated;

  // db-access-guard: tenant-scoped -- reason: exact tenant, member, claim, document, consent-type, and purpose predicates bound this read
  const consents = await db
    .select({
      id: claimDocumentAiExtractionConsents.id,
      documentId: claimDocumentAiExtractionConsents.documentId,
      consentType: claimDocumentAiExtractionConsents.consentType,
      processingPurpose: claimDocumentAiExtractionConsents.processingPurpose,
      status: claimDocumentAiExtractionConsents.status,
      recordedAt: claimDocumentAiExtractionConsents.recordedAt,
      privacyVersion: claimDocumentAiExtractionConsents.privacyVersion,
    })
    .from(claimDocumentAiExtractionConsents)
    .where(
      and(
        eq(claimDocumentAiExtractionConsents.tenantId, params.tenantId),
        eq(claimDocumentAiExtractionConsents.subjectId, params.memberId),
        eq(claimDocumentAiExtractionConsents.claimId, params.claimId),
        inArray(
          claimDocumentAiExtractionConsents.documentId,
          documents.map(document => document.id)
        ),
        eq(claimDocumentAiExtractionConsents.consentType, 'ai_document_extraction'),
        eq(claimDocumentAiExtractionConsents.processingPurpose, 'ai_document_extraction')
      )
    )
    .orderBy(
      desc(claimDocumentAiExtractionConsents.recordedAt),
      desc(claimDocumentAiExtractionConsents.id)
    );

  return buildVaultConsentDisplay({
    tenantCode: tenant.code,
    tenantCountryCode: tenant.countryCode,
    claimCategory: params.claimCategory,
    piiStatus: params.piiStatus,
    documents,
    consents,
  });
}
