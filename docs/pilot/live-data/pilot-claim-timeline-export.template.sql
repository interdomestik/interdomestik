with claim_history as (
  select
    c.id,
    c.tenant_id,
    c.branch_id,
    c."userId" as member_id,
    c."createdAt" as claim_created_at,
    first_value(h.created_at) over (
      partition by c.id
      order by h.created_at asc
    ) as submitted_at,
    c.status as current_status,
    h.claim_id,
    h.to_status,
    h.is_public,
    h.created_at as history_created_at
  from claim c
  left join claim_stage_history h
    on h.claim_id = c.id
   and h.tenant_id = c.tenant_id
  where c.tenant_id = :'tenant_id'
)
select
  id,
  tenant_id,
  branch_id,
  member_id,
  claim_created_at,
  submitted_at,
  current_status,
  claim_id,
  to_status,
  is_public,
  history_created_at
from claim_history
where history_created_at >= timestamp :'export_window_start'
  and history_created_at < timestamp :'export_window_end'
order by claim_created_at asc, history_created_at asc;
