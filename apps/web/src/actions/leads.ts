'use server';

import { db } from '@interdomestik/database';
import { leads } from '@interdomestik/database/schema';
import { randomUUID } from 'crypto';
import { z } from 'zod';

const createLeadSchema = z.object({
  name: z.string().min(2),
  phone: z.string().min(6),
  category: z.string(),
});

export async function submitLead(data: z.infer<typeof createLeadSchema>) {
  try {
    const validated = createLeadSchema.parse(data);

    await db.insert(leads).values({
      id: randomUUID(),
      name: validated.name,
      phone: validated.phone,
      category: validated.category,
    });

    return { success: true };
  } catch (error) {
    console.error('Failed to submit lead:', error);
    return { success: false, error: 'Failed to submit request' };
  }
}
