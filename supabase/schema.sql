-- Contractor AI Ops Dashboard: Postgres schema for Supabase.
-- The Next.js server uses the service-role key (bypasses RLS) and scopes every query by org_id.
-- RLS below protects direct client access (supabase-js with a user JWT) by org membership.

create extension if not exists pgcrypto;

create table orgs (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  webhook_secret text not null,            -- HMAC key for POST /api/events
  created_at     timestamptz not null default now()
);

create table org_members (
  org_id  uuid not null references orgs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (org_id, user_id)
);
create index org_members_user_idx on org_members (user_id);

create type event_type as enum (
  'call.missed', 'call.answered', 'sms.sent', 'lead.created',
  'booking.created', 'job.completed', 'review.requested'
);

create table events (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references orgs(id) on delete cascade,
  type            event_type not null,
  occurred_at     timestamptz not null,
  contact_id      text not null,
  source          text,
  value           numeric(12,2) check (value is null or value >= 0),   -- dollars, job.completed
  idempotency_key text not null,
  created_at      timestamptz not null default now(),
  constraint job_has_value check (type <> 'job.completed' or value is not null),
  constraint events_idem unique (org_id, idempotency_key)               -- replay protection
);
create index events_org_time_idx    on events (org_id, occurred_at);
create index events_org_contact_idx on events (org_id, contact_id, occurred_at);
create index events_org_type_idx    on events (org_id, type, occurred_at);

create table weekly_summaries (
  org_id     uuid not null references orgs(id) on delete cascade,
  week_start date not null,
  summary    text not null,
  actions    jsonb not null,
  created_at timestamptz not null default now(),
  primary key (org_id, week_start)
);

-- Orgs the signed-in user belongs to.
create function auth_org_ids() returns setof uuid
  language sql stable security definer set search_path = public
  as $$ select org_id from org_members where user_id = auth.uid() $$;

alter table orgs             enable row level security;
alter table org_members      enable row level security;
alter table events           enable row level security;
alter table weekly_summaries enable row level security;

-- Members read their own orgs' rows. Writes happen only through the service role (ingestion API, cron).
-- webhook_secret is deliberately not exposed: grant column-level select without it.
create policy orgs_read     on orgs             for select using (id in (select auth_org_ids()));
create policy members_read  on org_members      for select using (user_id = auth.uid());
create policy events_read   on events           for select using (org_id in (select auth_org_ids()));
create policy summary_read  on weekly_summaries for select using (org_id in (select auth_org_ids()));

revoke select on orgs from anon, authenticated;
grant  select (id, name, created_at) on orgs to authenticated;

-- Convenience view for BI tools; honours the caller's RLS.
create view daily_calls with (security_invoker = true) as
select org_id,
       (occurred_at at time zone 'UTC')::date                  as day,
       count(*) filter (where type = 'call.answered')          as answered,
       count(*) filter (where type = 'call.missed')            as missed,
       round(count(*) filter (where type = 'call.answered')::numeric
             / nullif(count(*) filter (where type in ('call.answered','call.missed')), 0), 4) as answer_rate
from events
group by 1, 2;
