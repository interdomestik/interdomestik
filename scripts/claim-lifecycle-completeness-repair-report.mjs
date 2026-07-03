export const CLAIM_LIFECYCLE_REPAIR_DRY_RUN_SQL = `
with classified as (
  select
    null::text as status,
    c.case_lifecycle_state::text as case_lifecycle_state,
    c.recovery_lifecycle_state::text as recovery_lifecycle_state,
    case
      when c.case_lifecycle_state is null or c.recovery_lifecycle_state is null
        then 'blocked_missing_lifecycle'
      else 'not_in_scope'
    end as action
  from claim c
)
select action, status, case_lifecycle_state, recovery_lifecycle_state, count(*)::int as count
from classified
where action <> 'not_in_scope'
group by action, status, case_lifecycle_state, recovery_lifecycle_state
order by action, status nulls first, case_lifecycle_state nulls first, recovery_lifecycle_state nulls first;
`.trim();

export const CLAIM_LIFECYCLE_REPAIR_APPLY_SQL = `
select 'blocked_post_status_drop' as action,
       null::text as status,
       null::text as case_lifecycle_state,
       null::text as recovery_lifecycle_state,
       0::int as count
where false;
`.trim();

const ACTIONS = ['blocked_missing_lifecycle', 'blocked_post_status_drop'];

function countValue(value) {
  const count = Number(value ?? 0);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error(`Invalid lifecycle repair count: ${value}`);
  }
  return count;
}

export function normalizeRepairExecuteRows(result) {
  if (Array.isArray(result)) return result;
  if (result && typeof result === 'object' && Array.isArray(result.rows)) return result.rows;
  throw new Error('Unexpected lifecycle repair query result shape');
}

export function summarizeLifecycleRepair(rows) {
  const byAction = Object.fromEntries(ACTIONS.map(action => [action, 0]));
  const groups = rows.map(row => {
    const action = String(row.action ?? '');
    if (!ACTIONS.includes(action)) throw new Error(`Unknown lifecycle repair action: ${action}`);
    const count = countValue(row.count);
    byAction[action] += count;
    return {
      action,
      status: row.status ?? null,
      caseLifecycleState: row.case_lifecycle_state ?? row.caseLifecycleState ?? null,
      recoveryLifecycleState: row.recovery_lifecycle_state ?? row.recoveryLifecycleState ?? null,
      count,
    };
  });
  return {
    byAction,
    total: Object.values(byAction).reduce((sum, count) => sum + count, 0),
    groups,
  };
}

export function formatLifecycleRepairReport(rows, meta = {}) {
  return JSON.stringify(
    {
      report: 'claim_lifecycle_completeness_repair',
      generatedAt: meta.generatedAt ?? new Date().toISOString(),
      mode: meta.mode ?? 'dry_run',
      durableSource: 'claim(case_lifecycle_state, recovery_lifecycle_state)',
      pii: 'aggregate_counts_only',
      rollback:
        'Re-run inventory; restore lifecycle fields from backup/snapshot if blocked missing lifecycle rows are present.',
      ...summarizeLifecycleRepair(rows),
    },
    null,
    2
  );
}
