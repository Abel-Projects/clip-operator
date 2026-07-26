#!/usr/bin/env python3
"""
Render narrated Shark Tank lesson shorts for Clip Operator.

Claims posts with status=rendering / content_type=lesson, builds a vertical
MP4 (edge-tts + ffmpeg drawtext), then marks the post queued with local path.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
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

    return json.loads(raw)


def operator_headers() -> dict[str, str]:
    secret = env("PUBLISH_AGENT_SECRET") or env("CRON_SECRET")
    if not secret:
        raise RuntimeError("Set PUBLISH_AGENT_SECRET or CRON_SECRET")
    return {"Authorization": f"Bearer {secret}"}


def claim_job() -> dict | None:
    base = require_env("CLIP_OPERATOR_URL").rstrip("/")
    payload = http_json(
        "POST",
        f"{base}/api/autopilot/lesson-jobs/next",
        headers=operator_headers(),
    )
    if not payload.get("ok"):
        raise RuntimeError(payload.get("message", "claim failed"))
    return payload.get("job")


def complete_job(post_id: str, ok: bool, *, path: str | None = None, message: str = "") -> None:
    base = require_env("CLIP_OPERATOR_URL").rstrip("/")
    body: dict = {"ok": ok, "message": message}
    if path:
        body["localVideoPath"] = path
    http_json(
        "POST",
        f"{base}/api/autopilot/lesson-jobs/{post_id}/complete",
        body=body,
        headers=operator_headers(),
    )


def which_ffmpeg() -> str | None:
    for candidate in ("ffmpeg", "ffmpeg.exe"):
        found = shutil.which(candidate)
        if found:
            return found
    for path in (
        r"C:\ffmpeg\bin\ffmpeg.exe",
        r"C:\Program Files\ffmpeg\bin\ffmpeg.exe",
    ):
        if Path(path).is_file():
            return path
    return None


def run_ffmpeg(args: list[str], *, work_dir: Path) -> None:
    """Run ffmpeg on the host, or inside supoclip-backend if host has none."""
    host = which_ffmpeg()
    if host:
        result = subprocess.run(
            [host, *args], capture_output=True, text=True, check=False
        )
        if result.returncode != 0:
            raise RuntimeError(f"ffmpeg failed: {(result.stderr or '')[-800:]}")
        return

    # Home server: ffmpeg lives in the SupoClip container.
    container = env("LESSON_FFMPEG_CONTAINER", "supoclip-backend")
    remote = "/tmp/lesson-render"
    subprocess.run(
        ["docker", "exec", container, "rm", "-rf", remote],
        capture_output=True,
        check=False,
    )
    subprocess.run(
        ["docker", "exec", container, "mkdir", "-p", remote],
        capture_output=True,
        check=True,
    )
    # Copy inputs the command references under work_dir
    for path in work_dir.iterdir():
        subprocess.run(
            ["docker", "cp", str(path), f"{container}:{remote}/{path.name}"],
            capture_output=True,
            check=True,
        )

    # Rewrite local paths in args to container paths
    mapped: list[str] = []
    for arg in args:
        p = Path(arg)
        if p.is_absolute() and str(work_dir) in str(p):
            mapped.append(f"{remote}/{p.name}")
        else:
            mapped.append(arg)

    result = subprocess.run(
        ["docker", "exec", container, "ffmpeg", *mapped],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(f"docker ffmpeg failed: {(result.stderr or '')[-800:]}")

    # Copy output mp4 back (last .mp4 arg)
    out_local = None
    for arg in reversed(args):
        if arg.lower().endswith(".mp4"):
            out_local = Path(arg)
            break
    if out_local is None:
        raise RuntimeError("No mp4 output path in ffmpeg args")
    subprocess.run(
        ["docker", "cp", f"{container}:{remote}/{out_local.name}", str(out_local)],
        capture_output=True,
        check=True,
    )
    subprocess.run(
        ["docker", "exec", container, "rm", "-rf", remote],
        capture_output=True,
        check=False,
    )


def synthesize_voice(text: str, out_mp3: Path) -> None:
    """Prefer edge-tts; fall back to a silent track + still render text video."""
    try:
        import edge_tts  # type: ignore
    except ImportError as exc:
        raise RuntimeError(
            "edge-tts is required. On the home server: pip install edge-tts"
        ) from exc

    voice = env("LESSON_TTS_VOICE", "en-US-GuyNeural")

    async def _run() -> None:
        communicate = edge_tts.Communicate(text, voice)
        await communicate.save(str(out_mp3))

    import asyncio

    asyncio.run(_run())
    if out_mp3.stat().st_size < 500:
        raise RuntimeError("TTS output too small")


def escape_drawtext(value: str) -> str:
    return (
        value.replace("\\", "\\\\")
        .replace(":", "\\:")
        .replace("'", "\\'")
        .replace("%", "\\%")
    )


def render_video(
    *,
    voiceover: str,
    lines: list[str],
    out_mp4: Path,
) -> None:
    work = Path(tempfile.mkdtemp(prefix="lesson-"))
    audio = work / "voice.mp3"
    staged_out = work / out_mp4.name
    try:
        synthesize_voice(voiceover, audio)

        # Fixed length band for retention; TTS is trimmed/padded by -shortest.
        duration = 20.0
        line1 = escape_drawtext((lines[0] if lines else "Shark Tank").upper()[:34])
        line2 = escape_drawtext(
            (lines[1] if len(lines) > 1 else lines[0] if lines else "money lesson")[:44]
        )
        brand = escape_drawtext("SHARK TANK LESSON")

        args = [
            "-y",
            "-f",
            "lavfi",
            "-i",
            f"color=c=0x0B0B0F:s=1080x1920:d={duration}",
            "-i",
            str(audio),
            "-vf",
            (
                f"drawtext=text='{brand}':fontcolor=white:fontsize=36:"
                f"borderw=3:bordercolor=black:x=(w-text_w)/2:y=220,"
                f"drawtext=text='{line1}':fontcolor=white:fontsize=64:"
                f"borderw=5:bordercolor=black:x=(w-text_w)/2:y=(h/2)-80,"
                f"drawtext=text='{line2}':fontcolor=white:fontsize=48:"
                f"borderw=4:bordercolor=black:x=(w-text_w)/2:y=(h/2)+20"
            ),
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-shortest",
            "-movflags",
            "+faststart",
            str(staged_out),
        ]
        run_ffmpeg(args, work_dir=work)
        if not staged_out.is_file():
            raise RuntimeError("ffmpeg produced no output file")
        out_mp4.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(staged_out, out_mp4)
    finally:
        shutil.rmtree(work, ignore_errors=True)


def run_once() -> bool:
    job = claim_job()
    if not job:
        print("No lesson render jobs.")
        return False

    post_id = job["id"]
    voiceover = str(job.get("voiceover") or "")
    lines = job.get("onScreenLines") or [job.get("hook") or "Shark Tank lesson"]
    if isinstance(lines, str):
        lines = [lines]

    out_dir = Path(env("LESSON_OUTPUT_DIR", r"C:\clip-operator\lessons"))
    out_dir.mkdir(parents=True, exist_ok=True)
    out_mp4 = out_dir / f"{post_id}.mp4"

    print(f"Rendering lesson {post_id}…")
    try:
        render_video(voiceover=voiceover, lines=[str(x) for x in lines], out_mp4=out_mp4)
        complete_job(post_id, True, path=str(out_mp4), message="Rendered lesson video.")
        print(f"Lesson ready: {out_mp4}")
        return True
    except Exception as exc:  # noqa: BLE001
        message = str(exc)
        print(f"FAILED: {message}", file=sys.stderr)
        try:
            complete_job(post_id, False, message=message)
        except Exception as report_exc:  # noqa: BLE001
            print(f"Could not report failure: {report_exc}", file=sys.stderr)
        return False


if __name__ == "__main__":
    ok = run_once()
    raise SystemExit(0 if ok else 1)
