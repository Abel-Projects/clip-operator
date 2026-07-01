#!/usr/bin/env python3
"""
Poll clip-operator for due SupoClip posts, download clips locally, upload to TikTok.

Runs on the home server next to SupoClip. Uses tiktok-uploader (Playwright + cookies).
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import sys
import tempfile
import time
from pathlib import Path
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


def supoclip_auth_headers() -> dict[str, str]:
    user_id = require_env("SUPOCLIP_USER_ID")
    headers = {"x-supoclip-user-id": user_id}
    secret = env("SUPOCLIP_AUTH_SECRET")
    if secret:
        ts = str(int(time.time()))
        payload = f"{user_id}:{ts}"
        signature = hmac.new(
            secret.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256
        ).hexdigest()
        headers["x-supoclip-ts"] = ts
        headers["x-supoclip-signature"] = signature
    return headers


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


def claim_next_job() -> dict | None:
    base = require_env("CLIP_OPERATOR_URL").rstrip("/")
    secret = env("PUBLISH_AGENT_SECRET") or env("CRON_SECRET")
    if not secret:
        raise RuntimeError("Set PUBLISH_AGENT_SECRET or CRON_SECRET")

    payload = http_json(
        "POST",
        f"{base}/api/autopilot/publish-jobs/next",
        headers={"Authorization": f"Bearer {secret}"},
    )
    if not payload.get("ok"):
        raise RuntimeError(payload.get("message", "claim failed"))
    return payload.get("job")


def complete_job(post_id: str, ok: bool, message: str) -> None:
    base = require_env("CLIP_OPERATOR_URL").rstrip("/")
    secret = env("PUBLISH_AGENT_SECRET") or env("CRON_SECRET")
    http_json(
        "POST",
        f"{base}/api/autopilot/publish-jobs/{post_id}/complete",
        body={"ok": ok, "message": message},
        headers={"Authorization": f"Bearer {secret}"},
    )


def download_clip(project_id: str, clip_id: str, dest: Path) -> None:
    base = env("SUPOCLIP_BASE_URL", "http://localhost:8000").rstrip("/")
    url = f"{base}/tasks/{project_id}/clips/{clip_id}/file"
    headers = supoclip_auth_headers()
    request = Request(url, headers=headers, method="GET")

    try:
        with urlopen(request, timeout=300) as response:
            dest.write_bytes(response.read())
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Clip download failed ({exc.code}): {detail}") from exc
    except URLError as exc:
        raise RuntimeError(f"Clip download failed: {exc}") from exc

    if dest.stat().st_size < 1024:
        raise RuntimeError("Downloaded clip is too small; check SupoClip task status.")


def truncate_caption(text: str, max_len: int = 150) -> str:
    cleaned = " ".join(text.split())
    if len(cleaned) <= max_len:
        return cleaned
    cut = cleaned[:max_len]
    last_space = cut.rfind(" ")
    hook = cut[:last_space].strip() if last_space > 50 else cut.strip()
    return f"{hook}..."


def upload_to_tiktok(video_path: Path, description: str) -> None:
    cookies = require_env("TIKTOK_COOKIES_PATH")
    if not Path(cookies).is_file():
        raise RuntimeError(f"TikTok cookies file not found: {cookies}")

    from tiktok_uploader.upload import TikTokUploader

    caption = truncate_caption(description, 150)
    uploader = TikTokUploader(cookies=cookies, headless=False)
    ok = uploader.upload_video(
        str(video_path),
        description=caption,
        num_retries=3,
        skip_split_window=True,
    )
    if not ok:
        raise RuntimeError("TikTok uploader reported failure (modal/UI or post button).")


def run_once() -> bool:
    job = claim_next_job()
    if not job:
        print("No due SupoClip publish jobs.")
        return False

    post_id = job["id"]
    project_id = job["projectId"]
    clip_id = job["clipId"]
    caption = job["caption"]
    print(f"Claimed job {post_id} (task {project_id}, clip {clip_id})")

    tmp = Path(tempfile.gettempdir()) / f"supoclip-{clip_id}.mp4"
    try:
        download_clip(project_id, clip_id, tmp)
        print(f"Downloaded clip ({tmp.stat().st_size // 1024} KB)")
        upload_to_tiktok(tmp, caption)
        complete_job(post_id, True, "Posted via home-server TikTok agent.")
        print(f"Posted to TikTok: {post_id}")
    except Exception as exc:  # noqa: BLE001 — report upstream
        message = str(exc)
        print(f"FAILED: {message}", file=sys.stderr)
        try:
            complete_job(post_id, False, message)
        except Exception as report_exc:  # noqa: BLE001
            print(f"Could not report failure: {report_exc}", file=sys.stderr)
        raise
    finally:
        if tmp.exists():
            tmp.unlink(missing_ok=True)

    return True


def main() -> int:
    try:
        run_once()
    except Exception as exc:  # noqa: BLE001
        print(exc, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
