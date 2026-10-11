"""Render scripts/banner/banner.html to PNGs for the README and the GitHub social preview.

    python scripts/render_banner.py

Needs `pip install -r scripts/requirements.txt`, an installed Edge/Chrome, and `npm ci` in frontend/
(the banner reuses the app's fonts). The JSON in the artwork is illustrative sample data.
"""
from __future__ import annotations

from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
SOURCE = (ROOT / "scripts" / "banner" / "banner.html").as_uri()
OUT = ROOT / "docs"

SIZES = {
    "banner.png": (1280, 720),  # README hero
    "social-preview.png": (1280, 640),  # GitHub: Settings -> Social preview (recommended 1280x640)
}

with sync_playwright() as p:
    browser = p.chromium.launch(channel="msedge")
    for name, (width, height) in SIZES.items():
        page = browser.new_page(viewport={"width": width, "height": height})
        page.goto(SOURCE)
        page.evaluate("document.fonts.ready")
        page.wait_for_timeout(300)
        page.screenshot(path=OUT / name)
        page.close()
    browser.close()
print("written:", ", ".join(SIZES))
