# Regenerates the small PDF fixtures used by tests/pdf.test.ts.
# Usage (from this folder): python3 generate-fixtures.py   (needs `pip install reportlab`)
# Never add real La Gaceta PDFs here: fixtures must stay a few KB.
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas


def text_pdf(path):
    pdf = canvas.Canvas(path, pagesize=letter, invariant=1)
    pages = [
        "Página uno: impuestos sobre la renta.",
        "Página dos: aranceles de importación y exportación.",
        "Página tres: fin del documento.",
    ]
    for text in pages:
        pdf.drawString(72, 700, text)
        pdf.showPage()
    pdf.save()


def no_text_pdf(path):
    # Simulates a scanned document: pages with drawings but no text layer.
    pdf = canvas.Canvas(path, pagesize=letter, invariant=1)
    for _ in range(2):
        pdf.rect(72, 72, 400, 600, fill=1)
        pdf.showPage()
    pdf.save()


text_pdf("three-pages-with-text.pdf")
no_text_pdf("two-pages-without-text.pdf")
