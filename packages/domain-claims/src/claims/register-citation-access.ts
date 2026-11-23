import { type TenantTransaction } from '@interdomestik/database';
import { caseScopedAccessGrants, type claimDocuments } from '@interdomestik/database/schema';
import {
  canUseCaseScopedDocumentGrant,
  isSuperAdmin,
  isTenantAdmin,
  ROLES,
} from '@interdomestik/shared-auth';
import { and, eq } from 'drizzle-orm';
import type { RegisterActor } from './case-register-access';
import type { ClaimsSession } from './types';

type CitationCandidate = Pick<
  typeof claimDocuments.$inferSelect,
  'id' | 'name' | 'uploadedBy' | 'category'
> & {
  claim: { caseLifecycleState: string | null; staffId: string | null; userId: string | null };
};

/**
 * The legacy claim-document metadata rule for actors admitted to the full register.
 * The document route's independently pinned access code also handles agents and branch managers.
 */
export async function filterRegisterCitationNames(
  tx: TenantTransaction,
  candidates: readonly CitationCandidate[],
  actor: RegisterActor,
  scope: { accessTenantId: string; caseId: string },
  sessionGrants: ClaimsSession['user']['caseScopedAccessGrants']
) {
  const { role, userId } = actor;
  const grantScope = { ...scope, actorId: userId };
  const documents: { id: string; name: string }[] = [];
  const pending: CitationCandidate[] = [];
  for (const candidate of candidates) {
    const { id, name, claim, uploadedBy, category } = candidate;
    if (isTenantAdmin(role) || isSuperAdmin(role) || claim.userId === userId) {
      documents.push({ id, name });
      continue;
    }
    if (role !== ROLES.staff || !claim.caseLifecycleState || claim.caseLifecycleState === 'draft') {
      continue;
    }
    if (
      uploadedBy === userId ||
      claim.staffId === userId ||
      canUseCaseScopedDocumentGrant({
        ...grantScope,
        documentClass: category,
        grants: sessionGrants,
      })
    ) {
      documents.push({ id, name });
    } else if (category !== 'other') {
      // Of the legacy document categories, only 'other' is excluded from durable grants.
      pending.push(candidate);
    }
  }
  if (pending.length === 0) return documents;

  const grants = await tx
    .select({
      accessTenantId: caseScopedAccessGrants.accessTenantId,
      actorId: caseScopedAccessGrants.actorId,
      caseId: caseScopedAccessGrants.caseId,
      documentClasses: caseScopedAccessGrants.documentClasses,
      expiresAt: caseScopedAccessGrants.expiresAt,
      revokedAt: caseScopedAccessGrants.revokedAt,
    })
    .from(caseScopedAccessGrants)
    .where(
      and(
        eq(caseScopedAccessGrants.accessTenantId, scope.accessTenantId),
        eq(caseScopedAccessGrants.actorId, userId),
        eq(caseScopedAccessGrants.caseId, scope.caseId)
      )
    );
  for (const { id, name, category } of pending) {
    if (canUseCaseScopedDocumentGrant({ ...grantScope, documentClass: category, grants })) {
      documents.push({ id, name });
    }
  }
  return documents;
}
