create table if not exists audit_log (
  id text primary key,
  actor_id text references "user"(id),
  actor_role text,
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamp not null default now()
);

create index if not exists audit_log_entity_idx on audit_log (entity_type, entity_id);
create index if not exists audit_log_actor_idx on audit_log (actor_id);
create index if not exists audit_log_created_at_idx on audit_log (created_at);
