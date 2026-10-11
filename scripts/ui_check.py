"""Drive the real UI in a real browser: asserts the main flows and captures README screenshots.

Prerequisites (see README "Tests"): a backend reachable at BASE_URL/api and the UI served at
BASE_URL, e.g. the Vite dev server (npm run dev) in front of `python scripts/stub_llm_server.py`,
or the Docker stack. The database must be EMPTY of the sample invoices (duplicates would skip the
progress steps). Uses the locally installed Edge/Chrome.

    pip install -r scripts/requirements.txt
    python scripts/ui_check.py --base-url http://localhost:5173 --out docs/screenshots
"""
from __future__ import annotations

import argparse
import re
import tempfile
from pathlib import Path

from playwright.sync_api import Page, expect, sync_playwright

ROOT = Path(__file__).resolve().parent.parent
SAMPLES = ROOT / "tests" / "samples"


def upload(page: Page, path: Path) -> None:
    page.locator('input[type="file"]').set_input_files(str(path))


def processed_card(page: Page, filename: str):
    return page.locator('section[aria-label="Processed file"]').filter(has_text=filename)


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
        context = browser.new_context(
            viewport={"width": 1440, "height": 900},
            permissions=["clipboard-read", "clipboard-write"],
        )
        page = context.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)

        # --- empty state (dark is the default design) -----------------------------------------
        page.goto(args.base_url)
        expect(page.get_by_text("Drop a PDF or image here")).to_be_visible()
        expect(page.locator("html")).to_have_class(re.compile("dark"))
        page.screenshot(path=out / "01-empty.png")

        # --- 1) text PDF: progress steps are real server events (stub makes the AI step ~1.5 s) ---
        upload(page, SAMPLES / "invoice_text.pdf")
        processing = page.locator('section[aria-label="Processing"]')
        expect(processing).to_be_visible()
        expect(processing.locator('li[aria-current="step"]')).to_contain_text("LLM extraction")
        expect(processing.get_by_role("status")).to_contain_text("Reading the invoice with AI")
        page.wait_for_timeout(400)  # let the card's fade-in and the bar's width transition settle
        page.screenshot(path=out / "02-progress.png")

        expect(processed_card(page, "invoice_text.pdf")).to_be_visible(timeout=20_000)
        expect(page.get_by_text("Valid", exact=True).first).to_be_visible()
        expect(page.locator('li[data-check="total"][data-state="ok"]')).to_be_visible()
        expect(page.locator('li[data-check="subtotal"][data-state="ok"]')).to_be_visible()
        expect(page.locator("iframe[title^='Preview of']")).to_be_visible()
        expect(page.get_by_role("link", name="Export CSV")).to_have_attribute("href", re.compile(r"/export\.csv$"))
        page.wait_for_timeout(1500)  # let the PDF viewer paint
        page.screenshot(path=out / "03-result-valid.png", full_page=True)

        # --- 2) JSON tab and Copy JSON -----------------------------------------------------------
        page.get_by_role("tab", name="JSON").click()
        expect(page.get_by_label("Extracted data as JSON")).to_contain_text('"invoice_number": "INV-2026-0042"')
        page.screenshot(path=out / "04-json-tab.png")
        page.get_by_role("button", name="Copy JSON").click()
        expect(page.get_by_role("button", name="Copied")).to_be_visible()
        copied = page.evaluate("navigator.clipboard.readText()")
        assert '"invoice_number": "INV-2026-0042"' in copied and '"status": "valid"' in copied, "clipboard content"
        page.get_by_role("tab", name="Fields").click()

        # --- 3) deliberately wrong totals: highlighted fields + failed checks ------------------------
        upload(page, SAMPLES / "invoice_wrong_totals.pdf")
        expect(processed_card(page, "invoice_wrong_totals.pdf")).to_be_visible(timeout=20_000)
        expect(page.get_by_text("Needs a human check")).to_be_visible()
        expect(page.locator('li[data-check="total"][data-state="bad"]')).to_be_visible()
        expect(page.locator('li[data-check="subtotal"][data-state="bad"]')).to_be_visible()
        expect(page.locator('dl [data-invalid="true"]')).to_have_count(0)  # header fields themselves are fine
        expect(page.locator('dl[aria-label="Totals"][data-total-bad="true"]')).to_be_visible()
        page.wait_for_timeout(1500)
        page.screenshot(path=out / "05-result-needs-review.png", full_page=True)

        # --- 4) scanned image goes through OCR ---------------------------------------------------
        upload(page, SAMPLES / "invoice_scan.png")
        expect(processed_card(page, "invoice_scan.png")).to_be_visible(timeout=30_000)
        expect(processed_card(page, "invoice_scan.png").get_by_text("OCR", exact=True)).to_be_visible()
        expect(page.locator("img[alt^='Scan of']")).to_be_visible()
        page.screenshot(path=out / "06-result-ocr.png", full_page=True)

        # --- 5) the same file again: "already processed", no new AI call -------------------------------
        upload(page, SAMPLES / "invoice_text.pdf")
        expect(page.get_by_text("Already processed.")).to_be_visible(timeout=20_000)
        page.screenshot(path=out / "07-duplicate.png")

        # --- 6) unreadable document: friendly error with request id ----------------------------------
        with tempfile.TemporaryDirectory() as tmp:
            bad = Path(tmp) / "broken.pdf"
            bad.write_bytes(b"%PDF-1.7\n" + b"garbage" * 60)
            upload(page, bad)
            expect(page.get_by_text("We couldn't read this document")).to_be_visible(timeout=20_000)
            expect(page.get_by_text("Request ID:")).to_be_visible()
            page.screenshot(path=out / "08-error-unreadable.png")
            page.get_by_role("button", name="Dismiss").click()

        # --- 7) client-side check rejects a wrong file type without any request -----------------------
        with tempfile.TemporaryDirectory() as tmp:
            junk = Path(tmp) / "notes.pdf"
            junk.write_bytes(b"just some text pretending to be a pdf")
            upload(page, junk)
            expect(page.get_by_role("alert").filter(has_text="Only PDF, PNG and JPEG")).to_be_visible()

        # --- 8) History page: filter, open an entry ----------------------------------------------------
        page.get_by_role("link", name="History").click()
        expect(page.get_by_role("heading", name="History", exact=True)).to_be_visible()
        page.get_by_role("radio", name="Review").click()
        expect(page.get_by_role("button", name=re.compile("invoice_wrong_totals.pdf"))).to_be_visible()
        expect(page.get_by_role("button", name=re.compile("invoice_text.pdf"))).to_have_count(0)
        page.get_by_role("radio", name="All").click()
        expect(page.get_by_role("button", name=re.compile("invoice_scan.png"))).to_be_visible()
        page.screenshot(path=out / "09-history.png")
        page.get_by_role("button", name=re.compile("invoice_scan.png")).click()
        expect(processed_card(page, "invoice_scan.png")).to_be_visible()

        # --- 9) deep link survives a reload ----------------------------------------------------------------
        page.reload()
        expect(processed_card(page, "invoice_scan.png")).to_be_visible(timeout=15_000)

        # --- 10) keyboard: the hidden file input is reachable and shows a focus ring --------------------
        page.locator('input[type="file"]').focus()
        page.screenshot(path=out / "11-keyboard-focus.png", clip={"x": 232, "y": 20, "width": 700, "height": 220})

        # --- 11) light theme, with a result on screen -------------------------------------------------------------
        page.get_by_role("button", name="Light theme").click()
        expect(page.locator("html")).not_to_have_class(re.compile("dark"))
        page.wait_for_timeout(1500)
        page.screenshot(path=out / "12-light.png", full_page=True)
        page.reload()  # the choice is remembered
        expect(page.locator("html")).not_to_have_class(re.compile("dark"))
        page.get_by_role("button", name="Dark theme").click()

        # --- 12) API page ---------------------------------------------------------------------------------------
        page.get_by_role("link", name="API", exact=True).click()
        expect(page.get_by_role("heading", name="Calling the API yourself")).to_be_visible()
        page.screenshot(path=out / "10-api.png")
        page.get_by_role("link", name="Extract", exact=True).click()

        # --- 13) phone layout: no horizontal overflow -----------------------------------------------------------
        mobile = browser.new_page(viewport={"width": 390, "height": 844})
        mobile.goto(args.base_url)
        upload(mobile, SAMPLES / "invoice_wrong_totals.pdf")
        expect(mobile.get_by_text("Needs a human check")).to_be_visible(timeout=20_000)
        overflow = mobile.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
        assert overflow <= 1, f"page overflows horizontally by {overflow}px on a phone"
        mobile.wait_for_timeout(1500)  # fade-in animation + PDF viewer paint
        mobile.screenshot(path=out / "13-mobile.png", full_page=True)

        # guards against UTF-8 text being decoded/encoded wrongly somewhere (shows up as "вЂ”")
        assert "вЂ" not in page.content() and "�" not in page.content(), "mojibake in the rendered page"
        assert not errors, f"browser console/page errors: {errors}"
        browser.close()
    print(f"UI check passed; screenshots in {out}")


if __name__ == "__main__":
    main()
