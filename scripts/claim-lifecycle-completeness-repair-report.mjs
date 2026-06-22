export const CLAIM_LIFECYCLE_REPAIR_DRY_RUN_SQL = `
with expected(status, case_lifecycle_state, recovery_lifecycle_state) as (
  values
    ('draft', 'draft', 'not_started'),
    ('submitted', 'submitted', 'not_started'),
    ('verification', 'verification', 'not_started'),
    ('evaluation', 'evaluation', 'not_started'),
    ('negotiation', 'recovery', 'negotiation'),
    ('court', 'recovery', 'court'),
    ('resolved', 'resolved', 'resolved'),
    ('rejected', 'rejected', 'closed')
),
classified as (
  select
    c.status::text as status,
    c.case_lifecycle_state::text as case_lifecycle_state,
    c.recovery_lifecycle_state::text as recovery_lifecycle_state,
    case
      when e.status is null and (
        c.case_lifecycle_state is null or c.recovery_lifecycle_state is null
      ) then 'unmappable_incomplete'
      when e.status is not null
       and (c.case_lifecycle_state is null or c.recovery_lifecycle_state is null)
       and (c.case_lifecycle_state is null or c.case_lifecycle_state::text = e.case_lifecycle_state)
       and (
         c.recovery_lifecycle_state is null
         or c.recovery_lifecycle_state::text = e.recovery_lifecycle_state
       ) then 'repairable'
      when e.status is not null
       and (c.case_lifecycle_state is null or c.recovery_lifecycle_state is null)
        then 'blocked_partial_mismatch'
      else 'not_in_scope'
    end as action
  from claim c
  left join expected e on e.status = c.status::text
)
select action, status, case_lifecycle_state, recovery_lifecycle_state, count(*)::int as count
from classified
where action <> 'not_in_scope'
group by action, status, case_lifecycle_state, recovery_lifecycle_state
order by action, status nulls first, case_lifecycle_state nulls first, recovery_lifecycle_state nulls first;
`.trim();

export const CLAIM_LIFECYCLE_REPAIR_APPLY_SQL = `
with expected(status, case_lifecycle_state, recovery_lifecycle_state) as (
  values
    ('draft', 'draft', 'not_started'),
    ('submitted', 'submitted', 'not_started'),
    ('verification', 'verification', 'not_started'),
    ('evaluation', 'evaluation', 'not_started'),
    ('negotiation', 'recovery', 'negotiation'),
    ('court', 'recovery', 'court'),
    ('resolved', 'resolved', 'resolved'),
    ('rejected', 'rejected', 'closed')
),
updated as (
  update claim c
     set case_lifecycle_state = coalesce(c.case_lifecycle_state::text, e.case_lifecycle_state),
         recovery_lifecycle_state = coalesce(
           c.recovery_lifecycle_state::text,
           e.recovery_lifecycle_state
         ),
         "updatedAt" = now()
    from expected e
   where e.status = c.status::text
     and (c.case_lifecycle_state is null or c.recovery_lifecycle_state is null)
     and (c.case_lifecycle_state is null or c.case_lifecycle_state::text = e.case_lifecycle_state)
     and (
       c.recovery_lifecycle_state is null
       or c.recovery_lifecycle_state::text = e.recovery_lifecycle_state
     )
 returning c.status::text as status,
           c.case_lifecycle_state::text as case_lifecycle_state,
           c.recovery_lifecycle_state::text as recovery_lifecycle_state
)
select 'repaired' as action, status, case_lifecycle_state, recovery_lifecycle_state, count(*)::int as count
from updated
group by status, case_lifecycle_state, recovery_lifecycle_state
order by status, case_lifecycle_state, recovery_lifecycle_state;
`.trim();

const ACTIONS = ['repairable', 'blocked_partial_mismatch', 'unmappable_incomplete', 'repaired'];

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
      durableSource: 'claim(status, case_lifecycle_state, recovery_lifecycle_state)',
      pii: 'aggregate_counts_only',
      rollback:
        'Re-run inventory; restore lifecycle fields from backup/snapshot if apply output differs from expected aggregate counts.',
      ...summarizeLifecycleRepair(rows),
    },
    null,
    2
  );
}
