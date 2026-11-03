import { memberLeads } from '@interdomestik/database/schema';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { nanoid } from 'nanoid';
import { z } from 'zod';

export const createLeadSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(5),
  notes: z.string().optional(),
});

export type CreateLeadInput = z.infer<typeof createLeadSchema>;

export async function createLead(
  ctx: {
    authority: TenantAuthority;
    agentId: string; // The agent creating the lead
    branchId: string; // The branch the agent belongs to
  },
  input: CreateLeadInput
) {
  // Validation handled by caller or here? Let's validate here too.
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
    })
  );

  return { leadId };
}
