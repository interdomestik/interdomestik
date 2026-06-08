import type { IncidentCountryBackfillPlan } from '@interdomestik/domain-claims';
import { parseArgs } from 'node:util';

export type Coverage = { populated: number; total: number };
export type ScriptOptions = { apply?: boolean; limit?: string; tenant?: string };

export function parseBackfillLimit(value: string | undefined): number | undefined {
  if (!value) return undefined;
  if (!/^[1-9]\d*$/u.test(value)) {
    throw new Error('--limit must be a positive integer');
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error('--limit must be a positive integer');
  }
  return parsed;
}

export function parseBackfillArgs(argv?: string[]): {
  apply: boolean;
  limit: number | undefined;
  tenantId: string | undefined;
} {
  const raw = argv ?? process.argv.slice(2);
  const args = raw[0] === '--' ? raw.slice(1) : raw;
  const { values } = parseArgs({
    args,
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
  return { apply: values.apply ?? false, limit, tenantId };
}

function withPercent(coverage: Coverage) {
  const percent =
    coverage.total === 0 ? '0.00' : ((coverage.populated / coverage.total) * 100).toFixed(2);
  return { ...coverage, percent };
}

export function formatIncidentCountryBackfillReport(args: {
  after: Coverage;
  before: Coverage;
  limit: number | undefined;
  missingScanned: number;
  plan: IncidentCountryBackfillPlan;
  tenantId: string | undefined;
  updated: number;
  writeMode: boolean | undefined;
}): string {
  const projected = {
    ...args.before,
    populated: args.before.populated + args.plan.updates.length,
  };

  return JSON.stringify(
    {
      mode: args.writeMode ? 'apply' : 'dry-run',
      scope: { limit: args.limit ?? null, tenantId: args.tenantId ?? null },
      durableSources: {
        claimPackJson: 'unavailable:no persisted claim-pack JSON source is attached to claims',
        diasporaOriginNotes: 'available:claim_stage_history.note',
      },
      coverage: {
        before: withPercent(args.before),
        after: withPercent(args.after),
        projectedAfterDryRun: withPercent(projected),
      },
      rows: {
        missingScanned: args.missingScanned,
        planned: args.plan.updates.length,
        updated: args.updated,
      },
      skipped: {
        invalidSource: args.plan.skippedInvalidSource,
        noDurableSource: args.plan.skippedNoDurableSource,
      },
      updatesBySource: args.plan.updatesBySource,
    },
    null,
    2
  );
}
