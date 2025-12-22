'use server';

import { auth } from '@/lib/auth';
import { sendMemberWelcomeEmail } from '@/lib/email';
import { generateMemberNumber } from '@/utils/member';
import { db } from '@interdomestik/database/db';
import {
  agentClients,
  crmActivities,
  crmLeads,
  subscriptions,
  user as userTable,
} from '@interdomestik/database/schema';
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
const registerMemberSchema = z.object({
  fullName: z.string().min(2, 'Name is required'),
  email: z.string().email('Invalid email address'),
  phone: z.string().min(5, 'Phone is required'),
  planId: z.enum(['standard', 'family']),
  notes: z.string().optional(),
});

export async function registerMember(prevState: any, formData: FormData) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user || session.user.role !== 'agent') {
    return { error: 'Unauthorized' };
  }

  const rawData = {
    fullName: formData.get('fullName'),
    email: formData.get('email'),
    phone: formData.get('phone'),
    planId: formData.get('planId'),
    notes: formData.get('notes') || undefined,
  };

  const validated = registerMemberSchema.safeParse(rawData);

  if (!validated.success) {
    return {
      error: 'Validation failed',
      fields: validated.error.flatten().fieldErrors,
    };
  }

  const data = validated.data;
  const userId = nanoid();

  try {
    await db.transaction(async tx => {
      // 1. Create User
      await tx.insert(userTable).values({
        id: userId,
        name: data.fullName,
        email: data.email,
        emailVerified: false,
        memberNumber: generateMemberNumber(),
        role: 'user',
        agentId: session.user.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // 2. Link Agent
      await tx.insert(agentClients).values({
        id: nanoid(),
        agentId: session.user.id,
        memberId: userId,
        status: 'active',
        joinedAt: new Date(),
        createdAt: new Date(),
      });

      // 3. Create Subscription (Manual/Trial)
      const expiry = new Date();
      expiry.setFullYear(expiry.getFullYear() + 1);

      await tx.insert(subscriptions).values({
        id: nanoid(),
        userId: userId,
        planId: data.planId,
        status: 'active',
        currentPeriodEnd: expiry,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    });

    // 4. Send Welcome Email
    await sendMemberWelcomeEmail(data.email, {
      memberName: data.fullName,
      agentName: session.user.name || 'Your Agent',
    });

    revalidatePath('/agent/users');
  } catch (err) {
    console.error('Registration failed:', err);
    return { error: 'Failed to register member. Email might already exist.' };
  }

  redirect('/agent/users');
}
