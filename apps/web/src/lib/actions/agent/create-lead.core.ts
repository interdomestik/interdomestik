import { db } from '@interdomestik/database/db';
import { crmLeads } from '@interdomestik/database/schema';
import { nanoid } from 'nanoid';
import { createLeadSchema } from './schemas';

export async function createLeadCore(agentId: string, tenantId: string, formData: FormData) {
  const rawData = {
    type: formData.get('type'),
    stage: formData.get('stage'),
    fullName: formData.get('fullName'),
    companyName: formData.get('companyName')?.toString() || undefined,
    email: formData.get('email')?.toString() || undefined,
    phone: formData.get('phone'),
    source: formData.get('source'),
    notes: formData.get('notes')?.toString() || undefined,
  };

  const validated = createLeadSchema.safeParse(rawData);

  if (!validated.success) {
    return {
      ok: false as const,
      error: 'Validation failed' as const,
      fields: validated.error.flatten().fieldErrors, // NOSONAR
    };
  }

  try {
    const newLeadId = nanoid();

    await db.insert(crmLeads).values({
      id: newLeadId,
      tenantId,
      agentId,
      ...validated.data,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return { ok: true as const, leadId: newLeadId };
  } catch (error) {
    console.error('Failed to create lead:', error);
    return { ok: false as const, error: 'Failed to create lead' as const };
  }
}
