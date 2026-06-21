export const VALID_LIFECYCLE_PAIRS = {
  draft: ['draft', 'not_started'],
  submitted: ['submitted', 'not_started'],
  verification: ['verification', 'not_started'],
  evaluation: ['evaluation', 'not_started'],
  negotiation: ['recovery', 'negotiation'],
  court: ['recovery', 'court'],
  resolved: ['resolved', 'resolved'],
  rejected: ['rejected', 'closed'],
};

export const CLAIM_LIFECYCLE_INVENTORY_SQL = `
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
      when c.status is null
        or c.case_lifecycle_state is null
        or c.recovery_lifecycle_state is null
        then 'null_incomplete'
      when pair.status is null then 'invalid_lifecycle_pair'
      when pair.status <> c.status::text then 'status_lifecycle_mismatch'
      else 'valid'
    end as category
  from claim c
  left join expected pair
    on pair.case_lifecycle_state = c.case_lifecycle_state::text
   and pair.recovery_lifecycle_state = c.recovery_lifecycle_state::text
)
select category, status, case_lifecycle_state, recovery_lifecycle_state, count(*)::int as count
from classified
group by category, status, case_lifecycle_state, recovery_lifecycle_state
order by category, status nulls first, case_lifecycle_state nulls first, recovery_lifecycle_state nulls first;
`.trim();

const CATEGORIES = ['valid', 'invalid_lifecycle_pair', 'null_incomplete', 'status_lifecycle_mismatch'];

export function normalizeInventoryExecuteRows(result) {
  if (Array.isArray(result)) {
    return result;
  }

  if (result && typeof result === 'object' && Array.isArray(result.rows)) {
    return result.rows;
  }

  throw new Error('Unexpected lifecycle inventory query result shape');
}

function numericCount(value) {
  const count = Number(value ?? 0);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error(`Invalid inventory count: ${value}`);
  }
  return count;
}

export function summarizeLifecycleInventory(rows) {
  const byCategory = Object.fromEntries(CATEGORIES.map(category => [category, 0]));
  const groups = [];

  for (const row of rows) {
    const category = String(row.category ?? '');
    if (!CATEGORIES.includes(category)) {
      throw new Error(`Unknown lifecycle inventory category: ${category}`);
    }
    const count = numericCount(row.count);
    byCategory[category] += count;
    groups.push({
      category,
      status: row.status ?? null,
      caseLifecycleState: row.case_lifecycle_state ?? row.caseLifecycleState ?? null,
      recoveryLifecycleState: row.recovery_lifecycle_state ?? row.recoveryLifecycleState ?? null,
      count,
    });
  }

  return {
    byCategory,
    total: Object.values(byCategory).reduce((sum, count) => sum + count, 0),
    groups,
  };
}

export function formatLifecycleInventoryReport(rows, meta = {}) {
  return JSON.stringify(
    {
      report: 'claim_lifecycle_consistency_inventory',
      generatedAt: meta.generatedAt ?? new Date().toISOString(),
      mode: 'read_only_aggregate',
      durableSource: 'claim(status, case_lifecycle_state, recovery_lifecycle_state)',
      categories: {
        valid: 'Lifecycle pair is recognized and maps back to legacy status.',
        invalid_lifecycle_pair: 'Both lifecycle fields are present but not a recognized pair.',
        null_incomplete: 'Status or at least one lifecycle field is null.',
        status_lifecycle_mismatch: 'Lifecycle pair is recognized but maps to a different status.',
      },
      ...summarizeLifecycleInventory(rows),
    },
    null,
    2
  );
}
