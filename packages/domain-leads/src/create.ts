import { memberLeads } from '@interdomestik/database/schema';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { nanoid } from 'nanoid';
import { z } from 'zod';

/** Backfill marker for rows written before consent capture; never accepted for a new lead. */
export const LEGACY_CONSENT_NOTICE_VERSION = 'pre-consent-legacy';

export type LeadCaptureChannel = 'agent_assisted' | 'public_form';

export const createLeadSchema = z
  .object({
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    email: z.string().email(),
    phone: z.string().min(5),
    notes: z.string().optional(),
    leadKind: z.enum(['individual', 'company']).default('individual'),
    companyName: z.string().trim().min(1).max(200).optional(),
    teamSize: z.string().trim().min(1).max(32).optional(),
    source: z.string().trim().min(1).max(200).optional(),
    // The version of the notice the prospect accepted; the lead is refused without it.
    consentNoticeVersion: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .refine(version => version !== LEGACY_CONSENT_NOTICE_VERSION, 'Consent notice is required'),
  })
  .refine(data => data.leadKind === 'individual' || Boolean(data.companyName), {
    message: 'Company name is required for a company lead',
    path: ['companyName'],
  });

export type CreateLeadInput = z.input<typeof createLeadSchema>;

export async function createLead(
  ctx: {
    authority: TenantAuthority;
    agentId: string; // The agent who owns the lead
    branchId: string; // The branch the agent belongs to
    captureChannel: LeadCaptureChannel;
    now?: Date;
  },
  input: CreateLeadInput
) {
  const data = createLeadSchema.parse(input);
  const { tenantId } = readTenantAuthority(ctx.authority);

  const leadId = `lead_${nanoid()}`;

  // db-access-guard: tenant-scoped -- reason: tenantId from the authority is inserted
  await withTenantAuthority(ctx.authority, tx =>
    tx.insert(memberLeads).values({
      id: leadId,
      tenantId,
      branchId: ctx.branchId,
      agentId: ctx.agentId,
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      phone: data.phone,
      notes: data.notes,
      status: 'new',
      leadKind: data.leadKind,
      companyName: data.companyName,
      teamSize: data.teamSize,
      source: data.source,
      consentNoticeVersion: data.consentNoticeVersion,
      consentCapturedAt: ctx.now ?? new Date(),
      // Agent-assisted consent is attested by the capturing agent; a public form has no capturer.
      consentCapturedBy: ctx.captureChannel === 'agent_assisted' ? ctx.agentId : null,
      captureChannel: ctx.captureChannel,
    })
  );

  return { leadId };
}
