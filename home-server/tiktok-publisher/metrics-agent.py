#!/usr/bin/env python3
"""
Scrape TikTok Studio item stats and push them to clip-operator.

Uses the same session cookies as the publisher (tiktok_session-{account}.cookie).
Runs on the home server; Vercel never touches TikTok cookies.
"""

from __future__ import annotations

import json
import os
import pickle
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


def claim_metrics_job() -> dict | None:
    base = require_env("CLIP_OPERATOR_URL").rstrip("/")
    payload = http_json(
        "POST",
        f"{base}/api/autopilot/metrics-jobs/next",
        headers=agent_headers(),
    )
    if not payload.get("ok"):
        raise RuntimeError(payload.get("message", "metrics claim failed"))
    if not payload.get("needed"):
        return None
    return payload


def complete_metrics(videos: list[dict[str, Any]]) -> dict:
    base = require_env("CLIP_OPERATOR_URL").rstrip("/")
    return http_json(
        "POST",
        f"{base}/api/autopilot/metrics-jobs/complete",
        body={"videos": videos},
        headers=agent_headers(),
    )


def cookie_file_for_account(account: str) -> Path:
    here = Path(__file__).resolve().parent
    candidates = [
        here
        / "vendor"
        / "TiktokAutoUploader"
        / "CookiesDir"
        / f"tiktok_session-{account}.cookie",
        here / "CookiesDir" / f"tiktok_session-{account}.cookie",
    ]
    for path in candidates:
        if path.is_file():
            return path
    raise RuntimeError(
        f"No cookie file for account '{account}'. "
        f"Expected one of: {', '.join(str(c) for c in candidates)}"
    )


