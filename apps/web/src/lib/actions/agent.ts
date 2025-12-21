'use server';

import { auth } from '@/lib/auth';
import { db } from '@interdomestik/database/db';
import { crmActivities, crmLeads } from '@interdomestik/database/schema';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { z } from 'zod';

const createLeadSchema = z.object({
  type: z.enum(['individual', 'business']),
  stage: z.enum(['new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost']),
  fullName: z.string().min(2, 'Name is required'),
  companyName: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().min(6, 'Phone is required'),
  source: z.string().min(1, 'Source is required'),
  notes: z.string().optional(),
});

export async function createLead(prevState: any, formData: FormData) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user || session.user.role !== 'agent') {
    return { error: 'Unauthorized' };
  }

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
      error: 'Validation failed',
      fields: validated.error.flatten().fieldErrors,
    };
  }

  try {
    const newLeadId = nanoid();

    await db.insert(crmLeads).values({
      id: newLeadId,
      agentId: session.user.id,
      ...validated.data,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    revalidatePath('/agent/leads');
    revalidatePath('/agent/crm');
  } catch (error) {
    console.error('Failed to create lead:', error);
    return { error: 'Failed to create lead' };
  }

  redirect(`/agent/leads`);
}

export async function updateLeadStatus(leadId: string, stage: string) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user || session.user.role !== 'agent') {
    return { error: 'Unauthorized' };
  }

  // Verify ownership
  const lead = await db.query.crmLeads.findFirst({
    where: eq(crmLeads.id, leadId),
  });

  if (!lead || lead.agentId !== session.user.id) {
    return { error: 'Not found' };
  }

  // Validate stage
  const validStages = ['new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost'];
  if (!validStages.includes(stage)) {
    return { error: 'Invalid stage' };
  }

  await db
    .update(crmLeads)
    .set({ stage: stage as any, updatedAt: new Date() })
    .where(eq(crmLeads.id, leadId));

  revalidatePath(`/agent/leads/${leadId}`);
  revalidatePath('/agent/leads');
  return { success: true };
}

export async function logActivity(leadId: string, type: string, summary: string) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user || session.user.role !== 'agent') {
    return { error: 'Unauthorized' };
  }

  // Verify ownership
  const lead = await db.query.crmLeads.findFirst({
    where: eq(crmLeads.id, leadId),
  });

  if (!lead || lead.agentId !== session.user.id) {
    return { error: 'Not found' };
  }

  await db.insert(crmActivities).values({
    id: nanoid(),
    leadId,
    agentId: session.user.id,
    type: type as any,
    summary,
    createdAt: new Date(),
  });

  revalidatePath(`/agent/leads/${leadId}`);
  return { success: true };
}
