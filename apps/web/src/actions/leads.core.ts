'use server';

import { authorizePublicSiteTenant } from '@interdomestik/database';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { leads } from '@interdomestik/database/schema';
import { randomUUID } from 'crypto';
import { z } from 'zod';

import { anonymousLeadClassificationSchema } from '@/lib/tenant/anonymous-lead-classification';
import { resolveTenantIdFromRequest } from '@/lib/tenant/tenant-request';

const createLeadSchema = z
  .object({
    name: z.string().min(2),
    phone: z.string().min(6),
    category: z.string(),
    classification: anonymousLeadClassificationSchema,
  })
  .strict();

export async function submitLead(data: z.infer<typeof createLeadSchema>) {
  try {
    const validated = createLeadSchema.parse(data);
    const tenantId = await resolveTenantIdFromRequest(validated.classification);
    const authority = await authorizePublicSiteTenant(tenantId);
    if (!authority) {
      return { success: false, error: 'Failed to submit request' };
    }

    await withTenantAuthority(authority, tx =>
      tx.insert(leads).values({
        id: randomUUID(),
        name: validated.name,
        phone: validated.phone,
        category: validated.category,
        tenantId,
      })
    );

    return { success: true };
  } catch (error) {
    console.error('Failed to submit lead:', error);
    return { success: false, error: 'Failed to submit request' };
  }
}
