-- Track liveness of home-server components (the SupoClip TikTok publisher agent)
-- so the dashboard can show whether posting is actually happening.

create table if not exists system_heartbeats (
  name text primary key,
  last_seen_at timestamptz not null default now(),
  detail text,
  updated_at timestamptz not null default now()
);

insert into system_heartbeats (name, last_seen_at, detail)
values ('publisher', now() - interval '1 day', 'seeded')
on conflict (name) do nothing;