def load_session_cookies(account: str) -> list[dict[str, Any]]:
    path = cookie_file_for_account(account)
    with path.open("rb") as fh:
        raw = pickle.load(fh)

    if not isinstance(raw, list):
        raise RuntimeError(f"Unexpected cookie pickle format in {path}")

    out: list[dict[str, Any]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        name = item.get("name")
        value = item.get("value")
        if not name or value is None:
            continue
        domain = item.get("domain") or ".tiktok.com"
        cookie: dict[str, Any] = {
            "name": str(name),
            "value": str(value),
            "domain": str(domain),
            "path": str(item.get("path") or "/"),
        }
        if item.get("secure"):
            cookie["secure"] = True
        if item.get("httpOnly"):
            cookie["httpOnly"] = True
        # Playwright rejects far-future / overflow expiry from some pickles
        expiry = item.get("expiry") or item.get("expires")
        if isinstance(expiry, (int, float)) and 0 < expiry < 4_000_000_000:
            cookie["expires"] = float(expiry)
        out.append(cookie)

    if not any(c["name"] == "sessionid" for c in out):
        raise RuntimeError(f"Cookie file {path} has no sessionid")
    return out


def _as_int(value: Any) -> int:
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def _extract_videos_from_payload(payload: Any, found: dict[str, dict[str, Any]]) -> None:
    """Walk Studio API JSON for video items with play counts."""
    if isinstance(payload, list):
        for item in payload:
            _extract_videos_from_payload(item, found)
        return
    if not isinstance(payload, dict):
        return

    # Common Studio / creator shapes
    item_id = payload.get("item_id") or payload.get("id") or payload.get("aweme_id")
    nested_item = payload.get("item")
    if not item_id and isinstance(nested_item, dict):
        item_id = nested_item.get("id") or nested_item.get("item_id")

    stats = payload.get("statistics") or payload.get("stats")
    item_info = payload.get("item_info")
    if not stats and isinstance(item_info, dict):
        stats = item_info.get("statistics")
    if not isinstance(stats, dict):
        stats = {}

    desc = (
        payload.get("desc")
        or payload.get("title")
        or payload.get("caption")
        or payload.get("description")
        or ""
    )
    create_time = (
        payload.get("create_time")
        or payload.get("createTime")
        or payload.get("create_time_sec")
        or 0
    )

    views = _as_int(
        stats.get("play_count")
        or stats.get("playCount")
        or stats.get("view_count")
        or stats.get("views")
        or payload.get("play_count")
        or payload.get("views")
    )
    likes = _as_int(
        stats.get("digg_count")
        or stats.get("like_count")
        or stats.get("likes")
        or payload.get("like_count")
    )
    comments = _as_int(
        stats.get("comment_count")
        or stats.get("comments")
        or payload.get("comment_count")
    )
    shares = _as_int(
        stats.get("share_count")
        or stats.get("shares")
        or payload.get("share_count")
    )

    if item_id and (views > 0 or likes > 0 or desc):
        vid = str(item_id)
        url = payload.get("share_url") or payload.get("url")
        if not url:
            url = f"https://www.tiktok.com/@/video/{vid}"
        found[vid] = {
            "videoId": vid,
            "url": str(url),
            "caption": str(desc),
            "createTime": _as_int(create_time),
            "views": views,
            "likes": likes,
            "comments": comments,
            "shares": shares,
        }

    for value in payload.values():
        if isinstance(value, (dict, list)):
            _extract_videos_from_payload(value, found)


def scrape_studio_videos(account: str, timeout_ms: int = 90_000) -> list[dict[str, Any]]:
    from playwright.sync_api import sync_playwright

    cookies = load_session_cookies(account)
    found: dict[str, dict[str, Any]] = {}

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

        def on_response(response: Any) -> None:
            url = response.url
            if "item_list" not in url and "item/list" not in url and "post/item_list" not in url:
                # Still try creator analytics-ish endpoints
                if "tiktokstudio" not in url and "creator" not in url:
                    return
                if "item" not in url and "post" not in url and "aweme" not in url:
                    return
            try:
                if response.status != 200:
                    return
                ctype = (response.headers.get("content-type") or "").lower()
                if "json" not in ctype and "javascript" not in ctype:
                    return
                payload = response.json()
            except Exception:  # noqa: BLE001
                return
            _extract_videos_from_payload(payload, found)

        page.on("response", on_response)

        page.goto(
            "https://www.tiktok.com/tiktokstudio/content",
            wait_until="domcontentloaded",
            timeout=timeout_ms,
        )
        # Let XHR settle; scroll to trigger pagination once
        page.wait_for_timeout(8_000)
        try:
            page.mouse.wheel(0, 2400)
            page.wait_for_timeout(4_000)
        except Exception:  # noqa: BLE001
            pass

        # If still empty, try analytics content page
        if not found:
            page.goto(
                "https://www.tiktok.com/tiktokstudio/analytics",
                wait_until="domcontentloaded",
                timeout=timeout_ms,
            )
            page.wait_for_timeout(6_000)

        # Fill @handle into URLs when we can read it from the page
        handle = ""
        try:
            handle = page.evaluate(
                """() => {
                  const a = document.querySelector('a[href*="/@"]');
                  if (!a) return '';
                  const m = (a.getAttribute('href') || '').match(/@([\\w._]+)/);
                  return m ? m[1] : '';
                }"""
            ) or ""
        except Exception:  # noqa: BLE001
            handle = ""

        browser.close()

    videos = list(found.values())
    if handle:
        for video in videos:
            if "/@/" in video["url"] or video["url"].endswith(f"/video/{video['videoId']}"):
                video["url"] = f"https://www.tiktok.com/@{handle}/video/{video['videoId']}"

    return videos


def should_run_now(min_interval_sec: int = 1800) -> bool:
    """Local cooldown so Task Scheduler polls don't launch Playwright every minute."""
    marker = Path(__file__).resolve().parent / ".metrics-last-run"
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
    marker = Path(__file__).resolve().parent / ".metrics-last-run"
    marker.write_text(str(time.time()), encoding="utf-8")


def run_once(*, force: bool = False) -> bool:
    if not force and not should_run_now():
        print("Metrics sync skipped (cooldown).")
        return False

    claim = claim_metrics_job()
    if not claim:
        print("No posts need metrics sync.")
        mark_ran()
        return False

    account = env("TIKTOK_ACCOUNT_NAME")
    if not account:
        raise RuntimeError("Set TIKTOK_ACCOUNT_NAME for metrics scrape")

    print(f"Scraping TikTok Studio for account '{account}' "
          f"({len(claim.get('posts') or [])} posts need sync)...")
    videos = scrape_studio_videos(account)
    print(f"Scraped {len(videos)} videos from Studio")

    if not videos:
        print("No videos captured — session may need refresh.", file=sys.stderr)
        return False

    result = complete_metrics(videos)
    mark_ran()
    print(result.get("message") or result)
    return bool(result.get("ok"))


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
