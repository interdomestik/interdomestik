import 'dotenv/config';
import { and, asc, claims, db, eq, isNull, sql } from '@interdomestik/database';
import { generateClaimNumber } from '@interdomestik/database/claim-number';
import { parseArgs } from 'node:util';
import { parseBackfillLimit, type ScriptOptions } from './incident-country-backfill-report';

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

async function main() {
  const args = process.argv.slice(2);
  const parsedArgs = args[0] === '--' ? args.slice(1) : args;
  const { values } = parseArgs({
    args: parsedArgs,
    options: {
      apply: { type: 'boolean' },
      limit: { type: 'string' },
      tenant: { type: 'string' },
    },
  }) as { values: ScriptOptions };

  const tenantId = values.tenant;
  const limit = parseBackfillLimit(values.limit);

  if (values.apply && !tenantId && !limit) {
    throw new Error('--apply requires --tenant or --limit to avoid an unbounded write run');
  }

  const before = await getCoverage(tenantId);
  const missingRows = await listMissingClaims(tenantId, limit);

  let updated = 0;
  let skipped = 0;

  if (values.apply) {
    for (const row of missingRows) {
      if (!row.createdAt) {
        skipped++;
        continue;
      }
      const createdAt = row.createdAt;
      try {
        // db-access-guard: tenant-scoped -- reason: generateClaimNumber guards tenantId + isNull(claimNumber)
        await db.transaction(async tx => {
          await generateClaimNumber(tx, {
            tenantId: row.tenantId,
            claimId: row.id,
            createdAt,
          });
        });
        updated++;
      } catch (err) {
        console.error(`  SKIP ${row.id}: ${err instanceof Error ? err.message : String(err)}`);
        skipped++;
      }
    }
  }

  const after = values.apply ? await getCoverage(tenantId) : before;
  const pct = (n: number, d: number) => (d === 0 ? '—' : `${((n / d) * 100).toFixed(1)}%`);

  console.log(
    [
      '',
      '=== claim-number backfill report ===',
      `  tenant filter : ${tenantId ?? '(all)'}`,
      `  limit         : ${limit ?? '(none)'}`,
      `  write mode    : ${values.apply ? 'APPLY' : 'dry-run'}`,
      '',
      `  before        : ${before.populated}/${before.total} populated (${pct(before.populated, before.total)})`,
      values.apply
        ? `  after         : ${after.populated}/${after.total} populated (${pct(after.populated, after.total)})`
        : '',
      '',
      `  scanned       : ${missingRows.length}`,
      values.apply ? `  updated       : ${updated}` : '',
      values.apply ? `  skipped       : ${skipped}` : '',
      '',
    ]
      .filter(l => l !== undefined)
      .join('\n')
  );
}

void main().catch(error => {
  console.error(error);
  process.exit(1);
});
