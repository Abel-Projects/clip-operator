#!/usr/bin/env python3
"""One-time TikTok login helper for Windows home server.

TikTokAutoUploader's built-in login often crashes on Windows (Chrome version
detection only works on Linux). This script opens Chrome, waits for you to log
in, then saves session cookies in TikTokAutoUploader format.

Usage (on home server, RDP session visible):
  .venv\\Scripts\\python.exe tiktok_login_helper.py main
"""

from __future__ import annotations

import pickle
import sys
import time
from pathlib import Path

REQUIRED = ("sessionid", "tt-target-idc")


def chrome_major_version() -> int:
    import subprocess

    try:
        out = subprocess.check_output(
            [
                r"C:\Program Files\Google\Chrome\Application\chrome.exe",
                "--version",
            ],
            stderr=subprocess.DEVNULL,
            text=True,
        )
        # Google Chrome 131.0.6778.86
        return int(out.strip().split()[-1].split(".")[0])
    except Exception:
        pass
    try:
        import winreg

        key = winreg.OpenKey(
            winreg.HKEY_CURRENT_USER,
            r"Software\Google\Chrome\BLBeacon",
        )
        version, _ = winreg.QueryValueEx(key, "version")
        return int(str(version).split(".")[0])
    except Exception:
        return 0


def main() -> int:
    account = (sys.argv[1] if len(sys.argv) > 1 else "main").strip()
    if not account:
        print("Usage: python tiktok_login_helper.py <account_label>")
        return 1

    vendor = Path(__file__).resolve().parent / "vendor" / "TiktokAutoUploader"
    cookies_dir = vendor / "CookiesDir"
    cookies_dir.mkdir(parents=True, exist_ok=True)
    cookie_file = cookies_dir / f"tiktok_session-{account}.cookie"

    import undetected_chromedriver as uc

    version = chrome_major_version()
    print(f"Chrome major version: {version or 'auto-detect'}")
    print("Opening Chrome - log into TikTok, then return here and press Enter.")

    options = uc.ChromeOptions()
    options.add_argument("--start-maximized")
    driver = uc.Chrome(options=options, version_main=version or None)

    try:
        driver.get("https://www.tiktok.com/login")
        input("\n>>> Press Enter AFTER you are logged in and see your TikTok feed...\n")

        collected: dict[str, dict] = {}
        for _ in range(30):
            for cookie in driver.get_cookies():
                if cookie["name"] in REQUIRED:
                    collected[cookie["name"]] = cookie
            if "sessionid" in collected and "tt-target-idc" in collected:
                break
            time.sleep(1)

        if "sessionid" not in collected:
            print("ERROR: sessionid cookie not found. Make sure you finished logging in.")
            return 1

        # TikTokAutoUploader expects sessionid first
        payload = [collected["sessionid"]]
        if "tt-target-idc" in collected:
            payload.append(collected["tt-target-idc"])

        with cookie_file.open("wb") as f:
            pickle.dump(payload, f)

        print(f"Saved session to {cookie_file}")
        print(f"Set TIKTOK_ACCOUNT_NAME={account} in publisher .env")
        return 0
    finally:
        try:
            driver.quit()
        except Exception:
            pass


if __name__ == "__main__":
    raise SystemExit(main())
