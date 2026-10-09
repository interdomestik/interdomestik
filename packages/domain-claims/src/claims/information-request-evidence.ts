import {
  and,
  auditLog,
  claimInformationRequestEvidence,
  claimInformationRequests,
  claims,
  eq,
  isNull,
  withTenantContext,
} from '@interdomestik/database';
import { ensureAccessTenantId } from '@interdomestik/shared-auth';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import type { ClaimsSession } from './types';

export const acknowledgeInformationRequestEvidenceInput = z
  .object({
    claimId: z.string().min(1).max(200),
    requestId: z.uuid(),
    documentId: z.string().min(1).max(200),
  })
  .strict();

export type AcknowledgeInformationRequestEvidenceResult =
  | { success: true; acknowledgedAt: string }
  | { success: false; error: 'invalid_input' | 'access_denied' | 'conflict' };

export async function acknowledgeInformationRequestEvidence(
  session: ClaimsSession | null,
  input: unknown
): Promise<AcknowledgeInformationRequestEvidenceResult> {
  if (session?.user.role !== 'staff') return { success: false, error: 'access_denied' };
  let tenantId: string;
  try {
    tenantId = ensureAccessTenantId(session);
  } catch {
    return { success: false, error: 'access_denied' };
  }
  const parsed = acknowledgeInformationRequestEvidenceInput.safeParse(input);
  if (!parsed.success) return { success: false, error: 'invalid_input' };

  const data = parsed.data;
  const actorId = session.user.id;
  return withTenantContext({ tenantId, role: 'staff' }, async tx => {
    const [claim] = await tx
      .select({ staffId: claims.staffId })
      .from(claims)
      .where(and(eq(claims.tenantId, tenantId), eq(claims.id, data.claimId)))
      .for('update');
    if (claim?.staffId !== actorId) return { success: false, error: 'access_denied' };

    const [request] = await tx
      .select({ status: claimInformationRequests.status })
      .from(claimInformationRequests)
      .where(
        and(
          eq(claimInformationRequests.tenantId, tenantId),
          eq(claimInformationRequests.claimId, data.claimId),
          eq(claimInformationRequests.id, data.requestId)
        )
      )
      .for('update');
    if (request?.status !== 'open') return { success: false, error: 'conflict' };

    const scope = and(
      eq(claimInformationRequestEvidence.tenantId, tenantId),
      eq(claimInformationRequestEvidence.claimId, data.claimId),
      eq(claimInformationRequestEvidence.requestId, data.requestId),
      eq(claimInformationRequestEvidence.documentId, data.documentId)
    );
    const now = new Date();
    const [acknowledged] = await tx
      .update(claimInformationRequestEvidence)
      .set({ acknowledgedAt: now, acknowledgedByStaffId: actorId })
      .where(and(scope, isNull(claimInformationRequestEvidence.acknowledgedAt)))
      .returning({ acknowledgedAt: claimInformationRequestEvidence.acknowledgedAt });

    if (acknowledged?.acknowledgedAt) {
      await tx.insert(auditLog).values({
        id: randomUUID(),
        tenantId,
        actorId,
        actorRole: 'staff',
        action: 'claim_information_request.evidence_acknowledged',
        entityType: 'claim_information_request',
        entityId: data.requestId,
        metadata: { documentId: data.documentId },
      });
      return { success: true, acknowledgedAt: acknowledged.acknowledgedAt.toISOString() };
    }

    const [existing] = await tx
      .select({ acknowledgedAt: claimInformationRequestEvidence.acknowledgedAt })
      .from(claimInformationRequestEvidence)
      .where(scope)
      .limit(1);
    if (existing?.acknowledgedAt) {
      return { success: true, acknowledgedAt: existing.acknowledgedAt.toISOString() };
    }
    return { success: false, error: 'conflict' };
  });
}
