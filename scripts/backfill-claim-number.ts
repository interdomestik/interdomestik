import 'dotenv/config';
import { and, asc, claims, db, eq, isNull, sql } from '@interdomestik/database';
import { generateClaimNumber } from '@interdomestik/database/claim-number';
import { parseBackfillArgs } from './incident-country-backfill-report';

type MissingClaimRow = Awaited<ReturnType<typeof listMissingClaims>>[number];

async function getCoverage(tenantId: string | undefined) {
  // db-access-guard: system-exempt -- reason: dry-run operator coverage counts across tenants
  const [row] = await db
    .select({
      populated: sql<number>`count(${claims.claimNumber})::int`,
      total: sql<number>`count(*)::int`,
    })
    .from(claims)
    .where(tenantId ? eq(claims.tenantId, tenantId) : undefined);
  return { populated: Number(row?.populated ?? 0), total: Number(row?.total ?? 0) };
}

async function listMissingClaims(tenantId: string | undefined, limit: number | undefined) {
  // db-access-guard: system-exempt -- reason: dry-run operator discovery enumerates null-numbered claims
  const query = db
    .select({ id: claims.id, tenantId: claims.tenantId, createdAt: claims.createdAt })
    .from(claims)
    .where(
      tenantId
        ? and(eq(claims.tenantId, tenantId), isNull(claims.claimNumber))
        : isNull(claims.claimNumber)
    )
    .orderBy(asc(claims.tenantId), asc(claims.createdAt), asc(claims.id));
  return limit ? query.limit(limit) : query;
}

async function backfillClaimNumber(row: MissingClaimRow): Promise<'updated' | 'skipped'> {
  if (!row.createdAt) {
    return 'skipped';
  }

  try {
    // db-access-guard: tenant-scoped -- reason: generateClaimNumber guards tenantId + isNull(claimNumber)
    await db.transaction(async tx => {
      await generateClaimNumber(tx, {
        tenantId: row.tenantId,
        claimId: row.id,
        createdAt: row.createdAt,
      });
    });
    return 'updated';
  } catch (err) {
    console.error(`  SKIP ${row.id}: ${err instanceof Error ? err.message : String(err)}`);
    return 'skipped';
  }
}

async function applyBackfill(rows: MissingClaimRow[]) {
  const stats = { updated: 0, skipped: 0 };

  for (const row of rows) {
    const result = await backfillClaimNumber(row);
    stats[result]++;
  }

  return stats;
}

function formatPercent(n: number, d: number) {
  return d === 0 ? '—' : `${((n / d) * 100).toFixed(1)}%`;
}

function formatReport(params: {
  apply: boolean;
  tenantId: string | undefined;
  limit: number | undefined;
  before: Awaited<ReturnType<typeof getCoverage>>;
  after: Awaited<ReturnType<typeof getCoverage>>;
  scanned: number;
  updated: number;
  skipped: number;
}) {
  const lines = [
    '',
    '=== claim-number backfill report ===',
    `  tenant filter : ${params.tenantId ?? '(all)'}`,
    `  limit         : ${params.limit ?? '(none)'}`,
    `  write mode    : ${params.apply ? 'APPLY' : 'dry-run'}`,
    '',
    `  before        : ${params.before.populated}/${params.before.total} populated (${formatPercent(params.before.populated, params.before.total)})`,
  ];

  if (params.apply) {
    lines.push(
      `  after         : ${params.after.populated}/${params.after.total} populated (${formatPercent(params.after.populated, params.after.total)})`
    );
  }

  lines.push('', `  scanned       : ${params.scanned}`);

  if (params.apply) {
    lines.push(`  updated       : ${params.updated}`, `  skipped       : ${params.skipped}`);
  }

  lines.push('');
  return lines.join('\n');
}

async function main() {
  const { apply, tenantId, limit } = parseBackfillArgs();

  const before = await getCoverage(tenantId);
  const missingRows = await listMissingClaims(tenantId, limit);
  const { updated, skipped } = apply
    ? await applyBackfill(missingRows)
    : { updated: 0, skipped: 0 };
  const after = apply ? await getCoverage(tenantId) : before;

  console.log(
    formatReport({
      apply,
      tenantId,
      limit,
      before,
      after,
      scanned: missingRows.length,
      updated,
      skipped,
    })
  );
}

void main().catch(error => {
  console.error(error);
  process.exit(1);
});
