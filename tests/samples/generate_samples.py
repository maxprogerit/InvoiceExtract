"""Generate the synthetic sample invoices used by the tests.

Run from the project root:  python tests/samples/generate_samples.py
All names and numbers are fictional. Requires the dev dependency `reportlab`.
"""
from __future__ import annotations

import random
from pathlib import Path
from typing import List, Tuple

from PIL import Image, ImageDraw, ImageFilter, ImageFont
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

OUT_DIR = Path(__file__).parent

VENDOR = "Acme Test Supplies Ltd"
VENDOR_ADDRESS = "1 Example Street, Sampleville"
INVOICE_NUMBER = "INV-2026-0042"
INVOICE_DATE = "2026-03-15"
DUE_DATE = "2026-04-14"
CURRENCY = "EUR"

# description, quantity, unit price, line total
LINES: List[Tuple[str, str, str, str]] = [
    ("Widget A", "10", "12.50", "125.00"),
    ("Gadget B", "3", "49.99", "149.97"),
    ("Service fee", "1", "75.00", "75.00"),
]


def _layout(subtotal: str, tax: str, total: str) -> List[str]:
    """Plain text lines of the invoice, shared by the PDF and the image renderers."""
    rows = [
        VENDOR,
        VENDOR_ADDRESS,
        "",
        "INVOICE",
        f"Invoice number: {INVOICE_NUMBER}",
        f"Invoice date: {INVOICE_DATE}",
        f"Due date: {DUE_DATE}",
        f"Currency: {CURRENCY}",
        "",
        "Description        Qty    Unit price    Line total",
    ]
    for desc, qty, price, line_total in LINES:
        rows.append(f"{desc:<18} {qty:>3}    {price:>10}    {line_total:>10}")
    rows += [
        "",
        f"Subtotal: {subtotal}",
        f"VAT 20%: {tax}",
        f"Total: {total}",
    ]
    return rows


def make_text_pdf(path: Path, subtotal: str, tax: str, total: str) -> None:
    pdf = canvas.Canvas(str(path), pagesize=A4)
    pdf.setTitle("Synthetic sample invoice")
    y = 800
    for row in _layout(subtotal, tax, total):
        # Courier keeps the columns aligned, so text extraction yields readable rows.
        pdf.setFont("Courier-Bold" if row in (VENDOR, "INVOICE") else "Courier", 11)
        pdf.drawString(50, y, row)
        y -= 18
    pdf.save()


def make_scan_image(path: Path, subtotal: str, tax: str, total: str) -> None:
    """Render the invoice as an image and degrade it a little to look like a scan."""
    rng = random.Random(42)  # deterministic output
    font = ImageFont.load_default(size=26)
    rows = _layout(subtotal, tax, total)
    image = Image.new("L", (1240, 60 + 40 * len(rows)), 245)
    draw = ImageDraw.Draw(image)
    y = 30
    for row in rows:
        draw.text((60, y), row, fill=25, font=font)
        y += 40
    image = image.rotate(1.2, resample=Image.BICUBIC, expand=True, fillcolor=240)
    pixels = image.load()
    for _ in range(image.width * image.height // 40):  # light speckle noise
        x, yy = rng.randrange(image.width), rng.randrange(image.height)
        pixels[x, yy] = max(0, min(255, pixels[x, yy] + rng.randint(-40, 40)))
    image = image.filter(ImageFilter.GaussianBlur(0.6))
    image.save(path)


def main() -> None:
    # Correct totals: 125.00 + 149.97 + 75.00 = 349.97; 20% VAT = 69.99; total = 419.96
    make_text_pdf(OUT_DIR / "invoice_text.pdf", "349.97", "69.99", "419.96")
    make_scan_image(OUT_DIR / "invoice_scan.png", "349.97", "69.99", "419.96")
    # Deliberately wrong: subtotal does not match the lines and total does not match subtotal + tax.
    make_text_pdf(OUT_DIR / "invoice_wrong_totals.pdf", "359.97", "69.99", "439.96")
    print("samples written to", OUT_DIR)


if __name__ == "__main__":
    main()
