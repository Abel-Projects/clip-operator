-- Post metrics (TikTok sync — Phase 2)
alter table scheduled_posts add column if not exists views bigint;
alter table scheduled_posts add column if not exists likes bigint;
alter table scheduled_posts add column if not exists comments bigint;
alter table scheduled_posts add column if not exists shares bigint;
alter table scheduled_posts add column if not exists metrics_synced_at timestamptz;
