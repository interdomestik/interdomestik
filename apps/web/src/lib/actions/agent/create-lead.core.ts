import { db } from '@interdomestik/database/db';
import { crmLeads } from '@interdomestik/database/schema';
import { nanoid } from 'nanoid';
import { createLeadSchema } from './schemas';

function getString(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  // Treat empty strings as undefined to match original behavior (|| undefined)
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }
  return undefined;
}

export async function createLeadCore(agentId: string, tenantId: string, formData: FormData) {
  const rawData = {
    type: formData.get('type'),
    stage: formData.get('stage'),
    fullName: formData.get('fullName'),
    companyName: getString(formData, 'companyName'),
    email: getString(formData, 'email'),
    phone: formData.get('phone'),
    source: formData.get('source'),
    notes: getString(formData, 'notes'),
  };

  const validated = createLeadSchema.safeParse(rawData);

  if (!validated.success) {
    return {
      ok: false as const,
      error: 'Validation failed' as const,
      fields: validated.error.flatten().fieldErrors,
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
