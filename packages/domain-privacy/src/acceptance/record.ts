import { randomUUID } from 'node:crypto';

import { eq, type TenantTransaction, withPrincipalTenantContext } from '@interdomestik/database';
import { auditLog, legalAcceptances, user } from '@interdomestik/database/schema';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenant } from '@interdomestik/database/tenant-security';

import { validateAttestations, type LegalAcceptanceSubmission } from './attestations';
import { isLegalAcceptanceRole, type LegalDocument } from './documents';
import { verifyLegalTexts, type RenderedLegalText } from './registry';
import { getAcceptanceState } from './state';

type TextInput = {
  locale: string;
  texts: readonly RenderedLegalText[];
  requireApproved: boolean;
};

type AcceptanceRow = typeof legalAcceptances.$inferInsert;

async function storeAcceptanceEvidence(
  tx: TenantTransaction,
  rows: AcceptanceRow[],
  actorRole: string
) {
  const inserted = await tx
    .insert(legalAcceptances)
    .values(rows)
    .onConflictDoNothing({
      target: [
        legalAcceptances.tenantId,
        legalAcceptances.subjectUserId,
        legalAcceptances.documentKind,
        legalAcceptances.documentVersion,
      ],
    })
    .returning();

  if (!inserted.length) return;
  await tx.insert(auditLog).values(
    inserted.map(row => ({
      id: randomUUID(),
      action: 'privacy.legal_document_accepted',
      entityType: 'legal_acceptance',
      entityId: row.id,
      metadata: {
        kind: row.documentKind,
        version: row.documentVersion,
        locale: row.locale,
        textSha256: row.textSha256,
      },
      actorRole,
      actorId: row.subjectUserId,
      tenantId: row.tenantId,
    }))
  );
}

function prepareAcceptanceRows(
  missing: LegalDocument[],
  digests: Map<LegalDocument['kind'], string>,
  context: { locale: string; subjectUserId: string; tenantId: string }
): AcceptanceRow[] | null {
  const rows: AcceptanceRow[] = [];
  for (const doc of missing) {
    const textSha256 = digests.get(doc.kind);
    if (!textSha256) return null;
    rows.push({
      id: randomUUID(),
      documentKind: doc.kind,
      documentVersion: doc.version,
      locale: context.locale,
      textSha256,
      sourceSurface: 'member_activation',
      subjectUserId: context.subjectUserId,
      tenantId: context.tenantId,
    });
  }
  return rows;
}

export async function acceptLegalDocuments(
  authority: TenantAuthority,
  input: LegalAcceptanceSubmission,
  text: TextInput
) {
  const { principal, accessTenantId, purpose } = readTenantAuthority(authority);
  if (purpose !== 'session' || !principal?.role || !isLegalAcceptanceRole(principal.role)) {
    return { ok: false, code: 'forbidden' } as const;
  }
  const { userId: subjectUserId, role } = principal;
  return await withPrincipalTenantContext(authority, async tx => {
    const [subject] = await tx
      .select({ id: user.id })
      .from(user)
      .where(withTenant(accessTenantId, user.tenantId, eq(user.id, subjectUserId)))
      .for('update');
    if (!subject) return { ok: false, code: 'forbidden' } as const;

    const verified = await verifyLegalTexts(tx, text);
    if (!verified.ok) return verified;

    const state = await getAcceptanceState(tx, {
      subjectUserId,
      requireApproved: text.requireApproved,
    });
    const missing = state.accepted ? [] : state.missing;
    const failure = validateAttestations(missing, input);
    if (failure) return { ok: false, code: failure } as const;
    if (state.accepted) return { ok: true } as const;

    const rows = prepareAcceptanceRows(missing, verified.digests, {
      locale: text.locale,
      subjectUserId,
      tenantId: accessTenantId,
    });
    if (!rows) return { ok: false, code: 'legal_text_mismatch' } as const;
    await storeAcceptanceEvidence(tx, rows, role);
    return { ok: true } as const;
  });
}
