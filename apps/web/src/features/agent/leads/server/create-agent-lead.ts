import { and, eq, inArray, memberLeads, sql } from '@interdomestik/database';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { readTenantAuthority } from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { createLead } from '@interdomestik/domain-leads';
import { z } from 'zod';

import { runCommercialActionWithIdempotency } from '@/lib/commercial-action-idempotency';
import { ROLE_AGENT } from '@/lib/roles.core';
import type { ActionError, ActionSuccess } from '@/lib/safe-action';

import { LEAD_NOTICE_VERSION } from '../lead-notice';
import { isLeadEmailConflict, recordLeadDuplicateReferral } from './lead-duplicate-referral';

const OPEN_STATUS_LIST = ['new', 'contacted', 'payment_pending'] as const;
const OPEN_STATUSES: ReadonlySet<string> = new Set(OPEN_STATUS_LIST);

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

/**
 * Database errors carry the SQL parameters (email, phone, notes) and are logged by the action
 * runner, so only this content-free error leaves the core. It keeps the SQLSTATE code alone.
 */
export class AgentLeadPersistenceError extends Error {
  readonly code: string | undefined;

  constructor(code: string | undefined) {
    super('Agent lead could not be saved');
    this.name = 'AgentLeadPersistenceError';
    this.code = code;
  }
}

function toPersistenceError(error: unknown): AgentLeadPersistenceError {
  const cause = (error as { cause?: unknown } | null)?.cause;
  const code = [error, cause]
    .map(candidate => (candidate as { code?: unknown } | null)?.code)
    .find((value): value is string => typeof value === 'string' && /^[0-9A-Z]{5}$/.test(value));
  return new AgentLeadPersistenceError(code);
}

type LeadOwner = { agentId: string; branchId: string };

const DUPLICATE_MESSAGE = 'A lead with this email already exists and needs review.';

/**
 * Returns the agent's own open lead for this email in the agent's current branch, and nothing
 * else. Every other same-email lead (another agent, another branch, closed, a case variant) is
 * found only when the insert fails, and gets the same POSSIBLE_DUPLICATE answer (IDA-CRM-003).
 *
 * Accepted residual: tenant-wide email uniqueness means success versus POSSIBLE_DUPLICATE, and
 * the agent's own lead list, still show that an email exists somewhere in the tenant. One
 * identical response keeps out the branch, agent, status and id, but cannot hide existence
 * itself. Per-branch uniqueness would be a separate owner-authorized identity change.
 */
async function findOwnOpenLead(authority: TenantAuthority, email: string, owner: LeadOwner) {
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
      .where(
        and(
          eq(memberLeads.tenantId, tenantId),
          eq(memberLeads.branchId, owner.branchId),
          eq(memberLeads.agentId, owner.agentId),
          inArray(memberLeads.status, OPEN_STATUS_LIST),
          sql`lower(${memberLeads.email}) = ${email}`
        )
      )
      .limit(1)
  );
  const lead = existing[0];
  const ownOpen =
    lead?.agentId === owner.agentId &&
    lead.branchId === owner.branchId &&
    OPEN_STATUSES.has(lead.status);
  return ownOpen ? { success: true as const, data: { leadId: lead.id, existing: true } } : null;
}

export async function createAgentLeadCore(
  ctx: CreateAgentLeadContext,
  params: { input: unknown; idempotencyKey?: string }
): Promise<CreateAgentLeadResult> {
  const { agentId, branchId } = ctx;
  if (ctx.userRole !== ROLE_AGENT || !agentId) return refuse('FORBIDDEN', 'Forbidden');
  if (!branchId) return refuse('BRANCH_REQUIRED', 'Agent must belong to a branch to create leads.');

  // Every dialog submission carries a client key, so a retry or double submit replays one result.
  const { idempotencyKey } = params;
  if (!idempotencyKey) return refuse('IDEMPOTENCY_KEY_REQUIRED', 'Missing request key');
  const parsed = createAgentLeadSchema.safeParse(params.input);
  if (!parsed.success) return refuse('INVALID_PAYLOAD', 'Validation failed');
  const data = parsed.data;
  const owner = { agentId, branchId };

  try {
    return await runCommercialActionWithIdempotency({
      action: 'agent-lead.create',
      scope: { kind: 'tenant', authority: ctx.authority, actorUserId: agentId },
      idempotencyKey,
      // The branch is part of the request: a replay after a branch move must not return the old result.
      requestFingerprint: { branchId, input: data },
      execute: async (): Promise<CreateAgentLeadResult> => {
        const own = await findOwnOpenLead(ctx.authority, data.email, owner);
        if (own) return own;
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
          if (!isLeadEmailConflict(error)) throw error;
          // A double submit of the agent's own lead may win the race; nothing else is disclosed.
          const raced = await findOwnOpenLead(ctx.authority, data.email, owner);
          if (raced) return raced;
          await recordLeadDuplicateReferral({
            ...owner,
            authority: ctx.authority,
            email: data.email,
            idempotencyKey,
          });
          return refuse('POSSIBLE_DUPLICATE', DUPLICATE_MESSAGE);
        }
      },
    });
  } catch (error) {
    throw toPersistenceError(error);
  }
}
