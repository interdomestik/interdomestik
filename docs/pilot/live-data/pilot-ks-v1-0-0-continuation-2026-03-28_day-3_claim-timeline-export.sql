-- Pilot: pilot-ks-v1-0-0-continuation-2026-03-28
-- Day: 3
-- Window: 2026-03-30 00:00:00 to 2026-03-31 00:00:00

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
  and c."createdAt" >= timestamp :'export_window_start'
  and c."createdAt" < timestamp :'export_window_end'
order by c."createdAt" asc, h.created_at asc;
