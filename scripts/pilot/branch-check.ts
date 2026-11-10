import { PgDialect } from 'drizzle-orm/pg-core';
import postgres from 'postgres';
import {
  assertPilotAuditVisibility,
  formatPilotBranchReport,
  pilotBranchReportQuery,
  type PilotBranchViolation,
} from '../../packages/database/src/scripts/pilot-branch-report';
import { parsePilotBranchArgs } from '../../packages/database/src/scripts/pilot-branch-target';

// Usage: pnpm pilot:branches:check --tenant tenant_ks --target localhost:5432/dev
// Every target, including production/tunnels, requires host:port/database (never a URL/credential).
// No env files are loaded and no application DB client is imported.
async function main(): Promise<void> {
  const { tenantIds, connection } = parsePilotBranchArgs(process.argv.slice(2), process.env);
  const client = postgres({
    ...connection,
    max: 1,
    connect_timeout: 10,
    onnotice: () => {},
    connection: { default_transaction_read_only: true, statement_timeout: 30000 },
  });
  try {
    const [role] = await client<{ can_audit: boolean }[]>`
      select (rolsuper or rolbypassrls) as can_audit from pg_roles where rolname = current_user`;
    assertPilotAuditVisibility(role?.can_audit);
    const query = new PgDialect().sqlToQuery(pilotBranchReportQuery(tenantIds));
    const parameters = query.params.map(value => {
      if (typeof value !== 'string') throw new Error('Invalid report parameter');
      return value;
    });
    const rows = await client.unsafe<PilotBranchViolation[]>(query.sql, parameters);
    for (const line of formatPilotBranchReport(rows)) console.log(line);
    process.exitCode = rows.length ? 1 : 0;
  } finally {
    await client.end({ timeout: 5 });
  }
}

void main().catch(() => {
  // Driver errors can contain credentials, SQL parameters or record content.
  console.error(
    'Pilot branch check failed. Check tenant arguments, explicit target and audit-role access.'
  );
  process.exitCode = 1;
});
