-- Phase 5: NPS survey automation (tokens + responses)

create table if not exists nps_survey_tokens (
  id text primary key,
  user_id text not null references "user"(id) on delete cascade,
  subscription_id text references subscriptions(id) on delete set null,
  dedupe_key text not null,
  token text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  used_at timestamptz,
  metadata jsonb
);

create unique index if not exists nps_survey_tokens_dedupe_key_uq
  on nps_survey_tokens(dedupe_key);

create unique index if not exists nps_survey_tokens_token_uq
  on nps_survey_tokens(token);

create index if not exists nps_survey_tokens_user_id_idx
  on nps_survey_tokens(user_id);

create index if not exists nps_survey_tokens_subscription_id_idx
  on nps_survey_tokens(subscription_id);

create index if not exists nps_survey_tokens_created_at_idx
  on nps_survey_tokens(created_at);

create table if not exists nps_survey_responses (
  id text primary key,
  token_id text not null references nps_survey_tokens(id) on delete cascade,
  user_id text not null references "user"(id) on delete cascade,
  subscription_id text references subscriptions(id) on delete set null,
  score int not null,
  comment text,
  created_at timestamptz not null default now(),
  metadata jsonb
);

create index if not exists nps_survey_responses_user_id_idx
  on nps_survey_responses(user_id);

create index if not exists nps_survey_responses_subscription_id_idx
  on nps_survey_responses(subscription_id);

create index if not exists nps_survey_responses_created_at_idx
  on nps_survey_responses(created_at);
