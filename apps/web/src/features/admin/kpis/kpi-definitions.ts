import { claims, leadPaymentAttempts } from '@interdomestik/database/schema';
import { and, eq, inArray, lt } from 'drizzle-orm';

/**
 * Statuses that are considered "Open" for KPI tracking.
 * These represent active operational workload.
 */
export const OPEN_CLAIMS_STATUSES = [
  'draft',
  'submitted',
  'verification',
  'evaluation',
  'negotiation',
  'court',
] as const;

/**
 * Milliseconds in 30 days.
 */
const SLA_THRESHOLD_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Helper to get the cut-off date for SLA breaches.
 * Returns a Date object 30 days in the past.
 */
export function getSlaThresholdDate(): Date {
  const date = new Date();
  date.setTime(date.getTime() - SLA_THRESHOLD_MS);
  return date;
}

/**
 * Drizzle filter for Open Claims.
 * Usage: .where(and(tenantFilter, getOpenClaimsFilter()))
 */
export function getOpenClaimsFilter() {
  return inArray(claims.status, [...OPEN_CLAIMS_STATUSES]);
}

/**
 * Drizzle filter for SLA Breaches.
 * Definition: Status is 'submitted' AND createdAt is older than 30 days.
 */
export function getSlaBreachesFilter() {
  const threshold = getSlaThresholdDate();
  return and(eq(claims.status, 'submitted'), lt(claims.createdAt, threshold));
}

/**
 * Drizzle filter for Cash Pending.
 * Definition: Method is 'cash' AND status is 'pending'.
 */
// Moved import to top

/**
 * Drizzle filter for Cash Pending.
 * Definition: Method is 'cash' AND status is 'pending'.
 */
export function getCashPendingFilter() {
  return and(eq(leadPaymentAttempts.method, 'cash'), eq(leadPaymentAttempts.status, 'pending'));
}
