import { createMemberSupportHandoffCore as createDomainSupportHandoff } from '@interdomestik/domain-claims/support-handoffs/create';
import type { SupportHandoffContactPreference } from '@interdomestik/domain-claims/support-handoffs/types';

import { logAuditEvent } from '@/lib/audit';
import { revalidatePath } from 'next/cache';

import type { Session } from './context';

const LOCALES = ['sq', 'en', 'sr', 'mk'] as const;
const CONTACT_PREFERENCES = ['staff_reply', 'phone', 'email', 'whatsapp'] as const;

function normalizeContactPreference(value: unknown): SupportHandoffContactPreference {
  return typeof value === 'string' &&
    CONTACT_PREFERENCES.includes(value as SupportHandoffContactPreference)
    ? (value as SupportHandoffContactPreference)
    : 'staff_reply';
}

function revalidatePathForAllLocales(path: string) {
  for (const locale of LOCALES) {
    revalidatePath(`/${locale}${path}`);
  }
}

export async function createMemberSupportHandoffCore(params: {
  input: Record<string, unknown>;
  requestHeaders?: Headers;
  session: NonNullable<Session> | null;
}) {
  const input = {
    ...params.input,
    claimId: typeof params.input.claimId === 'string' ? params.input.claimId : null,
    contactPreference: normalizeContactPreference(params.input.contactPreference),
    message: typeof params.input.message === 'string' ? params.input.message : '',
    subject: typeof params.input.subject === 'string' ? params.input.subject : '',
  };
  const result = await createDomainSupportHandoff({ ...params, input }, { logAuditEvent });

  if (result.success) {
    revalidatePathForAllLocales('/member/help');
    revalidatePathForAllLocales('/staff/support-handoffs');
  }

  return result;
}
