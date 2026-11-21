// Known conservative refusals in the historical application fixture.
export const OUTSIDE_FORWARDS = [
  'scripts/pilot/import-pilot-database.ts',
  'scripts/pilot/scenario_helpers.ts',
];

export const QUERY_ESCAPES = new Map([
  ['apps/web/src/features/admin/verification/components/VerificationList.tsx', [135]],
  ['apps/web/src/features/admin/verification/components/v2/VerificationOpsCenterClient.tsx', [57]],
  ['apps/web/src/features/admin/verification/server/verification-page-data.ts', [26]],
  ['packages/database/src/seed-assert-branch-membership.ts', [68]],
  ['packages/qa/src/tools/db.ts', [19]],
  ['packages/qa/src/tools/repo-search.ts', [47, 84, 94]],
  ['scripts/plan-conformance/memory-precheck.mjs', [79, 193, 202]],
  ['scripts/sentry-alerts-lib.mjs', [143, 189, 322]],
  ['scripts/sentry-alerts.mjs', [216]],
  ['scripts/sentry-enterprise-alerts-lib.mjs', [138]],
  ['scripts/sentry-enterprise-alerts.mjs', [81]],
  ['scripts/sentry-responsiveness-alerts-lib.mjs', [54]],
]);

// Neutralize only the measured sites in the positive test inputs. The separate negative
// cases exercise the exact historical consumers with their original bytes.
export function markFixtureQueryProperties(text, lines) {
  const source = text.split('\n');
  for (const line of lines)
    source[line - 1] = source[line - 1].replace(/\.query\b/gu, '.fixtureQuery');
  return source.join('\n');
}
