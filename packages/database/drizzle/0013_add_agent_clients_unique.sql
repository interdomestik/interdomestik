-- Ensure agent->member ownership is canonical and safe to upsert.
--
-- This migration:
-- 1) Removes any accidental duplicate rows per (tenant_id, agent_id, member_id)
-- 2) Adds a unique index to prevent future duplicates

with ranked as (
  select
    id,
    row_number() over (
      partition by tenant_id, agent_id, member_id
      order by created_at desc nulls last, joined_at desc nulls last, id desc
    ) as rn
  from agent_clients
)
delete from agent_clients
where id in (select id from ranked where rn > 1);

create unique index if not exists "agent_clients_tenant_agent_member_uq"
  on "agent_clients" ("tenant_id", "agent_id", "member_id");
