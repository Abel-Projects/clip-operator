"""Upload via TikTokAutoUploader (HTTP requests, no headed browser)."""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path


def uploader_root() -> Path:
    return Path(__file__).resolve().parent / "vendor" / "TiktokAutoUploader"


def uploader_python() -> Path:
    root = uploader_root()
    if sys.platform == "win32":
        candidate = root / ".venv" / "Scripts" / "python.exe"
    else:
        candidate = root / ".venv" / "bin" / "python"
    if candidate.is_file():
        return candidate
    return Path(sys.executable)


def upload_via_auto_uploader(
    video_path: Path,
    caption: str,
    account_name: str,
    *,
    timeout_sec: int = 120,
) -> None:
    root = uploader_root()
    cli = root / "cli.py"
    if not cli.is_file():
        raise RuntimeError(
            "TikTokAutoUploader not installed. Run setup-uploader.ps1 or setup-uploader.sh "
            "in home-server/tiktok-publisher."
        )

    account = account_name.strip()
    if not account:
        raise RuntimeError("TIKTOK_ACCOUNT_NAME is required for TikTokAutoUploader.")

    video = video_path.resolve()
    if not video.is_file():
        raise RuntimeError(f"Video file not found: {video}")

    env = os.environ.copy()
    env.setdefault("PYTHONUTF8", "1")

    result = subprocess.run(
        [
            str(uploader_python()),
            str(cli),
            "upload",
            "--user",
            account,
            "-v",
            str(video),
            "-t",
            caption,
        ],
        cwd=root,
        capture_output=True,
        text=True,
        timeout=timeout_sec,
        env=env,
    )

    stdout = (result.stdout or "").strip()
    stderr = (result.stderr or "").strip()
    combined = "\n".join(part for part in (stdout, stderr) if part)

    if result.returncode != 0:
        raise RuntimeError(
            combined or f"TikTokAutoUploader exited with code {result.returncode}"
        )

    if "Published successfully" not in combined and "Published failed" in combined:
        raise RuntimeError(combined or "TikTokAutoUploader publish failed.")
