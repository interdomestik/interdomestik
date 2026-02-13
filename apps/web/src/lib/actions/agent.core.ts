'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { headers } from 'next/headers';
import { getAgentSession } from './agent/context';
import { createLeadCore } from './agent/create-lead';
import { logActivityCore } from './agent/log-activity';
import { registerMemberCore } from './agent/register-member';
import { updateLeadStatusCore } from './agent/update-lead-status';

function resolveLocaleFromReferer(referer: string | null): string {
  if (!referer) return 'en';
  try {
    const url = new URL(referer);
    const first = url.pathname.split('/').find(Boolean);
    if (first && ['sq', 'en', 'sr', 'mk'].includes(first)) return first;
  } catch {
    // ignore
  }
  return 'en';
}

export async function createLead(prevState: unknown, formData: FormData) {
  const session = await getAgentSession();
  if (!session) {
    return { error: 'Unauthorized', fields: undefined };
  }

  let tenantId: string;
  try {
    tenantId = ensureTenantId(session);
  } catch {
    return { error: 'Missing tenantId', fields: undefined };
  }

  const result = await createLeadCore(session.user.id, tenantId, formData);
  if (!result.ok) {
    return {
      error: result.error,
      fields: 'fields' in result ? result.fields : undefined,
    };
  }

  const locale = resolveLocaleFromReferer((await headers()).get('referer'));
  revalidatePath(`/${locale}/agent/leads`);
  revalidatePath(`/${locale}/agent/crm`);
  redirect(`/${locale}/agent/leads`);
}

export async function updateLeadStatus(leadId: string, stage: string) {
  const session = await getAgentSession();
  if (!session) {
    return { error: 'Unauthorized' };
  }

  const result = await updateLeadStatusCore(session.user.id, leadId, stage);
  if ('error' in result) {
    return result;
  }

  revalidatePath(`/agent/leads/${leadId}`);
  revalidatePath('/agent/leads');
  return result;
}

export async function logActivity(leadId: string, type: string, summary: string) {
  const session = await getAgentSession();
  if (!session) {
    return { error: 'Unauthorized' };
  }

  const result = await logActivityCore(session.user.id, leadId, type, summary);
  if ('error' in result) {
    return result;
  }

  revalidatePath(`/agent/leads/${leadId}`);
  return result;
}

export async function registerMember(prevState: unknown, formData: FormData) {
  const session = await getAgentSession();
  if (!session) {
    return { error: 'Unauthorized', fields: undefined };
  }

  let tenantId: string;
  try {
    tenantId = ensureTenantId(session);
  } catch {
    return { error: 'Missing tenantId', fields: undefined };
  }

  const result = await registerMemberCore(
    { id: session.user.id, name: session.user.name },
    tenantId,
    session.user.branchId ?? null,
    formData
  );
  if (!result.ok) {
    return {
      error: result.error,
      fields: 'fields' in result ? result.fields : undefined,
    };
  }

  const locale = resolveLocaleFromReferer((await headers()).get('referer'));
  revalidatePath(`/${locale}/agent/clients`);
  redirect(`/${locale}/agent/clients`);
}
