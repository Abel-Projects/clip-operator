-- Clip Operator autopilot (OpusClip → scheduled TikTok posts)
-- Run in a dedicated Supabase project (recommended) or any empty Postgres database.

create extension if not exists "pgcrypto";

create table if not exists autopilot_settings (
  id int primary key default 1 check (id = 1),
  niche text not null default 'sharks',
  max_clips_per_source int not null default 4,
  posts_per_day int not null default 4,
  min_hours_between_posts numeric not null default 3,
  min_clip_score numeric not null default 0,
  timezone text not null default 'America/New_York',
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into autopilot_settings (id) values (1)
on conflict (id) do nothing;

create type campaign_status as enum (
  'pending',
  'clipping',
  'scheduling',
  'active',
  'done',
  'failed'
);

create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  source_url text not null,
  niche text not null default 'sharks',
  opus_project_id text,
  status campaign_status not null default 'pending',
  error_message text,
  poll_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists campaign_clips (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  opus_clip_id text not null,
  title text,
  score numeric,
  duration_sec numeric,
  preview_url text,
  rank int not null default 0,
  selected boolean not null default false,
  unique (campaign_id, opus_clip_id)
);

create type post_status as enum ('queued', 'posting', 'posted', 'failed');

create table if not exists scheduled_posts (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  campaign_clip_id uuid not null references campaign_clips(id) on delete cascade,
  opus_project_id text not null,
  opus_clip_id text not null,
  scheduled_at timestamptz not null,
  posted_at timestamptz,
  status post_status not null default 'queued',
  caption_title text,
  caption_description text,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists idx_campaigns_status on campaigns(status);
create index if not exists idx_campaigns_created on campaigns(created_at desc);
create index if not exists idx_scheduled_posts_due on scheduled_posts(status, scheduled_at);

create or replace function touch_campaign_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists campaigns_updated_at on campaigns;
create trigger campaigns_updated_at
  before update on campaigns
  for each row execute function touch_campaign_updated_at();
