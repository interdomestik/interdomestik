import fs from 'node:fs';
import { runCrmRoutingCases } from './db-access-crm-runtime-cases-routing.mjs';
import { runCrmReportingCases } from './db-access-crm-runtime-cases-reporting.mjs';
import { runCrmAuthCases } from './db-access-crm-runtime-cases-auth.mjs';
import { verifyAuthAuthority } from './db-access-crm-runtime-cases-authority.mjs';
import { runCrmSessionCases } from './db-access-crm-runtime-cases-session.mjs';
import { runCrmBackfillCases } from './db-access-crm-runtime-cases-backfill.mjs';
import { runCrmBranchManagerCases } from './db-access-crm-runtime-cases-branch-manager.mjs';
import { runCrmConfirmCurrentCases } from './db-access-crm-runtime-cases-confirm-current.mjs';
import { runCrmAgentFlowCases } from './db-access-crm-runtime-cases-agent-flow.mjs';
import { runCrmClassificationAuditCases } from './db-access-crm-runtime-cases-classification-audit.mjs';
import { runCrmClaimStatusNotificationCases } from './db-access-crm-runtime-cases-claim-status-notification.mjs';
const cases = [];
try {
  for (const [id, run] of [
    ['crm-routing', runCrmRoutingCases],
    ['crm-reporting', runCrmReportingCases],
    ['crm-branch-manager', runCrmBranchManagerCases],
    ['crm-backfill', runCrmBackfillCases],
    ['crm-auth-member', runCrmAuthCases],
    ['crm-session', runCrmSessionCases],
    ['crm-auth-authority', async () => verifyAuthAuthority(await import('./crm-runtime.cjs'))],
    ['crm-confirm-current', runCrmConfirmCurrentCases],
    ['crm-agent-flow', runCrmAgentFlowCases],
    ['crm-classification-audit', runCrmClassificationAuditCases],
    ['crm-claim-status-notification', runCrmClaimStatusNotificationCases],
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
