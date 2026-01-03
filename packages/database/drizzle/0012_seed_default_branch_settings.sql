-- Seed per-tenant default branch setting used for branch-scoped membership flows.
-- Strategy: choose the earliest created active branch per tenant; if none active, choose the earliest branch.

with tenant_candidates as (
  select
    b.tenant_id,
    (
      select b2.id
      from branches b2
      where b2.tenant_id = b.tenant_id and b2.is_active = true
      order by b2.created_at asc, b2.id asc
      limit 1
    ) as active_branch_id,
    (
      select b3.id
      from branches b3
      where b3.tenant_id = b.tenant_id
      order by b3.created_at asc, b3.id asc
      limit 1
    ) as any_branch_id
  from branches b
  group by b.tenant_id
),
chosen as (
  select
    tenant_id,
    coalesce(active_branch_id, any_branch_id) as branch_id
  from tenant_candidates
  where coalesce(active_branch_id, any_branch_id) is not null
)
insert into tenant_settings (id, tenant_id, category, key, value, created_at, updated_at)
select
  concat('ts:', tenant_id, ':rbac:default_branch_id') as id,
  tenant_id,
  'rbac' as category,
  'default_branch_id' as key,
  jsonb_build_object('branchId', branch_id) as value,
  now() as created_at,
  now() as updated_at
from chosen
on conflict (tenant_id, category, key) do update
set
  value = excluded.value,
  updated_at = excluded.updated_at;
