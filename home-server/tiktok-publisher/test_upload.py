"""One-off TikTok upload smoke test (uses cookies.txt)."""
from __future__ import annotations

import os
from pathlib import Path
from urllib.request import urlretrieve

from dotenv import load_dotenv
from tiktok_uploader.upload import TikTokUploader

load_dotenv(Path(__file__).resolve().parent / ".env")

cookies = os.environ.get("TIKTOK_COOKIES_PATH", "cookies.txt")
video = Path("test-upload.mp4")
urlretrieve(
    "https://raw.githubusercontent.com/wkaisertexas/wkaisertexas.github.io/main/upload.mp4",
    video,
)

try:
    uploader = TikTokUploader(cookies=cookies)
    uploader.upload_video(
        str(video),
        description="clip-operator pipeline test - safe to delete",
    )
    print("UPLOAD_OK")
finally:
    video.unlink(missing_ok=True)
