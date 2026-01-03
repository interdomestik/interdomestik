alter table "webhook_events"
  alter column "tenant_id" drop not null;

alter table "webhook_events"
  alter column "tenant_id" drop default;
