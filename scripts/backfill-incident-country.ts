import 'dotenv/config';
import {
  and,
  asc,
  claimStageHistory,
  claims,
  db,
  eq,
  inArray,
  isNull,
  sql,
} from '@interdomestik/database';
import {
  buildIncidentCountryBackfillPlan,
  type IncidentCountryBackfillRow,
} from '@interdomestik/domain-claims';
import {
  formatIncidentCountryBackfillReport,
  parseBackfillArgs,
  type Coverage,
} from './incident-country-backfill-report';

async function getCoverage(tenantId: string | undefined): Promise<Coverage> {
  // db-access-guard: system-exempt -- reason: dry-run operator coverage may report cross-tenant aggregate counts without row details
  const [row] = await db
    .select({
      populated: sql<number>`count(${claims.incidentCountryCode})::int`,
      total: sql<number>`count(*)::int`,
    })
    .from(claims)
    .where(tenantId ? eq(claims.tenantId, tenantId) : undefined);

  return { populated: Number(row?.populated ?? 0), total: Number(row?.total ?? 0) };
}

async function listMissingClaims(tenantId: string | undefined, limit: number | undefined) {
  // db-access-guard: system-exempt -- reason: dry-run operator discovery may enumerate missing rows across tenants before scoped apply
  const query = db
    .select({
      id: claims.id,
      incidentCountryCode: claims.incidentCountryCode,
      tenantId: claims.tenantId,
    })
    .from(claims)
    .where(
      tenantId
        ? and(eq(claims.tenantId, tenantId), isNull(claims.incidentCountryCode))
        : isNull(claims.incidentCountryCode)
    )
    .orderBy(asc(claims.tenantId), asc(claims.createdAt), asc(claims.id));
  return limit ? query.limit(limit) : query;
}

async function listDiasporaNotes(
  claimRows: IncidentCountryBackfillRow[],
  tenantId: string | undefined
) {
  const claimIds = claimRows.map(row => row.id);
  if (claimIds.length === 0) return new Map<string, Array<string | null>>();

  // db-access-guard: system-exempt -- reason: dry-run operator discovery reads public notes for selected claim ids only
  const rows = await db
    .select({ claimId: claimStageHistory.claimId, note: claimStageHistory.note })
    .from(claimStageHistory)
    .where(
      and(
        tenantId ? eq(claimStageHistory.tenantId, tenantId) : undefined,
        eq(claimStageHistory.isPublic, true),
        inArray(claimStageHistory.claimId, claimIds)
      )
    )
    .orderBy(asc(claimStageHistory.claimId), asc(claimStageHistory.createdAt));

  const notesByClaimId = new Map<string, Array<string | null>>();
  rows.forEach(row => {
    const notes = notesByClaimId.get(row.claimId) ?? [];
    notes.push(row.note);
    notesByClaimId.set(row.claimId, notes);
  });
  return notesByClaimId;
}

async function main() {
  const { apply, tenantId, limit } = parseBackfillArgs();
  const before = await getCoverage(tenantId);
  const missingRows = await listMissingClaims(tenantId, limit);
  const notesByClaimId = await listDiasporaNotes(missingRows, tenantId);
  const plan = buildIncidentCountryBackfillPlan(
    missingRows.map(row => ({ ...row, diasporaPublicNotes: notesByClaimId.get(row.id) ?? [] }))
  );

  let updated = 0;
  if (apply) {
    for (const update of plan.updates) {
      // db-access-guard: tenant-scoped -- reason: update includes tenant_id and still-null guard to preserve live incident-country values
      const rows = await db
        .update(claims)
        .set({
          incidentCountryCode: update.incidentCountryCode,
          incidentJurisdiction: update.incidentJurisdiction,
        })
        .where(
          and(
            eq(claims.id, update.claimId),
            eq(claims.tenantId, update.tenantId),
            isNull(claims.incidentCountryCode)
          )
        )
        .returning({ id: claims.id });
      updated += rows.length;
    }
  }

  const after = apply ? await getCoverage(tenantId) : before;
  console.log(
    formatIncidentCountryBackfillReport({
      after,
      before,
      limit,
      missingScanned: missingRows.length,
      plan,
      tenantId,
      updated,
      writeMode: apply,
    })
  );
}

void main().catch(error => {
  console.error(error);
  process.exit(1);
});
