import {
  CLAIM_LIFECYCLE_INVENTORY_SQL,
  formatLifecycleInventoryReport,
} from './claim-lifecycle-consistency-inventory-report.mjs';

type InventoryRow = {
  category: string;
  status: string | null;
  case_lifecycle_state: string | null;
  recovery_lifecycle_state: string | null;
  count: number | string;
};

async function readInventoryRows(): Promise<InventoryRow[]> {
  const { db, sql } = await import('@interdomestik/database');
  // db-access-guard: system-exempt -- reason: read-only aggregate inventory emits no row-level claim data
  const result = await db.execute(sql.raw(CLAIM_LIFECYCLE_INVENTORY_SQL));
  return Array.from(result.rows ?? []) as InventoryRow[];
}

async function main(): Promise<void> {
  if (process.argv.includes('--sql')) {
    console.log(CLAIM_LIFECYCLE_INVENTORY_SQL);
    return;
  }

  const fromJsonIndex = process.argv.indexOf('--from-json');
  if (fromJsonIndex !== -1) {
    const filePath = process.argv[fromJsonIndex + 1];
    if (!filePath) throw new Error('--from-json requires a file path');
    const { readFile } = await import('node:fs/promises');
    const rows = JSON.parse(await readFile(filePath, 'utf8')) as InventoryRow[];
    console.log(formatLifecycleInventoryReport(rows));
    return;
  }

  const rows = await readInventoryRows();
  console.log(formatLifecycleInventoryReport(rows));
}

void main()
  .then(() => {
    process.exit(0);
  })
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
