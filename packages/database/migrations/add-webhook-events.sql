-- Webhook events: idempotency, replay protection signals, and processing outcomes

create table if not exists webhook_events (
  id text primary key,
  provider text not null,
  dedupe_key text not null,
  event_type text,
  event_id text,
  signature_valid boolean not null default false,
  received_at timestamptz not null default now(),
  event_timestamp timestamptz,
  payload_hash text not null,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  processing_result text,
  error text
);

create unique index if not exists webhook_events_dedupe_key_uq
  on webhook_events(dedupe_key);

create unique index if not exists webhook_events_provider_event_id_uq
  on webhook_events(provider, event_id)
  where event_id is not null;

create index if not exists webhook_events_received_at_idx
  on webhook_events(received_at);
