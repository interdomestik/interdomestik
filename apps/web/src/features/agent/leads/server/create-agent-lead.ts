import { and, eq, memberLeads, sql } from '@interdomestik/database';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { readTenantAuthority } from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { createLead } from '@interdomestik/domain-leads';
import { z } from 'zod';

import { runCommercialActionWithIdempotency } from '@/lib/commercial-action-idempotency';
import { ROLE_AGENT } from '@/lib/roles.core';
import type { ActionError, ActionSuccess } from '@/lib/safe-action';

import { LEAD_NOTICE_VERSION } from '../lead-notice';

const OPEN_STATUSES = new Set(['new', 'contacted', 'payment_pending']);

export const createAgentLeadSchema = z
  .object({
    leadKind: z.enum(['individual', 'company']),
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
    email: z
      .string()
      .trim()
      .email()
      .transform(email => email.toLowerCase()),
    phone: z.string().trim().min(5).max(32),
    companyName: z.string().trim().max(200).optional(),
    teamSize: z.string().trim().max(32).optional(),
    notes: z.string().trim().max(2000).optional(),
    // The agent confirms the prospect accepted the notice shown in the dialog.
    consentConfirmed: z.literal(true),
  })
  .refine(data => data.leadKind === 'individual' || Boolean(data.companyName), {
    message: 'Company name is required',
    path: ['companyName'],
  });

export type CreateAgentLeadResult =
  ActionSuccess<{ leadId: string; existing: boolean }> | ActionError;

export type CreateAgentLeadContext = {
  authority: TenantAuthority;
  userRole: string;
  agentId: string | null;
  branchId: string | null;
};

function refuse(code: string, error: string): ActionError {
  return { success: false, error, code };
}

function isUniqueViolation(error: unknown): boolean {
  const cause = (error as { cause?: unknown } | null)?.cause;
  return [error, cause].some(
    candidate => (candidate as { code?: unknown } | null)?.code === '23505'
  );
}

type LeadOwner = { agentId: string; branchId: string };

/**
 * An open lead of the same agent in the agent's current branch is returned as is; any other lead
 * with that email (another agent, another branch, closed) is a possible duplicate for review and
 * is never merged (IDA-CRM-003).
 */
async function findSameEmailLead(authority: TenantAuthority, email: string, owner: LeadOwner) {
  const { tenantId } = readTenantAuthority(authority);
  // db-access-guard: tenant-scoped -- reason: tenantId from the authority scopes this read
  const existing = await withTenantAuthority(authority, tx =>
    tx
      .select({
        id: memberLeads.id,
        agentId: memberLeads.agentId,
        branchId: memberLeads.branchId,
        status: memberLeads.status,
      })
      .from(memberLeads)
      .where(and(eq(memberLeads.tenantId, tenantId), sql`lower(${memberLeads.email}) = ${email}`))
      .limit(1)
  );
  const lead = existing[0];
  if (!lead) return null;
  const ownLead = lead.agentId === owner.agentId && lead.branchId === owner.branchId;
  if (ownLead && OPEN_STATUSES.has(lead.status)) {
    return { success: true as const, data: { leadId: lead.id, existing: true } };
  }
  return refuse('POSSIBLE_DUPLICATE', 'A lead with this email already exists and needs review.');
}

export async function createAgentLeadCore(
  ctx: CreateAgentLeadContext,
  params: { input: unknown; idempotencyKey?: string }
): Promise<CreateAgentLeadResult> {
  const { agentId, branchId } = ctx;
  if (ctx.userRole !== ROLE_AGENT || !agentId) return refuse('FORBIDDEN', 'Forbidden');
  if (!branchId) return refuse('BRANCH_REQUIRED', 'Agent must belong to a branch to create leads.');

  // Every dialog submission carries a client key, so a retry or double submit replays one result.
  if (!params.idempotencyKey) return refuse('IDEMPOTENCY_KEY_REQUIRED', 'Missing request key');
  const parsed = createAgentLeadSchema.safeParse(params.input);
  if (!parsed.success) return refuse('INVALID_PAYLOAD', 'Validation failed');
  const data = parsed.data;
  const owner = { agentId, branchId };

  return runCommercialActionWithIdempotency({
    action: 'agent-lead.create',
    scope: { kind: 'tenant', authority: ctx.authority, actorUserId: agentId },
    idempotencyKey: params.idempotencyKey,
    // The branch is part of the request: a replay after a branch move must not return the old result.
    requestFingerprint: { branchId, input: data },
    execute: async (): Promise<CreateAgentLeadResult> => {
      const duplicate = await findSameEmailLead(ctx.authority, data.email, owner);
      if (duplicate) return duplicate;
      try {
        const { leadId } = await createLead(
          { authority: ctx.authority, agentId, branchId, captureChannel: 'agent_assisted' },
          {
            firstName: data.firstName,
            lastName: data.lastName,
            email: data.email,
            phone: data.phone,
            notes: data.notes,
            leadKind: data.leadKind,
            companyName: data.leadKind === 'company' ? data.companyName : undefined,
            teamSize: data.leadKind === 'company' ? data.teamSize || undefined : undefined,
            source: 'agent_workspace',
            consentNoticeVersion: LEAD_NOTICE_VERSION,
          }
        );
        return { success: true, data: { leadId, existing: false } };
      } catch (error) {
        // A concurrent create for the same email lost the unique-index race: resolve it the same way.
        if (!isUniqueViolation(error)) throw error;
        return (
          (await findSameEmailLead(ctx.authority, data.email, owner)) ??
          refuse('POSSIBLE_DUPLICATE', 'A lead with this email already exists and needs review.')
        );
      }
    },
  });
}
