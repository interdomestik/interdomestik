select
  c.id,
  c.tenant_id,
  c.branch_id,
  c.member_id,
  c."createdAt" as claim_created_at,
  c.submitted_at,
  c.status as current_status,
  h.claim_id,
  h.to_status,
  h.is_public,
  h.created_at as history_created_at
from claim c
left join claim_stage_history h
  on h.claim_id = c.id
 and h.tenant_id = c.tenant_id
where c.tenant_id = 'tenant_ks'
  and c."createdAt" >= timestamp '2026-03-18 00:00:00'
  and c."createdAt" < timestamp '2026-03-19 00:00:00'
order by c."createdAt", h.created_at;

