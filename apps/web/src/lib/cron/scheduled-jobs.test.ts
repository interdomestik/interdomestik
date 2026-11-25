// @vitest-environment node
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import vercel from '../../../vercel.json';
import publicEntries from '../public-entry-points.json';
import jobs from './scheduled-jobs.json';

const cronRoot = fileURLToPath(new URL('../../app/api/cron/', import.meta.url));
const routeModule = (url: string) => `apps/web/src/app${url}/route.ts`;

it('declares every cron route exactly once and matches the public-entry methods', () => {
  const routes = readdirSync(cronRoot, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name === 'route.ts')
    .map(
      entry => `/api/cron/${path.relative(cronRoot, entry.parentPath).split(path.sep).join('/')}`
    );
  expect(jobs.routes.map(job => job.path).sort()).toEqual(routes.sort());

  for (const job of jobs.routes) {
    const entries = publicEntries.entries.filter(entry => entry.module === routeModule(job.path));
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      method: job.method,
      authentication: job.state === 'closed' ? 'closed-410' : 'secret-header',
    });
  }
});

it('schedules forecast snapshots only and declares backfill manual-only', () => {
  const scheduled = jobs.routes
    .filter(job => job.state === 'scheduled')
    .map(({ path, schedule }) => ({ path, schedule }));
  expect(scheduled).toEqual([{ path: '/api/cron/crm/forecast-snapshots', schedule: '15 5 * * *' }]);
  expect(vercel.crons).toEqual(scheduled);
  expect(jobs.routes).toContainEqual({
    path: '/api/cron/crm/forecast-snapshots/backfill',
    method: 'POST',
    state: 'manual-only',
  });
  expect(jobs.routes).toContainEqual({
    path: '/api/cron/sponsors',
    method: 'GET',
    state: 'dormant',
  });
});

it('declares a single unscheduled bearer GET that can drain notification deliveries', () => {
  expect(jobs.routes.filter(job => job.path === '/api/cron/notifications')).toEqual([
    { path: '/api/cron/notifications', method: 'GET', state: 'dormant' },
  ]);
  const entries = publicEntries.entries.filter(entry => entry.id === 'cron-notifications');
  expect(entries).toMatchObject([
    {
      kind: 'route',
      module: routeModule('/api/cron/notifications'),
      method: 'GET',
      authentication: 'secret-header',
      effect: 'runNotificationDeliverySchedule',
      writes: true,
      deniedTest: {
        path: 'apps/web/src/app/api/cron/notifications/route.test.ts',
        title: 'returns 401 when unauthorized',
      },
    },
  ]);
});
