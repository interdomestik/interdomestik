'use server';

import {
  CRM_ACTOR_ROLES,
  type CrmActorContext,
  type CrmActorRole,
} from '@interdomestik/domain-crm/context';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { headers } from 'next/headers';
import { readTenantAuthority } from '@interdomestik/database/tenant-authority';
import { getAgentAuthority, getAgentSession } from './agent/context';
import { createLeadCore } from './agent/create-lead';
import { importMembersCore } from './agent/import-members.core';
import { logActivityCore } from './agent/log-activity';
import { updateLeadStatusCore } from './agent/update-lead-status';
import { importMembersSchema } from './agent/schemas';
import { resolveSponsoredImportAccess } from './agent/sponsored-import-access';

function resolveLocaleFromReferer(referer: string | null): string {
  // Keep in sync with apps/web/src/i18n/routing.ts (localePrefix: 'always').
  const defaultLocale = 'sq';
  const locales = ['sq', 'en', 'sr', 'mk', 'de'] as const;

  if (!referer) return defaultLocale;
  try {
    const url = new URL(referer);
    const first = url.pathname.split('/').find(Boolean);
    if (first && (locales as readonly string[]).includes(first)) return first;
  } catch {
    // ignore
  }
  return defaultLocale;
}

function toCrmActorRole(role: string | null | undefined): CrmActorRole {
  if (role && (CRM_ACTOR_ROLES as readonly string[]).includes(role)) {
    return role as CrmActorRole;
  }
  return 'staff';
}

function createAgentActorContext(
  session: {
    user: { branchId?: string | null; id: string; role?: string | null };
  },
  tenantId: string
): CrmActorContext {
  return {
    actorId: session.user.id,
    role: toCrmActorRole(session.user.role),
    scope: {
      agentId: session.user.id,
      branchId: session.user.branchId ?? null,
    },
    tenantId,
  };
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

  // The lead mutation runs under the session authority, which must grant the actor's tenant.
  const authority = await getAgentAuthority();
  if (!authority || readTenantAuthority(authority).tenantId !== tenantId) {
    return { error: 'Missing tenantId', fields: undefined };
  }

  const actor = createAgentActorContext(session, tenantId);
  const result = await createLeadCore(actor, authority, formData);
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

  let tenantId: string;
  try {
    tenantId = ensureTenantId(session);
  } catch {
    return { error: 'Missing tenantId' };
  }

  // The lead mutation runs under the session authority, which must grant the actor's tenant.
  const authority = await getAgentAuthority();
  if (!authority || readTenantAuthority(authority).tenantId !== tenantId) {
    return { error: 'Missing tenantId' };
  }

  const actor = createAgentActorContext(session, tenantId);
  const result = await updateLeadStatusCore(actor, authority, leadId, stage);
  if ('error' in result) {
    return result;
  }

  const locale = resolveLocaleFromReferer((await headers()).get('referer'));
  revalidatePath(`/${locale}/agent/leads/${leadId}`);
  revalidatePath(`/${locale}/agent/leads`);
  return result;
}

export async function logActivity(leadId: string, type: string, summary: string) {
  const session = await getAgentSession();
  if (!session) {
    return { error: 'Unauthorized' };
  }

  let tenantId: string;
  try {
    tenantId = ensureTenantId(session);
  } catch {
    return { error: 'Missing tenantId' };
  }

  // The lead mutation runs under the session authority, which must grant the actor's tenant.
  const authority = await getAgentAuthority();
  if (!authority || readTenantAuthority(authority).tenantId !== tenantId) {
    return { error: 'Missing tenantId' };
  }

  const actor = createAgentActorContext(session, tenantId);
  const result = await logActivityCore(actor, authority, leadId, type, summary);
  if ('error' in result) {
    return result;
  }

  const locale = resolveLocaleFromReferer((await headers()).get('referer'));
  revalidatePath(`/${locale}/agent/leads/${leadId}`);
  return result;
}

export async function importMembers(prevState: unknown, formData: FormData) {
  const session = await getAgentSession();
  if (!session) {
    return { error: 'Unauthorized', summary: undefined, results: undefined };
  }

  try {
    ensureTenantId(session);
  } catch {
    return { error: 'Missing tenantId', summary: undefined, results: undefined };
  }

  const authority = await getAgentAuthority();
  if (!authority) {
    return { error: 'Missing tenantId', summary: undefined, results: undefined };
  }
  // The page gate is not an authorization boundary: the action itself requires an enabled tenant
  // (OD-18 Option B) and an office-tier agent before it reads the payload.
  const access = await resolveSponsoredImportAccess({ agentId: session.user.id, authority });
  if (access !== 'allowed') {
    return { error: 'Unauthorized', summary: undefined, results: undefined };
  }

  const rowsJson = formData.get('rowsJson');
  if (typeof rowsJson !== 'string') {
    return { error: 'Invalid import payload', summary: undefined, results: undefined };
  }

  let parsedRows: unknown;
  try {
    parsedRows = JSON.parse(rowsJson);
  } catch {
    return { error: 'Invalid import payload', summary: undefined, results: undefined };
  }

  const validated = importMembersSchema.safeParse({
    rows: parsedRows,
  });

  if (!validated.success) {
    return { error: 'Validation failed', summary: undefined, results: undefined };
  }

  const result = await importMembersCore({
    agent: { id: session.user.id, name: session.user.name },
    authority,
    branchId: session.user.branchId ?? null,
    rows: validated.data.rows,
  });

  const locale = resolveLocaleFromReferer((await headers()).get('referer'));
  revalidatePath(`/${locale}/agent/clients`);

  return {
    error: result.error ?? '',
    summary: result.summary,
    results: result.results,
  };
}
