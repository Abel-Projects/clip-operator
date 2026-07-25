#!/usr/bin/env python3
"""
Delete underperforming TikTok posts so the public profile stays strong.

Claims prune jobs from clip-operator, deletes via Studio session cookies,
then marks rows status=deleted. Caps are enforced server-side.
"""

from __future__ import annotations

import importlib.util
import json
import os
import sys
import time
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

try:
    from dotenv import load_dotenv
except ImportError:
    load_dotenv = None  # type: ignore[assignment,misc]

if load_dotenv:
    load_dotenv(Path(__file__).resolve().parent / ".env")


def env(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


def require_env(name: str) -> str:
    value = env(name)
    if not value:
        raise RuntimeError(f"Missing required env var: {name}")
    return value


def http_json(
    method: str,
    url: str,
    *,
    body: dict | None = None,
    headers: dict[str, str] | None = None,
) -> dict:
    data = None
    req_headers = {"Accept": "application/json"}
    if headers:
        req_headers.update(headers)
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        req_headers["Content-Type"] = "application/json"

    request = Request(url, data=data, headers=req_headers, method=method)
    try:
        with urlopen(request, timeout=120) as response:
            raw = response.read().decode("utf-8")
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {exc.code} {url}: {detail}") from exc
    except URLError as exc:
        raise RuntimeError(f"Request failed {url}: {exc}") from exc

    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Invalid JSON from {url}: {raw[:200]}") from exc


def agent_headers() -> dict[str, str]:
    secret = env("PUBLISH_AGENT_SECRET") or env("CRON_SECRET")
    if not secret:
        raise RuntimeError("Set PUBLISH_AGENT_SECRET or CRON_SECRET")
    return {"Authorization": f"Bearer {secret}"}


def load_metrics_module() -> Any:
    path = Path(__file__).resolve().parent / "metrics-agent.py"
    spec = importlib.util.spec_from_file_location("metrics_agent", path)
    if spec is None or spec.loader is None:
        raise RuntimeError("metrics-agent.py not found")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def claim_prune_jobs() -> list[dict[str, Any]]:
    base = require_env("CLIP_OPERATOR_URL").rstrip("/")
    payload = http_json(
        "POST",
        f"{base}/api/autopilot/prune-jobs/next",
        headers=agent_headers(),
    )
    if not payload.get("ok"):
        raise RuntimeError(payload.get("message", "prune claim failed"))
    if not payload.get("needed"):
        return []
    jobs = payload.get("jobs") or []
    return [j for j in jobs if isinstance(j, dict)]


def complete_prune(post_id: str, ok: bool, message: str) -> None:
    base = require_env("CLIP_OPERATOR_URL").rstrip("/")
    http_json(
        "POST",
        f"{base}/api/autopilot/prune-jobs/{post_id}/complete",
        body={"ok": ok, "message": message},
        headers=agent_headers(),
    )


def delete_video_via_studio(account: str, video_id: str) -> None:
    """Use the logged-in Studio session to delete one aweme/video."""
    from playwright.sync_api import sync_playwright

    metrics = load_metrics_module()
    cookies = metrics.load_session_cookies(account)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={"width": 1280, "height": 900},
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/122.0.0.0 Safari/537.36"
            ),
        )
        context.add_cookies(cookies)
        page = context.new_page()
        page.goto(
            "https://www.tiktok.com/tiktokstudio/content",
            wait_until="domcontentloaded",
            timeout=90_000,
        )
        page.wait_for_timeout(5_000)

        result = page.evaluate(
            """async (videoId) => {
              const urls = [
                `https://www.tiktok.com/api/aweme/delete/?aweme_id=${videoId}&target=${videoId}`,
                `https://www.tiktok.com/tiktok/creator/item/delete?item_id=${videoId}`,
              ];
              const out = [];
              for (const url of urls) {
                try {
                  const res = await fetch(url, {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                  });
                  const text = await res.text();
                  let json = null;
                  try { json = JSON.parse(text); } catch (_) {}
                  out.push({ url, status: res.status, text: text.slice(0, 400), json });
                  const msg = (json && (json.status_msg || json.message || json.msg)) || '';
                  const code = json && (json.status_code ?? json.code);
                  if (res.ok && String(msg).toLowerCase() !== 'login expired') {
                    if (code === 0 || code === '0' || /success|ok|deleted/i.test(String(msg)) || !msg) {
                      return { ok: true, via: url, status: res.status, msg, raw: text.slice(0, 200) };
                    }
                    if (!/fail|error|expired|denied/i.test(String(msg))) {
                      return { ok: true, via: url, status: res.status, msg, raw: text.slice(0, 200) };
                    }
                  }
                } catch (e) {
                  out.push({ url, error: String(e) });
                }
              }
              return { ok: false, attempts: out };
            }""",
            video_id,
        )

        if not result.get("ok"):
            # UI fallback: open video page manage / try Studio delete control
            page.goto(
                f"https://www.tiktok.com/@/video/{video_id}",
                wait_until="domcontentloaded",
                timeout=60_000,
            )
            page.wait_for_timeout(3_000)
            # Some accounts need the creator manage URL
            page.goto(
                f"https://www.tiktok.com/tiktokstudio/content?enter_from=video_manage&item_id={video_id}",
                wait_until="domcontentloaded",
                timeout=60_000,
            )
            page.wait_for_timeout(4_000)

            clicked = page.evaluate(
                """async () => {
                  const labels = ['Delete', 'delete', 'Remove'];
                  const nodes = Array.from(document.querySelectorAll('button, [role="menuitem"], div[class*="delete"]'));
                  for (const el of nodes) {
                    const t = (el.innerText || el.textContent || '').trim();
                    if (labels.some((l) => t === l || t.toLowerCase().includes('delete'))) {
                      el.click();
                      return t;
                    }
                  }
                  return null;
                }"""
            )
            page.wait_for_timeout(1_500)
            if clicked:
                page.evaluate(
                    """() => {
                      const nodes = Array.from(document.querySelectorAll('button'));
                      for (const el of nodes) {
                        const t = (el.innerText || '').trim().toLowerCase();
                        if (t === 'delete' || t === 'confirm' || t === 'ok') {
                          el.click();
                          return true;
                        }
                      }
                      return false;
                    }"""
                )
                page.wait_for_timeout(2_000)
                browser.close()
                return

            browser.close()
            raise RuntimeError(f"TikTok delete failed for {video_id}: {result}")

        browser.close()


