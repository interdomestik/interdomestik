export const scheduledJobs = Object.freeze({
  routes: [
    { path: '/api/cron/engagement', method: 'GET', state: 'closed' },
    { path: '/api/cron/nps', method: 'GET', state: 'closed' },
    { path: '/api/cron/dunning', method: 'GET', state: 'closed' },
    { path: '/api/cron/sponsors', method: 'GET', state: 'dormant' },
    { path: '/api/cron/notifications', method: 'GET', state: 'dormant' },
    {
      path: '/api/cron/crm/forecast-snapshots',
      method: 'GET',
      state: 'scheduled',
      schedule: '15 5 * * *',
    },
    {
      path: '/api/cron/crm/forecast-snapshots/backfill',
      method: 'POST',
      state: 'manual-only',
    },
  ],
  inngestTimers: [
    { id: 'daily-email-sequences', state: 'dormant' },
    { id: 'notification-deliveries', state: 'scheduled', schedule: '*/5 * * * *' },
    { id: 'seasonal-campaigns', state: 'dormant' },
  ],
} as const);
