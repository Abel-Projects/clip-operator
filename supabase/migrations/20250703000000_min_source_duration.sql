-- Prefer long-form interview/podcast sources (15–30 min) over shorts.

alter table autopilot_settings
  add column if not exists min_source_duration_min int not null default 15;

update autopilot_settings
set
  min_source_duration_min = 15,
  max_source_duration_min = 30
where id = 1;

-- Drop stale short-form suggestions still waiting for a vote.
delete from content_suggestions
where status = 'pending'
  and duration_sec is not null
  and duration_sec < 15 * 60;
