'use server';

import { auth } from '@/lib/auth';
import { db } from '@interdomestik/database/db';
import { crmLeads } from '@interdomestik/database/schema';
import { nanoid } from 'nanoid';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

export async function createLead(formData: FormData) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user || session.user.role !== 'agent') {
    throw new Error('Unauthorized');
  }

  const type = formData.get('type') as string;
  const stage = formData.get('stage') as string;
  const fullName = formData.get('fullName') as string;
  const companyName = formData.get('companyName') as string;
  const email = formData.get('email') as string;
  const phone = formData.get('phone') as string;
  const source = formData.get('source') as string;
  const notes = formData.get('notes') as string;

  const newLeadId = nanoid();

  await db.insert(crmLeads).values({
    id: newLeadId,
    agentId: session.user.id,
    type,
    stage,
    fullName,
    companyName,
    email,
    phone,
    source,
    notes,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  revalidatePath('/agent/leads');
  revalidatePath('/agent/crm');
  redirect(`/agent/leads/${newLeadId}`);
}
