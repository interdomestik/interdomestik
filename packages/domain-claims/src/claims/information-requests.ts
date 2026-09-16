import {
  and,
  claimInformationRequests,
  claims,
  desc,
  eq,
  withTenantContext,
} from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';
import { z } from 'zod';
import type { ClaimsSession } from './types';

const publicText = z
  .string()
  .trim()
  .min(1)
  .max(1000)
  .refine(value => !value.includes('\u0000'));
export const informationRequestInput = z
  .object({
    claimId: z.string().min(1).max(200),
    correlationId: z.uuid(),
    requestedInformation: publicText,
    explanationForMember: publicText,
    dueAt: z.iso.datetime({ offset: true }).refine(value => Number.isFinite(Date.parse(value))),
  })
  .strict();

export type InformationRequestInput = z.infer<typeof informationRequestInput>;
export type InformationRequestResult =
  | { success: true; requestId: string }
  | { success: false; error: 'invalid_input' | 'access_denied' | 'invalid_state' | 'conflict' };

export async function createInformationRequest(
  session: ClaimsSession | null,
  input: unknown
): Promise<InformationRequestResult> {
  if (session?.user.role !== 'staff' || !session.user.tenantId) {
    return { success: false, error: 'access_denied' };
  }
  const parsed = informationRequestInput.safeParse(input);
  if (!parsed.success) return { success: false, error: 'invalid_input' };
  const data = parsed.data;
  const tenantId = session.user.tenantId;
  const actorId = session.user.id;
  return withTenantContext({ tenantId, role: 'staff' }, async tx => {
    const [claim] = await tx
      .select({
        staffId: claims.staffId,
        caseState: claims.caseLifecycleState,
        recoveryState: claims.recoveryLifecycleState,
      })
      .from(claims)
      .where(withTenant(tenantId, claims.tenantId, eq(claims.id, data.claimId)))
      .for('update');
    if (!claim || claim.staffId !== actorId) return { success: false, error: 'access_denied' };

    const correlationScope = withTenant(
      tenantId,
      claimInformationRequests.tenantId,
      eq(claimInformationRequests.correlationId, data.correlationId)
    );
    const dueAt = new Date(data.dueAt);
    const matches = (row: typeof claimInformationRequests.$inferSelect): boolean =>
      row.claimId === data.claimId &&
      row.createdByStaffId === actorId &&
      row.requestedInformation === data.requestedInformation &&
      row.explanationForMember === data.explanationForMember &&
      row.dueAt.getTime() === dueAt.getTime();
    const replay = (row: typeof claimInformationRequests.$inferSelect): InformationRequestResult =>
      matches(row) ? { success: true, requestId: row.id } : { success: false, error: 'conflict' };
    const [existing] = await tx.select().from(claimInformationRequests).where(correlationScope);
    if (existing) return replay(existing);
    // The accepted S3 handoff is verification; its established SLA presentation is incomplete.
    if (claim.caseState !== 'verification' || claim.recoveryState !== 'not_started') {
      return { success: false, error: 'invalid_state' };
    }
    const [created] = await tx
      .insert(claimInformationRequests)
      .values({
        ...data,
        tenantId,
        dueAt,
        responsibleStaffId: actorId,
        createdByStaffId: actorId,
        slaPosture: 'incomplete',
        status: 'open',
      })
      .onConflictDoNothing({
        target: [claimInformationRequests.tenantId, claimInformationRequests.correlationId],
      })
      .returning({ id: claimInformationRequests.id });
    if (created) return { success: true, requestId: created.id };
    const [concurrent] = await tx.select().from(claimInformationRequests).where(correlationScope);
    return concurrent ? replay(concurrent) : { success: false, error: 'conflict' };
  });
}

/** Both reads are ownership-scoped, including when a caller supplies another claim ID. */
export async function getInformationRequests(session: ClaimsSession | null, claimId: string) {
  const actor = session?.user;
  if (!actor?.tenantId || !['staff', 'member', 'user'].includes(actor.role ?? '')) return [];
  const tenantId = actor.tenantId;
  return withTenantContext({ tenantId, role: actor.role! }, async tx => {
    const rows = await tx
      // Public projection excludes private correlation and staff identity.
      .select({
        requestId: claimInformationRequests.id,
        requestedInformation: claimInformationRequests.requestedInformation,
        explanationForMember: claimInformationRequests.explanationForMember,
        dueAt: claimInformationRequests.dueAt,
        slaPosture: claimInformationRequests.slaPosture,
        createdAt: claimInformationRequests.createdAt,
      })
      .from(claimInformationRequests)
      .innerJoin(
        claims,
        and(
          eq(claims.id, claimInformationRequests.claimId),
          eq(claims.tenantId, claimInformationRequests.tenantId)
        )
      )
      .where(
        withTenant(
          tenantId,
          claimInformationRequests.tenantId,
          and(
            eq(claimInformationRequests.claimId, claimId),
            actor.role === 'staff' ? eq(claims.staffId, actor.id) : eq(claims.userId, actor.id)
          )
        )
      )
      .orderBy(desc(claimInformationRequests.createdAt), desc(claimInformationRequests.id));
    return rows.map(row => ({
      ...row,
      dueAt: row.dueAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
    }));
  });
}

export type PublicInformationRequest = Awaited<ReturnType<typeof getInformationRequests>>[number];
