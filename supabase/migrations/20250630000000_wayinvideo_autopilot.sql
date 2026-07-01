-- WayinVideo autopilot + discovery (provider-agnostic schema)

-- Rename OpusClip-specific columns when present
do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'campaigns' and column_name = 'opus_project_id'
  ) then
    alter table campaigns rename column opus_project_id to provider_project_id;
  end if;
end $$;

do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'campaign_clips' and column_name = 'opus_clip_id'
  ) then
    alter table campaign_clips rename column opus_clip_id to provider_clip_id;
  end if;
end $$;

do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'scheduled_posts' and column_name = 'opus_project_id'
  ) then
    alter table scheduled_posts rename column opus_project_id to provider_project_id;
  end if;
end $$;

do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'scheduled_posts' and column_name = 'opus_clip_id'
  ) then
    alter table scheduled_posts rename column opus_clip_id to provider_clip_id;
  end if;
end $$;

alter table campaigns
  add column if not exists clip_provider text not null default 'wayinvideo';

alter table autopilot_settings
  add column if not exists clip_provider text not null default 'wayinvideo',
  add column if not exists sources_per_day int not null default 4,
  add column if not exists max_source_duration_min int not null default 20,
  add column if not exists discovery_keywords jsonb not null default '[
    "mark cuban interview entrepreneur",
    "barbara corcoran interview advice",
    "kevin o''leary interview business",
    "daymond john entrepreneur interview",
    "lori greiner interview startup",
    "shark tank investor interview podcast",
    "entrepreneur advice startup interview"
  ]'::jsonb,
  add column if not exists discovery_channels jsonb not null default '[
    "UCnnQ2f4XSGDzLkgBGbecBaA",
    "UCnYMOamNKLGVlJgLtbb2JLA",
    "UC6sS9qHuFKBRKW-bpdgLl_w"
  ]'::jsonb;

update autopilot_settings
set
  niche = 'shark_tank_entrepreneurs',
  clip_provider = 'wayinvideo',
  posts_per_day = 24,
  min_hours_between_posts = 1,
  sources_per_day = 4,
  max_source_duration_min = 20,
  max_clips_per_source = 4
where id = 1;
