import {
  and,
  auditLog,
  claimInformationRequestEvidence,
  claimInformationRequests,
  claims,
  eq,
} from '@interdomestik/database';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import type { ClaimsSession } from './types';

export const fulfilInformationRequestInput = z
  .object({
    claimId: z.string().min(1).max(200),
    requestId: z.uuid(),
    documentId: z.string().min(1).max(200),
    reviewed: z.literal(true),
  })
  .strict();

export type FulfilInformationRequestResult =
  | { success: true; fulfilledAt: string }
  | { success: false; error: 'invalid_input' | 'access_denied' | 'conflict' };

/** Close only the exact open request whose linked upload the current assignee reviewed. */
export async function fulfilInformationRequest(
  session: ClaimsSession | null,
  authority: TenantAuthority | null,
  input: unknown
): Promise<FulfilInformationRequestResult> {
  if (session?.user.role !== 'staff' || !authority) {
    return { success: false, error: 'access_denied' };
  }
  const { tenantId } = readTenantAuthority(authority);
  const parsed = fulfilInformationRequestInput.safeParse(input);
  if (!parsed.success) return { success: false, error: 'invalid_input' };

  const data = parsed.data;
  const actorId = session.user.id;
  return withTenantAuthority(authority, async tx => {
    const [claim] = await tx
      .select({ staffId: claims.staffId })
      .from(claims)
      .where(and(eq(claims.tenantId, tenantId), eq(claims.id, data.claimId)))
      .for('update');
    if (claim?.staffId !== actorId) return { success: false, error: 'access_denied' };

    const scope = and(
      eq(claimInformationRequests.tenantId, tenantId),
      eq(claimInformationRequests.claimId, data.claimId),
      eq(claimInformationRequests.id, data.requestId)
    );
    const [request] = await tx
      .select({
        status: claimInformationRequests.status,
        fulfilledAt: claimInformationRequests.fulfilledAt,
        fulfilledDocumentId: claimInformationRequests.fulfilledDocumentId,
      })
      .from(claimInformationRequests)
      .where(scope)
      .for('update');
    if (!request) return { success: false, error: 'conflict' };
    if (request.status === 'fulfilled') {
      return request.fulfilledDocumentId === data.documentId && request.fulfilledAt
        ? { success: true, fulfilledAt: request.fulfilledAt.toISOString() }
        : { success: false, error: 'conflict' };
    }

    const [evidence] = await tx
      .select({ acknowledgedAt: claimInformationRequestEvidence.acknowledgedAt })
      .from(claimInformationRequestEvidence)
      .where(
        and(
          eq(claimInformationRequestEvidence.tenantId, tenantId),
          eq(claimInformationRequestEvidence.claimId, data.claimId),
          eq(claimInformationRequestEvidence.requestId, data.requestId),
          eq(claimInformationRequestEvidence.documentId, data.documentId)
        )
      );
    if (!evidence?.acknowledgedAt) return { success: false, error: 'conflict' };

    const now = new Date();
    const [updated] = await tx
      .update(claimInformationRequests)
      .set({
        status: 'fulfilled',
        fulfilledAt: now,
        fulfilledByStaffId: actorId,
        fulfilledDocumentId: data.documentId,
      })
      .where(and(scope, eq(claimInformationRequests.status, 'open')))
      .returning({ fulfilledAt: claimInformationRequests.fulfilledAt });
    if (!updated?.fulfilledAt) return { success: false, error: 'conflict' };

    await tx.insert(auditLog).values({
      id: randomUUID(),
      tenantId,
      actorId,
      actorRole: 'staff',
      action: 'claim_information_request.fulfilled',
      entityType: 'claim_information_request',
      entityId: data.requestId,
      metadata: { documentId: data.documentId },
    });
    return { success: true, fulfilledAt: updated.fulfilledAt.toISOString() };
  });
}
