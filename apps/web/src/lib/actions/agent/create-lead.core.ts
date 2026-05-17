import {
  createCrmLead,
  type CrmLeadMutationResult,
} from '@interdomestik/domain-crm/leads/mutations';
import type { CrmActorContext } from '@interdomestik/domain-crm/context';
import { nanoid } from 'nanoid';
import { createLeadSchema } from './schemas';
import { crmLeadMutationRepository } from '@/adapters/crm/lead-mutation-repository';

function getString(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  // Treat empty strings as undefined to match original behavior (|| undefined)
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }
  return undefined;
}

function mapMutationError(result: Extract<CrmLeadMutationResult, { success: false }>) {
  if (result.error === 'invalid_input') return 'Validation failed';
  if (result.error === 'forbidden') return 'Forbidden';
  return 'Failed to create lead';
}

export async function createLeadCore(actor: CrmActorContext, formData: FormData) {
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
    const leadId = nanoid();
    const result = await createCrmLead(
      {
        actor,
        leadId,
        tenantId: actor.tenantId,
        ...validated.data,
      },
      crmLeadMutationRepository
    );

    if (!result.success) {
      return { ok: false as const, error: mapMutationError(result) };
    }

    return { ok: true as const, leadId };
  } catch (error) {
    console.error('Failed to create lead:', error);
    return { ok: false as const, error: 'Failed to create lead' as const };
  }
}
