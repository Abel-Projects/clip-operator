-- Refocus Clip Operator on the SupoClip (free, home-server) pipeline.
-- Makes SupoClip the default clip provider and reconciles the posting cadence
-- to one honest value: 1 post/hour (24/day, min 1h spacing).

alter table autopilot_settings
  alter column clip_provider set default 'supoclip';

alter table campaigns
  alter column clip_provider set default 'supoclip';

update autopilot_settings
set
  clip_provider = 'supoclip',
  posts_per_day = 24,
  min_hours_between_posts = 1
where id = 1;