def should_run_now(min_interval_sec: int = 3600) -> bool:
    marker = Path(__file__).resolve().parent / ".prune-last-run"
    now = time.time()
    if marker.is_file():
        try:
            last = float(marker.read_text(encoding="utf-8").strip())
            if now - last < min_interval_sec:
                return False
        except (OSError, ValueError):
            pass
    return True


def mark_ran() -> None:
    marker = Path(__file__).resolve().parent / ".prune-last-run"
    marker.write_text(str(time.time()), encoding="utf-8")


def run_once(*, force: bool = False) -> bool:
    if not force and not should_run_now():
        print("Profile prune skipped (cooldown).")
        return False

    jobs = claim_prune_jobs()
    if not jobs:
        print("No posts need profile prune.")
        mark_ran()
        return False

    account = env("TIKTOK_ACCOUNT_NAME")
    if not account:
        raise RuntimeError("Set TIKTOK_ACCOUNT_NAME for profile prune")

    print(f"Pruning {len(jobs)} low-view post(s) from TikTok profile…")
    deleted = 0
    for job in jobs:
        post_id = str(job.get("id") or "")
        video_id = str(job.get("videoId") or "")
        views = job.get("views")
        if not post_id or not video_id:
            continue
        try:
            print(f"  Deleting {video_id} (post {post_id}, {views} views)…")
            delete_video_via_studio(account, video_id)
            complete_prune(
                post_id,
                True,
                f"Pruned from profile ({views} views)",
            )
            deleted += 1
            time.sleep(2)
        except Exception as exc:  # noqa: BLE001
            print(f"  FAILED {video_id}: {exc}", file=sys.stderr)
            try:
                complete_prune(post_id, False, str(exc))
            except Exception as report_exc:  # noqa: BLE001
                print(f"  Could not report failure: {report_exc}", file=sys.stderr)

    mark_ran()
    print(f"Deleted {deleted}/{len(jobs)} posts from TikTok.")
    return deleted > 0


def main() -> int:
    force = "--force" in sys.argv
    try:
        run_once(force=force)
    except Exception as exc:  # noqa: BLE001
        print(exc, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
