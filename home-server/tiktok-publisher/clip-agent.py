#!/usr/bin/env python3
"""
Poll clip-operator for SupoClip clip jobs and run them against local SupoClip.

Runs on the home server. Vercel never needs inbound access to SupoClip —
this agent pulls work outbound (same pattern as the TikTok publisher).
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import sys
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


def operator_headers() -> dict[str, str]:
    secret = env("PUBLISH_AGENT_SECRET") or env("CRON_SECRET")
    if not secret:
        raise RuntimeError("Set PUBLISH_AGENT_SECRET or CRON_SECRET")
    return {"Authorization": f"Bearer {secret}", "Accept": "application/json"}


def supoclip_auth_headers(content_type: str | None = None) -> dict[str, str]:
    user_id = require_env("SUPOCLIP_USER_ID")
    headers = {"x-supoclip-user-id": user_id}
    if content_type:
        headers["Content-Type"] = content_type
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
    timeout: int = 120,
) -> dict:
    data = None
    req_headers = {"Accept": "application/json"}
    if headers:
        req_headers.update(headers)
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        req_headers.setdefault("Content-Type", "application/json")

    request = Request(url, data=data, headers=req_headers, method=method)
    try:
        with urlopen(request, timeout=timeout) as response:
            raw = response.read().decode("utf-8")
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {exc.code} {url}: {detail}") from exc
    except URLError as exc:
        raise RuntimeError(f"Request failed {url}: {exc}") from exc

    if not raw:
        return {}
    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Invalid JSON from {url}: {raw[:200]}") from exc


def claim_next_job() -> dict | None:
    base = require_env("CLIP_OPERATOR_URL").rstrip("/")
    payload = http_json(
        "POST",
        f"{base}/api/autopilot/clip-jobs/next",
        headers=operator_headers(),
    )
    if not payload.get("ok"):
        raise RuntimeError(payload.get("message", "claim failed"))
    return payload.get("job")


def complete_job(campaign_id: str, body: dict) -> None:
    base = require_env("CLIP_OPERATOR_URL").rstrip("/")
    http_json(
        "POST",
        f"{base}/api/autopilot/clip-jobs/{campaign_id}/complete",
        body=body,
        headers=operator_headers(),
    )


def start_supoclip_task(source_url: str, title: str) -> str:
    base = env("SUPOCLIP_BASE_URL", "http://localhost:8000").rstrip("/")
    payload = http_json(
        "POST",
        f"{base}/tasks/",
        body={
            "source": {"url": source_url, "title": title},
            "processing_mode": "fast",
        },
        headers=supoclip_auth_headers("application/json"),
        timeout=180,
    )
    task_id = payload.get("task_id")
    if not task_id:
        raise RuntimeError(f"SupoClip did not return task_id: {payload}")
    return str(task_id)


def fetch_task(project_id: str) -> dict:
    base = env("SUPOCLIP_BASE_URL", "http://localhost:8000").rstrip("/")
    return http_json(
        "GET",
        f"{base}/tasks/{project_id}",
        headers=supoclip_auth_headers(),
        timeout=120,
    )


def parse_clips(project_id: str, task: dict) -> list[dict]:
    base = env("SUPOCLIP_BASE_URL", "http://localhost:8000").rstrip("/")
    raw_clips = task.get("clips") or []
    clips: list[dict] = []
    for index, entry in enumerate(raw_clips):
        if not isinstance(entry, dict):
            continue
        clip_id = entry.get("id")
        if not clip_id:
            continue
        text = (entry.get("text") or "").strip()
        duration = entry.get("duration")
        try:
            duration_sec = float(duration) if duration is not None else None
        except (TypeError, ValueError):
            duration_sec = None
        video_url = entry.get("video_url")
        if isinstance(video_url, str) and video_url.startswith("http"):
            preview = video_url
        elif isinstance(video_url, str) and video_url.startswith("/"):
            preview = f"{base}{video_url}"
        else:
            preview = f"{base}/tasks/{project_id}/clips/{clip_id}/file"
        score = entry.get("virality_score")
        clips.append(
            {
                "clipId": str(clip_id),
                "title": text or None,
                "score": score if isinstance(score, (int, float)) else None,
                "durationSec": duration_sec,
                "previewUrl": preview,
                "_order": entry.get("clip_order", index + 1),
            }
        )
    return clips


def handle_start(job: dict) -> None:
    campaign_id = job["campaignId"]
    source_url = job["sourceUrl"]
    niche = job.get("niche") or "clip"
    print(f"Starting SupoClip for campaign {campaign_id}: {source_url}")
    try:
        task_id = start_supoclip_task(source_url, niche)
        complete_job(campaign_id, {"action": "started", "projectId": task_id})
        print(f"Started task {task_id}")
    except Exception as exc:  # noqa: BLE001
        message = str(exc)
        print(f"FAILED start: {message}", file=sys.stderr)
        complete_job(campaign_id, {"action": "failed", "message": message})


def handle_poll(job: dict) -> None:
    campaign_id = job["campaignId"]
    project_id = job["projectId"]
    poll_count = job.get("pollCount", 0)
    print(f"Polling SupoClip task {project_id} (campaign {campaign_id}, poll {poll_count})")
    try:
        task = fetch_task(project_id)
        status = task.get("status") or "unknown"
        if status in {"error", "failed"}:
            message = task.get("progress_message") or "SupoClip task failed."
            complete_job(campaign_id, {"action": "failed", "message": message})
            print(f"Task failed: {message}")
            return

        clips = parse_clips(project_id, task)
        processing = status in {"queued", "processing"} or (
            status == "completed" and len(clips) == 0
        )
        if processing:
            complete_job(campaign_id, {"action": "still_processing"})
            print(f"Still processing ({status})")
            return

        complete_job(
            campaign_id,
            {
                "action": "clips_ready",
                "clips": [
                    {
                        "clipId": c["clipId"],
                        "title": c.get("title"),
                        "score": c.get("score"),
                        "durationSec": c.get("durationSec"),
                        "previewUrl": c.get("previewUrl"),
                    }
                    for c in clips
                ],
            },
        )
        print(f"Reported {len(clips)} clip(s)")
    except Exception as exc:  # noqa: BLE001
        message = str(exc)
        print(f"FAILED poll: {message}", file=sys.stderr)
        complete_job(campaign_id, {"action": "failed", "message": message})


def run_once() -> bool:
    job = claim_next_job()
    if not job:
        print("No SupoClip clip jobs.")
        return False

    job_type = job.get("type")
    if job_type == "start":
        handle_start(job)
        return True
    if job_type == "poll":
        handle_poll(job)
        return True

    raise RuntimeError(f"Unknown clip job type: {job_type}")


def main() -> int:
    try:
        if not run_once():
            return 0
    except Exception as exc:  # noqa: BLE001
        print(exc, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
