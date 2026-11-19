// The forecast route pair of the CHK-26 contract tests (design §6.2 model) and its helpers.
import { fixtureCase, ids, registryOf, runCheck, tree } from './harness.mjs';

export const F = 'apps/web/src/app/api/cron/crm/forecast-snapshots';
export const TITLE = 'returns 401 and performs no scheduler work when unauthorized';
const forecast = fixtureCase('forecast');
export const ROUTE = forecast[`${F}/route.ts`];
export const TEST = forecast[`${F}/route.test.ts`];
export const forecastEntry = (extra = {}) => ({
  id: 'cron-forecast',
  kind: 'route',
  module: `${F}/route.ts`,
  method: 'GET',
  authentication: 'secret-header',
  effect: 'runCrmForecastSnapshotSchedulerCore',
  deniedTest: { path: `${F}/route.test.ts`, title: TITLE },
  writes: true,
  closedBy: null,
  source: 'fixture',
  ...extra,
});
export const routeProblems = (root, entries) =>
  ids(runCheck('CHK-26', root, registryOf(entries)))
    .filter(id => id.includes('#route:'))
    .map(id => id.split('#route:')[1]);
export const withForecast = (t, route = ROUTE, testText = TEST, more = {}) =>
  tree(t, { [`${F}/route.ts`]: route, [`${F}/route.test.ts`]: testText, ...more });
