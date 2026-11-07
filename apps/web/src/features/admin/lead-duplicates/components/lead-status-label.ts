/** Member lead statuses as stored (`member_leads.status`); each has its own reviewer label. */
export const MEMBER_LEAD_STATUSES = [
  'new',
  'contacted',
  'payment_pending',
  'paid',
  'converted',
  'lost',
  'disqualified',
  'expired',
] as const;

export type LeadStatusLabelKey = `lead_status_${(typeof MEMBER_LEAD_STATUSES)[number] | 'unknown'}`;

/** The `admin.leads.duplicates` key for a stored status; anything unexpected reads as unknown. */
export function leadStatusLabelKey(status: string): LeadStatusLabelKey {
  const known = MEMBER_LEAD_STATUSES.find(value => value === status);
  return `lead_status_${known ?? 'unknown'}`;
}
