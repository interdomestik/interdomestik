import { requireAdmittedMember } from '@/lib/privacy/require-member-acceptance';
import { UnauthorizedError } from '@interdomestik/shared-auth';
import { type TenantTransaction } from '@interdomestik/database';
import { buildVaultConsentDisplay, type VaultConsentDisplay } from '@interdomestik/domain-claims';
import { readTenantAuthority } from '@interdomestik/database/tenant-authority';
import { readTenantLocaleMetadata } from '@interdomestik/database/tenant-directory';
import { claimDocumentAiExtractionConsents } from '@interdomestik/database/schema';
import { and, desc, eq, inArray } from 'drizzle-orm';
import 'server-only';
import { readCurrentMemberVaultEvidence } from '@interdomestik/domain-documents/claim-evidence';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

export interface GetMemberVaultConsentDisplayParams {
  memberId: string;
  claimId: string;
  claimCategory: string;
  piiStatus: 'available' | 'erased_or_unavailable';
}

export type MemberVaultEvidence = Awaited<ReturnType<typeof readCurrentMemberVaultEvidence>>;

/**
 * A caller that already holds the admitted transaction reads the viewer's current evidence
 * inside it and passes both, so the evidence read stays in that same transaction.
 */
export interface MemberVaultEvidenceSource {
  database: TenantTransaction;
  evidence: MemberVaultEvidence;
}

export async function getMemberVaultConsentDisplay(
  params: GetMemberVaultConsentDisplayParams,
  source?: MemberVaultEvidenceSource
): Promise<VaultConsentDisplay> {
  const admission = await requireAdmittedMember();
  if (!admission.ok) throw new UnauthorizedError();
  const { authority } = admission.authorized;
  const { tenantId, principal } = readTenantAuthority(authority);
  if (!principal) throw new UnauthorizedError();
  const viewerId = principal.userId;
  const tenant = await readTenantLocaleMetadata(tenantId);
  const gated = buildVaultConsentDisplay({
    tenantCode: tenant?.code ?? null,
    tenantCountryCode: tenant?.countryCode ?? null,
    claimCategory: params.claimCategory,
    piiStatus: params.piiStatus,
    documents: [],
    consents: [],
  });
  if (gated.kind !== 'ready') return gated;

  if (!source) {
    // The ambient client carries no tenant context, so run the reads inside one.
    return withTenantAuthority(authority, async tx => {
      const evidence = await readCurrentMemberVaultEvidence(tx, tenantId, params.claimId, viewerId);
      return readVaultConsentDisplay(params, tenantId, evidence, tx, tenant, gated);
    });
  }
  return readVaultConsentDisplay(params, tenantId, source.evidence, source.database, tenant, gated);
}

type TenantLocaleMetadata = Awaited<ReturnType<typeof readTenantLocaleMetadata>>;

async function readVaultConsentDisplay(
  params: GetMemberVaultConsentDisplayParams,
  tenantId: string,
  documents: MemberVaultEvidence,
  database: TenantTransaction,
  tenant: TenantLocaleMetadata,
  gated: VaultConsentDisplay
): Promise<VaultConsentDisplay> {
  if (documents.length === 0) return gated;

  // db-access-guard: tenant-scoped -- reason: exact tenant, member, claim, document, consent-type, and purpose predicates bound this read
  const consents = await database
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
        eq(claimDocumentAiExtractionConsents.tenantId, tenantId),
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
    tenantCode: tenant?.code ?? null,
    tenantCountryCode: tenant?.countryCode ?? null,
    claimCategory: params.claimCategory,
    piiStatus: params.piiStatus,
    documents,
    consents,
  });
}
