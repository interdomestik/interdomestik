-- Engagement email sends: idempotent lifecycle email cadence tracking

create table if not exists engagement_email_sends (
  id text primary key,
  user_id text not null references "user"(id) on delete cascade,
  subscription_id text references subscriptions(id) on delete set null,
  template_key text not null,
  dedupe_key text not null,
  status text not null,
  provider_message_id text,
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  metadata jsonb
);

create unique index if not exists engagement_email_sends_dedupe_key_uq
  on engagement_email_sends(dedupe_key);

create index if not exists engagement_email_sends_user_id_idx
  on engagement_email_sends(user_id);

create index if not exists engagement_email_sends_subscription_id_idx
  on engagement_email_sends(subscription_id);

create index if not exists engagement_email_sends_created_at_idx
  on engagement_email_sends(created_at);
