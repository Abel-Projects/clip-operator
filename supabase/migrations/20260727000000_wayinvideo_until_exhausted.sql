-- Temporary WayinVideo-first mode: use WayinVideo until credits run out, then fall back to SupoClip.
-- This lets users burn through an accidental subscription renewal before returning to the free pipeline.

alter table autopilot_settings
  add column if not exists wayinvideo_until_exhausted boolean not null default false;

comment on column autopilot_settings.wayinvideo_until_exhausted is
  'When true, prefer WayinVideo for new campaigns until credits are exhausted, then auto-switch to SupoClip.';
