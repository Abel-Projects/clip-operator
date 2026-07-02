-- Upcoming-content suggestions the user can upvote/downvote before clipping.

create table if not exists content_suggestions (
  id uuid primary key default gen_random_uuid(),
  video_id text not null,
  url text not null unique,
  title text,
  channel_title text,
  duration_sec numeric,
  thumbnail_url text,
  score int not null default 0,
  status text not null default 'pending', -- pending | approved | rejected
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists content_suggestions_status_idx
  on content_suggestions (status, score desc, created_at desc);

alter table content_suggestions enable row level security;

-- When on, discovery keeps auto-queueing a source each tick (current behavior).
-- When off, discovery only proposes suggestions and waits for an upvote.
alter table autopilot_settings
  add column if not exists auto_approve_sources boolean not null default true;
