import { and, eq, inArray, withPrincipalTenantContext } from '@interdomestik/database';
import { legalAcceptances, legalDocumentVersions, user } from '@interdomestik/database/schema';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenant } from '@interdomestik/database/tenant-security';

import { currentLegalDocuments } from './documents';
import { verifyLegalTexts, type RenderedLegalText } from './registry';
import { currentAcceptanceVersions, getAcceptanceState } from './state';

export async function readOwnAcceptanceState(authority: TenantAuthority, requireApproved: boolean) {
  const { principal } = readTenantAuthority(authority);
  if (!principal) throw new Error('Session principal required');
  return withPrincipalTenantContext(authority, tx =>
    getAcceptanceState(tx, { subjectUserId: principal.userId, requireApproved })
  );
}

export async function checkRenderedLegalTexts(
  authority: TenantAuthority,
  input: { locale: string; texts: readonly RenderedLegalText[]; requireApproved: boolean }
) {
  return withPrincipalTenantContext(authority, async tx => {
    const result = await verifyLegalTexts(tx, input);
    return result.ok ? ({ ok: true, pending: result.pending } as const) : result;
  });
}

export async function listMembersWithoutAcceptance(
  authority: TenantAuthority,
  requireApproved: boolean
) {
  const { purpose, principal, accessTenantId } = readTenantAuthority(authority);
  if (purpose !== 'session' || principal?.role !== 'tenant_admin') {
    return { ok: false, code: 'forbidden' } as const;
  }

  return withPrincipalTenantContext(authority, async tx => {
    const current = tx
      .select({
        tenantId: legalAcceptances.tenantId,
        subjectUserId: legalAcceptances.subjectUserId,
        kind: legalAcceptances.documentKind,
      })
      .from(legalAcceptances)
      .innerJoin(
        legalDocumentVersions,
        and(
          eq(legalAcceptances.documentKind, legalDocumentVersions.kind),
          eq(legalAcceptances.documentVersion, legalDocumentVersions.version),
          eq(legalAcceptances.locale, legalDocumentVersions.locale),
          eq(legalAcceptances.textSha256, legalDocumentVersions.textSha256)
        )
      )
      .where(
        withTenant(
          accessTenantId,
          legalAcceptances.tenantId,
          and(
            currentAcceptanceVersions(),
            requireApproved ? eq(legalDocumentVersions.reviewStatus, 'approved') : undefined
          )
        )
      )
      .as('accepted_documents');
    const rows = await tx
      .select({ subjectUserId: user.id, kind: current.kind })
      .from(user)
      .leftJoin(
        current,
        and(eq(current.tenantId, user.tenantId), eq(current.subjectUserId, user.id))
      )
      .where(withTenant(accessTenantId, user.tenantId, inArray(user.role, ['member', 'user'])))
      .orderBy(user.id);

    const acceptedByMember = new Map<string, Set<string>>();
    for (const { subjectUserId, kind } of rows) {
      const kinds = acceptedByMember.get(subjectUserId) ?? new Set<string>();
      if (kind) kinds.add(kind);
      acceptedByMember.set(subjectUserId, kinds);
    }
    const members = Array.from(acceptedByMember, ([subjectUserId, kinds]) => ({
      subjectUserId,
      missing: currentLegalDocuments.filter(doc => !kinds.has(doc.kind)),
    })).filter(member => member.missing.length > 0);
    return { ok: true, members } as const;
  });
}
