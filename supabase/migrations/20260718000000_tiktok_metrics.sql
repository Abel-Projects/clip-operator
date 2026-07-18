-- Store TikTok permalink + enable metrics matching
alter table scheduled_posts
  add column if not exists tiktok_url text;

create index if not exists scheduled_posts_metrics_sync_idx
  on scheduled_posts (status, metrics_synced_at, posted_at desc)
  where status = 'posted';
