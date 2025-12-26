export type EngagementCadence = {
  templateKey: 'onboarding' | 'checkin' | 'day30' | 'day60' | 'day90';
  daysSinceSubscriptionCreated: number;
};

export const ENGAGEMENT_CADENCE: EngagementCadence[] = [
  { templateKey: 'onboarding', daysSinceSubscriptionCreated: 7 },
  { templateKey: 'checkin', daysSinceSubscriptionCreated: 14 },
  { templateKey: 'day30', daysSinceSubscriptionCreated: 30 },
  { templateKey: 'day60', daysSinceSubscriptionCreated: 60 },
  { templateKey: 'day90', daysSinceSubscriptionCreated: 90 },
];

export function getDayWindow(now: Date, daysAgo: number) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - daysAgo);

  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);

  return { start, end };
}
