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
type TenantLocaleMetadata = Awaited<ReturnType<typeof readTenantLocaleMetadata>>;

/** The Vault gate, decided before any document read. */
export type MemberVaultConsentGate =
  | { open: false; display: VaultConsentDisplay }
  | {
      open: true;
      display: VaultConsentDisplay;
      tenantId: string;
      viewerId: string;
      tenant: TenantLocaleMetadata;
    };
type OpenMemberVaultConsentGate = Extract<MemberVaultConsentGate, { open: true }>;

/**
 * Admits the member and evaluates the tenant, category and PII gate without reading documents.
 * When the gate is open, the caller reads the viewer's current evidence inside its admitted
 * transaction and finishes with `completeMemberVaultConsentDisplay` in that same transaction.
 */
export async function openMemberVaultConsentDisplay(
  params: GetMemberVaultConsentDisplayParams
): Promise<MemberVaultConsentGate> {
  const admission = await requireAdmittedMember();
  if (!admission.ok) throw new UnauthorizedError();
  const { tenantId, principal } = readTenantAuthority(admission.authorized.authority);
  if (!principal) throw new UnauthorizedError();
  const tenant = await readTenantLocaleMetadata(tenantId);
  const display = buildVaultConsentDisplay({
    tenantCode: tenant?.code ?? null,
    tenantCountryCode: tenant?.countryCode ?? null,
    claimCategory: params.claimCategory,
    piiStatus: params.piiStatus,
    documents: [],
    consents: [],
  });
  if (display.kind !== 'ready') return { open: false, display };
  return { open: true, display, tenantId, viewerId: principal.userId, tenant };
}

export async function getMemberVaultConsentDisplay(
  params: GetMemberVaultConsentDisplayParams
): Promise<VaultConsentDisplay> {
  const gate = await openMemberVaultConsentDisplay(params);
  if (!gate.open) return gate.display;
  const admission = await requireAdmittedMember();
  if (!admission.ok) throw new UnauthorizedError();
  // The ambient client carries no tenant context, so run the reads inside one.
  return withTenantAuthority(admission.authorized.authority, async tx => {
    const evidence = await readCurrentMemberVaultEvidence(
      tx,
      gate.tenantId,
      params.claimId,
      gate.viewerId
    );
    return completeMemberVaultConsentDisplay(params, gate, tx, evidence);
  });
}

export async function completeMemberVaultConsentDisplay(
  params: GetMemberVaultConsentDisplayParams,
  gate: OpenMemberVaultConsentGate,
  database: TenantTransaction,
  documents: MemberVaultEvidence
): Promise<VaultConsentDisplay> {
  const { tenantId, tenant } = gate;
  if (documents.length === 0) return gate.display;

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
