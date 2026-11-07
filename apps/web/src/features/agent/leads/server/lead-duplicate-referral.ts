import { and, auditLog, eq, memberLeads, sql } from '@interdomestik/database';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { readTenantAuthority } from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { createHash } from 'node:crypto';

export const LEAD_DUPLICATE_REFERRAL_ACTION = 'AGENT_LEAD_POSSIBLE_DUPLICATE';

const LEAD_EMAIL_INDEX = 'idx_leads_tenant_email';

type ErrorFields = { name?: unknown; code?: unknown; constraint_name?: unknown; cause?: unknown };

/**
 * Only a same-email conflict is a possible duplicate. That is the domain case-variant refusal or
 * the tenant/email unique index. Any other unique violation stays a persistence failure.
 */
export function isLeadEmailConflict(error: unknown): boolean {
  const outer = error as ErrorFields | null;
  if (outer?.name === 'LeadEmailConflictError') return true;
  return [outer, outer?.cause as ErrorFields | null].some(
    candidate => candidate?.code === '23505' && candidate?.constraint_name === LEAD_EMAIL_INDEX
  );
}

export type DuplicateReferral = {
  authority: TenantAuthority;
  agentId: string;
  branchId: string;
  email: string;
  idempotencyKey: string;
};

/**
 * Records a possible duplicate for review (IDA-CRM-003) without merging it. The tenant-wide lookup
 * stays inside this server boundary, and the agent never sees the existing lead. The row holds
 * references only: no email, name, phone, notes or SQL. Its id derives from the request key and the
 * existing lead, so a retry of one submission adds no second referral, and a failed write fails the
 * request instead of being lost.
 */
export async function recordLeadDuplicateReferral(referral: DuplicateReferral): Promise<void> {
  const { authority, agentId, branchId, email, idempotencyKey } = referral;
  const { tenantId } = readTenantAuthority(authority);
  // db-access-guard: tenant-scoped -- reason: tenantId from the authority scopes this read and write
  await withTenantAuthority(authority, async tx => {
    const [existing] = await tx
      .select({ id: memberLeads.id })
      .from(memberLeads)
      .where(and(eq(memberLeads.tenantId, tenantId), sql`lower(${memberLeads.email}) = ${email}`))
      .limit(1);
    const existingLeadId = existing?.id ?? null;
    // The existing lead is part of the id: an edited email under the same request key refers a
    // different lead and keeps its own referral, while a retry of one submission maps to one row.
    const referralId = `lead-dup-${createHash('sha256')
      .update([tenantId, agentId, idempotencyKey, existingLeadId ?? ''].join('\u0000'))
      .digest('hex')
      .slice(0, 40)}`;
    await tx
      .insert(auditLog)
      .values({
        id: referralId,
        tenantId,
        actorId: agentId,
        actorRole: 'agent',
        action: LEAD_DUPLICATE_REFERRAL_ACTION,
        entityType: 'member_lead',
        entityId: existingLeadId,
        metadata: { submittingBranchId: branchId, review: 'pending' },
        createdAt: new Date(),
      })
      .onConflictDoNothing();
  });
}
