-- Narrated Shark Tank lesson posts (same TikTok page, different content type).

alter table public.scheduled_posts
  add column if not exists content_type text not null default 'clip';

alter table public.scheduled_posts
  add column if not exists local_video_path text;

alter table public.autopilot_settings
  add column if not exists lesson_posts_enabled boolean not null default true;

alter table public.autopilot_settings
  add column if not exists lesson_posts_per_day integer not null default 1;

comment on column public.scheduled_posts.content_type is
  'clip = SupoClip episode cut; lesson = narrated on-niche Shark Tank lesson';

comment on column public.scheduled_posts.local_video_path is
  'Home-server absolute path to rendered lesson mp4 (content_type=lesson)';
