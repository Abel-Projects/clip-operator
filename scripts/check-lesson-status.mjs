import fs from "node:fs";

const env = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      let v = l.slice(i + 1).trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      return [l.slice(0, i).trim(), v];
    })
);

const url = env.SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
const headers = { apikey: key, Authorization: `Bearer ${key}` };

const settings = await fetch(
  `${url}/rest/v1/autopilot_settings?id=eq.1&select=*`,
  { headers }
).then((r) => r.json());

const lessons = await fetch(
  `${url}/rest/v1/scheduled_posts?content_type=eq.lesson&select=id,status,scheduled_at,caption_title,error_message&order=created_at.desc&limit=5`,
  { headers }
).then((r) => r.json());

console.log(
  JSON.stringify(
    {
      settingsOk: !settings?.message && Array.isArray(settings),
      hasLessonColumns:
        Array.isArray(settings) &&
        settings[0] &&
        "lesson_posts_enabled" in settings[0],
      lesson_posts_enabled: settings?.[0]?.lesson_posts_enabled,
      lesson_posts_per_day: settings?.[0]?.lesson_posts_per_day,
      posts_per_day: settings?.[0]?.posts_per_day,
      enabled: settings?.[0]?.enabled,
      settingsError: settings?.message || settings?.code,
      recentLessons: lessons?.message ? { error: lessons } : lessons
    },
    null,
    2
  )
);
