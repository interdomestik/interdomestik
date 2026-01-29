import { db } from '@interdomestik/database';
import { memberLeads } from '@interdomestik/database/schema';
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
    tenantId: string;
    agentId: string; // The agent creating the lead
    branchId: string; // The branch the agent belongs to
  },
  input: CreateLeadInput
) {
  // Validation handled by caller or here? Let's validate here too.
  const data = createLeadSchema.parse(input);

  const leadId = `lead_${nanoid()}`;

  await db.insert(memberLeads).values({
    id: leadId,
    tenantId: ctx.tenantId,
    branchId: ctx.branchId,
    agentId: ctx.agentId,
    firstName: data.firstName,
    lastName: data.lastName,
    email: data.email,
    phone: data.phone,
    notes: data.notes,
    status: 'new',
  });

  return { leadId };
}
