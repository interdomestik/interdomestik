'use server';

import { withTenantContext } from '@interdomestik/database';
import { leads } from '@interdomestik/database/schema';
import { randomUUID } from 'crypto';
import { z } from 'zod';

import { resolveTenantIdFromRequest } from '@/lib/tenant/tenant-request';

const createLeadSchema = z
  .object({
    name: z.string().min(2),
    phone: z.string().min(6),
    category: z.string(),
  })
  .strict();

export async function submitLead(data: z.infer<typeof createLeadSchema>) {
  try {
    const validated = createLeadSchema.parse(data);
    // Public intake: the tenant comes from the server request contract (host first), never from
    // the client payload. Same contract as the business membership lead intake.
    const tenantId = await resolveTenantIdFromRequest();

    // db-access-guard: tenant-scoped -- reason: tenantId resolved server-side from the request host contract
    await withTenantContext({ tenantId }, tx =>
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
