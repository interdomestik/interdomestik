import { ensureTenantId } from '@interdomestik/shared-auth';

import type { SupportHandoffSession } from './types';

export function normalizeNullableDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function requireSupportHandoffMemberSession(session: SupportHandoffSession | null) {
  if (session?.user?.role !== 'member' && session?.user?.role !== 'user') {
    return null;
  }

  let tenantId: string;
  try {
    tenantId = ensureTenantId(session);
  } catch {
    return null;
  }

  return { tenantId, user: session.user };
}

export function isCurrentResponseAcknowledged(args: {
  acknowledgedAt: Date | string | null;
  acknowledgedById: string | null;
  acknowledgedVersion: number | null;
  memberId: string;
  publicResponseVersion: number;
}) {
  return (
    args.acknowledgedById === args.memberId &&
    args.acknowledgedVersion === args.publicResponseVersion &&
    normalizeNullableDate(args.acknowledgedAt) != null
  );
}
