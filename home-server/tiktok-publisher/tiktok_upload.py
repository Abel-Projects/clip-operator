"""TikTok upload with modal handling for TikTok's content-check UI."""

from __future__ import annotations

import time
from pathlib import Path

from playwright.sync_api import Page, TimeoutError as PlaywrightTimeoutError
from tiktok_uploader import config
from tiktok_uploader.upload import (
    TikTokUploader,
    _go_to_upload,
    _post_video,
    _remove_cookies_window,
    _remove_split_window,
    _set_description,
    _set_interactivity,
    _set_video,
)


def dismiss_tiktok_modals(page: Page) -> None:
    for label in (
        "Got it",
        "OK",
        "Continue",
        "Not now",
        "Turn on",
        "Cancel",
        "Close",
        "Dismiss",
    ):
        try:
            button = page.get_by_role("button", name=label)
            if button.count() > 0 and button.first.is_visible(timeout=1500):
                button.first.click()
                time.sleep(1)
        except Exception:
            pass

    try:
        page.keyboard.press("Escape")
    except Exception:
        pass


def wait_for_post_ready(page: Page, timeout_sec: int = 180) -> None:
    """Wait until TikTok finishes processing and the Post button is enabled."""
    post = page.locator(f"xpath={config.selectors.upload.post}")
    deadline = time.time() + timeout_sec

    while time.time() < deadline:
        dismiss_tiktok_modals(page)
        try:
            if post.count() > 0:
                disabled = post.first.get_attribute("data-disabled")
                if disabled == "false":
                    return
        except Exception:
            pass
        time.sleep(3)

    raise RuntimeError("Timed out waiting for TikTok post button to become enabled.")


def upload_video(path: str, caption: str, cookies: str) -> bool:
    uploader = TikTokUploader(cookies=cookies, headless=False)
    page = uploader.page

    try:
        _go_to_upload(page)
        _remove_cookies_window(page)
        _set_video(page, path=path, num_retries=3)
        _remove_split_window(page)

        try:
            _set_interactivity(page)
        except Exception:
            pass

        wait_for_post_ready(page)
        dismiss_tiktok_modals(page)
        _set_description(page, caption)
        dismiss_tiktok_modals(page)
        wait_for_post_ready(page, timeout_sec=60)
        _post_video(page)
        return True
    except Exception as exc:
        print(f"Upload error: {exc}")
        return False
    finally:
        if hasattr(uploader, "close"):
            uploader.close()


def upload_from_env(video_path: Path, caption: str, cookies_path: str) -> None:
    if not Path(cookies_path).is_file():
        raise RuntimeError(f"TikTok cookies file not found: {cookies_path}")

    if not upload_video(str(video_path), caption, cookies_path):
        raise RuntimeError("TikTok upload failed (content-check modal or post button).")
