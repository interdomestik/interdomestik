import {
  acceptSupportHandoffCore as acceptDomainSupportHandoff,
  closeSupportHandoffCore as closeDomainSupportHandoff,
  reassignSupportHandoffCore as reassignDomainSupportHandoff,
} from '@interdomestik/domain-claims/support-handoffs/lifecycle';

import { logAuditEvent } from '@/lib/audit';
import { revalidatePath } from 'next/cache';

import type { Session } from './context';

const LOCALES = ['sq', 'en', 'sr', 'mk'] as const;

function revalidatePathForAllLocales(path: string) {
  for (const locale of LOCALES) {
    revalidatePath(`/${locale}${path}`);
  }
}

function revalidateSupportHandoffPaths() {
  revalidatePathForAllLocales('/staff/support-handoffs');
}

export async function acceptSupportHandoffCore(params: {
  expectedVersion?: number;
  handoffId: string;
  requestHeaders?: Headers;
  session: NonNullable<Session> | null;
}) {
  const result = await acceptDomainSupportHandoff(params, { logAuditEvent });

  if (result.success) {
    revalidateSupportHandoffPaths();
  }

  return result;
}

export async function reassignSupportHandoffCore(params: {
  expectedVersion?: number;
  handoffId: string;
  nextStaffId: string;
  reason: string;
  requestHeaders?: Headers;
  session: NonNullable<Session> | null;
}) {
  const result = await reassignDomainSupportHandoff(params, { logAuditEvent });

  if (result.success) {
    revalidateSupportHandoffPaths();
  }

  return result;
}

export async function closeSupportHandoffCore(params: {
  expectedVersion?: number;
  handoffId: string;
  reason: string;
  requestHeaders?: Headers;
  session: NonNullable<Session> | null;
}) {
  const result = await closeDomainSupportHandoff(params, { logAuditEvent });

  if (result.success) {
    revalidateSupportHandoffPaths();
  }

  return result;
}
