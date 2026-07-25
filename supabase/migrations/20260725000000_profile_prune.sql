-- Soft-delete status for TikTok posts removed to keep the profile looking strong.
do $$
begin
  if not exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'post_status' and e.enumlabel = 'deleted'
  ) then
    alter type post_status add value 'deleted';
  end if;
end $$;

alter table autopilot_settings
  add column if not exists profile_prune_enabled boolean not null default true,
  add column if not exists profile_prune_max_views int not null default 40,
  add column if not exists profile_prune_min_age_hours int not null default 48,
  add column if not exists profile_prune_max_per_run int not null default 5;

update autopilot_settings
set
  profile_prune_enabled = true,
  profile_prune_max_views = 40,
  profile_prune_min_age_hours = 48,
  profile_prune_max_per_run = 5
where id = 1;
