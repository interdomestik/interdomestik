import { eq, or, supportHandoffs } from '@interdomestik/database';
import { isNull, type SQL } from 'drizzle-orm';
import type { SupportHandoffContactPreference } from './types';

export function normalizeNullableDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function normalizeContactPreference(
  value: string | null | undefined
): SupportHandoffContactPreference {
  if (value === 'phone' || value === 'email' || value === 'whatsapp' || value === 'staff_reply') {
    return value;
  }
  return 'staff_reply';
}

export function buildOwnOrUnassignedStaffScope(staffId: string): SQL<unknown> {
  const scope = or(eq(supportHandoffs.staffId, staffId), isNull(supportHandoffs.staffId));
  if (!scope) {
    throw new Error('Expected own-or-unassigned support handoff scope');
  }
  return scope;
}
