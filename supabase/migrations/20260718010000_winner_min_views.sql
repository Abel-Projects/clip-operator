-- Tunable floor for view-based winner reinforcement (raise as the account grows).
alter table autopilot_settings
  add column if not exists winner_min_views int not null default 100;

update autopilot_settings
set winner_min_views = 100
where id = 1 and winner_min_views is null;
