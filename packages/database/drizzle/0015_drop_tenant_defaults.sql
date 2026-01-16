-- Remove tenant_id defaults and backfill existing rows.
-- This keeps existing data intact but forces explicit tenant_id on new writes.

-- Backfill users first (anchor for many tables).
update "user"
set tenant_id = 'tenant_mk'
where tenant_id is null;

-- Claims + related tables.
update "claim" c
set tenant_id = u.tenant_id
from "user" u
where c.tenant_id is null
  and c."userId" = u.id;

update "claim_documents" d
set tenant_id = c.tenant_id
from "claim" c
where d.tenant_id is null
  and d.claim_id = c.id;

update "claim_messages" m
set tenant_id = c.tenant_id
from "claim" c
where m.tenant_id is null
  and m.claim_id = c.id;

update "claim_stage_history" h
set tenant_id = c.tenant_id
from "claim" c
where h.tenant_id is null
  and h.claim_id = c.id;

-- Subscriptions + membership tables.
update "subscriptions" s
set tenant_id = u.tenant_id
from "user" u
where s.tenant_id is null
  and s.user_id = u.id;

update "membership_family_members" m
set tenant_id = s.tenant_id
from "subscriptions" s
where m.tenant_id is null
  and m.subscription_id = s.id;

update "membership_plans"
set tenant_id = 'tenant_mk'
where tenant_id is null;

-- Preferences + push.
update "user_notification_preferences" p
set tenant_id = u.tenant_id
from "user" u
where p.tenant_id is null
  and p.user_id = u.id;

update "push_subscriptions" p
set tenant_id = u.tenant_id
from "user" u
where p.tenant_id is null
  and p.user_id = u.id;

-- Agent + commissions.
update "agent_clients" a
set tenant_id = u.tenant_id
from "user" u
where a.tenant_id is null
  and a.agent_id = u.id;

update "agent_clients" a
set tenant_id = u.tenant_id
from "user" u
where a.tenant_id is null
  and a.member_id = u.id;

update "agent_settings" s
set tenant_id = u.tenant_id
from "user" u
where s.tenant_id is null
  and s.agent_id = u.id;

update "agent_commissions" c
set tenant_id = u.tenant_id
from "user" u
where c.tenant_id is null
  and c.agent_id = u.id;

update "agent_commissions" c
set tenant_id = u.tenant_id
from "user" u
where c.tenant_id is null
  and c.member_id = u.id;

update "agent_commissions" c
set tenant_id = s.tenant_id
from "subscriptions" s
where c.tenant_id is null
  and c.subscription_id = s.id;

-- Policies + notifications.
update "policies" p
set tenant_id = u.tenant_id
from "user" u
where p.tenant_id is null
  and p.user_id = u.id;

update "notifications" n
set tenant_id = u.tenant_id
from "user" u
where n.tenant_id is null
  and n.user_id = u.id;

update "email_campaign_logs" e
set tenant_id = u.tenant_id
from "user" u
where e.tenant_id is null
  and e.user_id = u.id;

-- Automation tables.
update "automation_logs" a
set tenant_id = u.tenant_id
from "user" u
where a.tenant_id is null
  and a.user_id = u.id;

update "engagement_email_sends" e
set tenant_id = u.tenant_id
from "user" u
where e.tenant_id is null
  and e.user_id = u.id;

update "nps_survey_tokens" t
set tenant_id = u.tenant_id
from "user" u
where t.tenant_id is null
  and t.user_id = u.id;

update "nps_survey_responses" r
set tenant_id = u.tenant_id
from "user" u
where r.tenant_id is null
  and r.user_id = u.id;

-- CRM + leads.
update "crm_leads" l
set tenant_id = u.tenant_id
from "user" u
where l.tenant_id is null
  and l.agent_id = u.id;

update "crm_activities" a
set tenant_id = l.tenant_id
from "crm_leads" l
where a.tenant_id is null
  and a.lead_id = l.id;

update "crm_deals" d
set tenant_id = l.tenant_id
from "crm_leads" l
where d.tenant_id is null
  and d.lead_id = l.id;


update "leads"
set tenant_id = 'tenant_mk'
where tenant_id is null;

-- Services + referrals.
update "referrals" r
set tenant_id = u.tenant_id
from "user" u
where r.tenant_id is null
  and r.referrer_id = u.id;

update "service_usage" s
set tenant_id = u.tenant_id
from "user" u
where s.tenant_id is null
  and s.user_id = u.id;

update "service_requests" s
set tenant_id = u.tenant_id
from "user" u
where s.tenant_id is null
  and s.user_id = u.id;

update "partner_discount_usage" p
set tenant_id = u.tenant_id
from "user" u
where p.tenant_id is null
  and p.user_id = u.id;

update "lead_downloads"
set tenant_id = 'tenant_mk'
where tenant_id is null;

-- Notes + audit.
update "member_notes" n
set tenant_id = u.tenant_id
from "user" u
where n.tenant_id is null
  and (n.member_id = u.id or n.author_id = u.id);

update "audit_log" a
set tenant_id = u.tenant_id
from "user" u
where a.tenant_id is null
  and a.actor_id = u.id;

-- Drop tenant_id defaults (enforce explicit tenant on new records).
alter table "user" alter column "tenant_id" drop default;
alter table "claim" alter column "tenant_id" drop default;
alter table "claim_documents" alter column "tenant_id" drop default;
alter table "claim_messages" alter column "tenant_id" drop default;
alter table "claim_stage_history" alter column "tenant_id" drop default;
alter table "subscriptions" alter column "tenant_id" drop default;
alter table "membership_plans" alter column "tenant_id" drop default;
alter table "membership_family_members" alter column "tenant_id" drop default;
alter table "user_notification_preferences" alter column "tenant_id" drop default;
alter table "push_subscriptions" alter column "tenant_id" drop default;
alter table "agent_clients" alter column "tenant_id" drop default;
alter table "agent_commissions" alter column "tenant_id" drop default;
alter table "agent_settings" alter column "tenant_id" drop default;
alter table "policies" alter column "tenant_id" drop default;
alter table "notifications" alter column "tenant_id" drop default;
alter table "email_campaign_logs" alter column "tenant_id" drop default;
alter table "automation_logs" alter column "tenant_id" drop default;
alter table "engagement_email_sends" alter column "tenant_id" drop default;
alter table "nps_survey_tokens" alter column "tenant_id" drop default;
alter table "nps_survey_responses" alter column "tenant_id" drop default;
alter table "crm_leads" alter column "tenant_id" drop default;
alter table "crm_activities" alter column "tenant_id" drop default;
alter table "crm_deals" alter column "tenant_id" drop default;
alter table "leads" alter column "tenant_id" drop default;
alter table "referrals" alter column "tenant_id" drop default;
alter table "service_usage" alter column "tenant_id" drop default;
alter table "service_requests" alter column "tenant_id" drop default;
alter table "partner_discount_usage" alter column "tenant_id" drop default;
alter table "lead_downloads" alter column "tenant_id" drop default;
alter table "member_notes" alter column "tenant_id" drop default;
alter table "audit_log" alter column "tenant_id" drop default;
