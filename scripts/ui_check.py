"""Drive the real UI in a real browser: asserts the main flows and captures README screenshots.

Prerequisites (see README "Screenshots"): a backend reachable at BASE_URL/api and the UI served at
BASE_URL, e.g. the Vite dev server (npm run dev) in front of `python scripts/stub_llm_server.py`,
or the Docker stack with a real OPENAI_API_KEY. Uses the locally installed Edge/Chrome.

    pip install playwright
    python scripts/ui_check.py --base-url http://localhost:5173 --out docs/screenshots
"""
from __future__ import annotations

import argparse
import tempfile
from pathlib import Path

from playwright.sync_api import Page, expect, sync_playwright

ROOT = Path(__file__).resolve().parent.parent
SAMPLES = ROOT / "tests" / "samples"


def upload(page: Page, path: Path) -> None:
    page.locator('input[type="file"]').set_input_files(str(path))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://localhost:5173")
    parser.add_argument("--out", default=str(ROOT / "docs" / "screenshots"))
    parser.add_argument("--channel", default="msedge", help="installed browser: msedge | chrome")
    args = parser.parse_args()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as p:
        browser = p.chromium.launch(channel=args.channel)
        page = browser.new_page(viewport={"width": 1440, "height": 900}, color_scheme="light")
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)

        page.goto(args.base_url)
        expect(page.get_by_text("Drop an invoice here")).to_be_visible()
        page.screenshot(path=out / "01-empty.png")

        # 1) text PDF: progress steps are real server events (stub makes the AI step ~1.5 s)
        upload(page, SAMPLES / "invoice_text.pdf")
        expect(page.get_by_role("heading", name="Processing invoice")).to_be_visible()
        active = page.locator('li[aria-current="step"]')
        expect(active).to_contain_text("Reading the invoice with AI")
        page.screenshot(path=out / "02-progress.png")
        expect(page.get_by_role("heading", name="invoice_text.pdf")).to_be_visible(timeout=20_000)
        expect(page.get_by_text("Valid", exact=True).first).to_be_visible()
        expect(page.get_by_text("Subtotal + tax = total")).to_be_visible()
        expect(page.get_by_text("Matches").first).to_be_visible()
        expect(page.locator("iframe[title^='Preview of']")).to_be_visible()
        expect(page.get_by_role("link", name="Export CSV")).to_have_attribute("href", __import__("re").compile(r"/export\.csv$"))
        page.wait_for_timeout(1200)  # let the PDF viewer paint
        page.screenshot(path=out / "03-result-valid.png", full_page=True)

        # 2) deliberately wrong totals: highlighted fields + red totals check
        upload(page, SAMPLES / "invoice_wrong_totals.pdf")
        expect(page.get_by_role("heading", name="invoice_wrong_totals.pdf")).to_be_visible(timeout=20_000)
        expect(page.get_by_text("Needs a human check")).to_be_visible()
        expect(page.get_by_text("Does not match").first).to_be_visible()
        expect(page.locator("input[aria-invalid='true']").first).to_be_visible()
        page.wait_for_timeout(1200)
        page.screenshot(path=out / "04-result-needs-review.png", full_page=True)

        # 3) scanned image goes through OCR
        upload(page, SAMPLES / "invoice_scan.png")
        expect(page.get_by_role("heading", name="invoice_scan.png")).to_be_visible(timeout=30_000)
        expect(page.get_by_text("OCR", exact=True).first).to_be_visible()
        expect(page.locator("img[alt^='Scan of']")).to_be_visible()
        page.screenshot(path=out / "05-result-ocr.png", full_page=True)

        # 4) the same file again: "already processed", no new AI call
        upload(page, SAMPLES / "invoice_text.pdf")
        expect(page.get_by_text("Already processed.")).to_be_visible(timeout=20_000)
        page.screenshot(path=out / "06-duplicate.png")

        # 5) unreadable document: friendly error with request id
        with tempfile.TemporaryDirectory() as tmp:
            bad = Path(tmp) / "broken.pdf"
            bad.write_bytes(b"%PDF-1.7\n" + b"garbage" * 60)
            upload(page, bad)
            expect(page.get_by_text("We couldn't read this document")).to_be_visible(timeout=20_000)
            expect(page.get_by_text("Request ID:")).to_be_visible()
            page.screenshot(path=out / "07-error-unreadable.png")
            page.get_by_role("button", name="Dismiss").click()

        # 6) client-side check rejects a wrong file type without any request
        with tempfile.TemporaryDirectory() as tmp:
            junk = Path(tmp) / "notes.pdf"
            junk.write_bytes(b"just some text pretending to be a pdf")
            upload(page, junk)
            expect(page.get_by_role("alert").filter(has_text="Only PDF, PNG and JPEG")).to_be_visible()

        # 7) history filter
        page.get_by_role("radio", name="Review").click()
        expect(page.get_by_role("button", name="invoice_wrong_totals.pdf")).to_be_visible()
        expect(page.get_by_role("button", name="invoice_text.pdf")).to_have_count(0)
        page.get_by_role("radio", name="All").click()
        page.get_by_role("button", name="invoice_scan.png").click()
        expect(page.get_by_role("heading", name="invoice_scan.png").first).to_be_visible()

        # 8) deep link survives a reload
        page.reload()
        expect(page.get_by_role("heading", name="invoice_scan.png").first).to_be_visible(timeout=15_000)

        # 9) keyboard: the hidden file input is reachable and shows a focus ring
        page.locator('input[type="file"]').focus()
        page.screenshot(path=out / "08-keyboard-focus.png", clip={"x": 300, "y": 40, "width": 1000, "height": 140})

        # 10) dark theme
        page.get_by_role("button", name="Dark theme").click()
        expect(page.locator("html")).to_have_class(__import__("re").compile("dark"))
        page.wait_for_timeout(800)
        page.screenshot(path=out / "09-dark.png", full_page=True)

        # 11) phone layout: no horizontal overflow
        mobile = browser.new_page(viewport={"width": 390, "height": 844}, color_scheme="light")
        mobile.goto(args.base_url)
        upload(mobile, SAMPLES / "invoice_wrong_totals.pdf")
        expect(mobile.get_by_text("Needs a human check")).to_be_visible(timeout=20_000)
        overflow = mobile.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
        assert overflow <= 1, f"page overflows horizontally by {overflow}px on a phone"
        mobile.wait_for_timeout(1500)  # fade-in animation + PDF viewer paint
        mobile.screenshot(path=out / "10-mobile.png", full_page=True)

        # guards against UTF-8 text being decoded/encoded wrongly somewhere (shows up as "вЂ”")
        assert "вЂ" not in page.content() and "�" not in page.content(), "mojibake in the rendered page"
        assert not errors, f"browser console/page errors: {errors}"
        browser.close()
    print(f"UI check passed; screenshots in {out}")


if __name__ == "__main__":
    main()
