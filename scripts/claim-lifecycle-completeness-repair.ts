import {
  CLAIM_LIFECYCLE_REPAIR_APPLY_SQL,
  CLAIM_LIFECYCLE_REPAIR_DRY_RUN_SQL,
  formatLifecycleRepairReport,
  normalizeRepairExecuteRows,
} from './claim-lifecycle-completeness-repair-report.mjs';

type RepairRow = {
  action: string;
  status: string | null;
  case_lifecycle_state: string | null;
  recovery_lifecycle_state: string | null;
  count: number | string;
};

function mode(): 'apply' | 'dry_run' {
  return process.argv.includes('--apply') ? 'apply' : 'dry_run';
}

async function readRepairRows(repairMode: 'apply' | 'dry_run'): Promise<RepairRow[]> {
  const { dbAdmin, sql } = await import('@interdomestik/database');
  const query =
    repairMode === 'apply' ? CLAIM_LIFECYCLE_REPAIR_APPLY_SQL : CLAIM_LIFECYCLE_REPAIR_DRY_RUN_SQL;
  // db-access-guard: system-exempt -- reason: aggregate dry-run-first data repair emits no row-level claim data
  const result = await dbAdmin.execute(sql.raw(query));
  return normalizeRepairExecuteRows(result) as RepairRow[];
}

async function main(): Promise<void> {
  const repairMode = mode();
  if (process.argv.includes('--sql')) {
    console.log(
      repairMode === 'apply' ? CLAIM_LIFECYCLE_REPAIR_APPLY_SQL : CLAIM_LIFECYCLE_REPAIR_DRY_RUN_SQL
    );
    return;
  }

  const fromJsonIndex = process.argv.indexOf('--from-json');
  if (fromJsonIndex !== -1) {
    const filePath = process.argv[fromJsonIndex + 1];
    if (!filePath) throw new Error('--from-json requires a file path');
    const { readFile } = await import('node:fs/promises');
    const rows = JSON.parse(await readFile(filePath, 'utf8')) as RepairRow[];
    console.log(formatLifecycleRepairReport(rows, { mode: repairMode }));
    return;
  }

  const rows = await readRepairRows(repairMode);
  console.log(formatLifecycleRepairReport(rows, { mode: repairMode }));
}

void main()
  .then(() => {
    process.exit(0);
  })
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
