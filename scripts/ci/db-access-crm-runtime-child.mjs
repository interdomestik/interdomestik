import fs from 'node:fs';
import { runCrmRoutingCases } from './db-access-crm-runtime-cases-routing.mjs';
import { runCrmReportingCases } from './db-access-crm-runtime-cases-reporting.mjs';
import { runCrmAuthCases } from './db-access-crm-runtime-cases-auth.mjs';
import { verifyAuthAuthority } from './db-access-crm-runtime-cases-authority.mjs';
import { runCrmSessionCases } from './db-access-crm-runtime-cases-session.mjs';
import { runCrmBackfillCases } from './db-access-crm-runtime-cases-backfill.mjs';
const cases = [];
try {
  for (const [id, run] of [
    ['crm-routing', runCrmRoutingCases],
    ['crm-reporting', runCrmReportingCases],
    ['crm-backfill', runCrmBackfillCases],
    ['crm-auth-member', runCrmAuthCases],
    ['crm-session', runCrmSessionCases],
    ['crm-auth-authority', async () => verifyAuthAuthority(await import('./crm-runtime.cjs'))],
  ]) {
    const assertions = await run();
    cases.push({ id, status: 'passed', assertions });
  }
  fs.writeFileSync('crm-cases-result.json', JSON.stringify({ version: 1, cases }));
  process.exit(0);
} catch (error) {
  console.error(error);
  process.exit(1);
}
