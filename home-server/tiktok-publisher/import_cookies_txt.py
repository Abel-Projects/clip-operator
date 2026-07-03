#!/usr/bin/env python3
"""Import TikTok session from a Netscape cookies.txt export into TikTokAutoUploader format.

Export cookies from Chrome on a machine where you are logged into TikTok:
  1. Install extension "Get cookies.txt LOCALLY"
  2. Go to tiktok.com while logged in
  3. Export -> save as cookies.txt
  4. Copy to home server and run:
       python import_cookies_txt.py cookies.txt main
"""

from __future__ import annotations

import pickle
import sys
from http.cookiejar import MozillaCookieJar
from pathlib import Path


def load_netscape(path: Path) -> dict[str, str]:
    jar = MozillaCookieJar(str(path))
    jar.load(ignore_discard=True, ignore_expires=True)
    out: dict[str, str] = {}
    for cookie in jar:
        if "tiktok.com" in cookie.domain and cookie.name in ("sessionid", "tt-target-idc"):
            out[cookie.name] = cookie.value
    return out


def to_selenium_cookie(name: str, value: str) -> dict:
    return {
        "domain": ".tiktok.com",
        "expiry": 2147483647,
        "httpOnly": True,
        "name": name,
        "path": "/",
        "sameSite": "Lax",
        "secure": True,
        "value": value,
    }


def main() -> int:
    if len(sys.argv) < 2:
        print("Usage: python import_cookies_txt.py cookies.txt [account_label]")
        return 1

    cookies_path = Path(sys.argv[1])
    account = sys.argv[2] if len(sys.argv) > 2 else "main"

    if not cookies_path.is_file():
        print(f"File not found: {cookies_path}")
        return 1

    found = load_netscape(cookies_path)
    if not found.get("sessionid"):
        print("ERROR: no sessionid in cookies.txt - export while logged into tiktok.com")
        return 1

    payload = [to_selenium_cookie("sessionid", found["sessionid"])]
    if found.get("tt-target-idc"):
        payload.append(to_selenium_cookie("tt-target-idc", found["tt-target-idc"]))

    vendor = Path(__file__).resolve().parent / "vendor" / "TiktokAutoUploader" / "CookiesDir"
    vendor.mkdir(parents=True, exist_ok=True)
    out = vendor / f"tiktok_session-{account}.cookie"

    with out.open("wb") as f:
        pickle.dump(payload, f)

    print(f"OK: saved {out} ({out.stat().st_size} bytes)")
    print(f"TIKTOK_ACCOUNT_NAME={account} in publisher .env")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
