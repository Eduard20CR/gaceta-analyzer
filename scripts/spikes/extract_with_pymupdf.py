"""Spike #10: writes the text PyMuPDF extracts from a PDF, one file per page.

See docs/spikes/0001-pdf-extraction.md. Two variants are written:
- <out-dir>/default/: get_text(), the order of the PDF's content stream.
- <out-dir>/sorted/:  get_text(sort=True), blocks sorted top-to-bottom, left-to-right.

Usage: python scripts/spikes/extract_with_pymupdf.py <pdf> <out-dir>
Requires `pip install pymupdf`. Never commit the PDF or the output.
"""

import pathlib
import sys
import time

import pymupdf


def write_pages(pdf_path: str, out_dir: pathlib.Path, sort: bool) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    started_at = time.monotonic()
    with pymupdf.open(pdf_path) as document:
        for index, page in enumerate(document):
            text = page.get_text(sort=sort)
            (out_dir / f"page-{index + 1:03d}.txt").write_text(text, encoding="utf-8")
        page_count = document.page_count
    duration_ms = round((time.monotonic() - started_at) * 1000)
    print(f"pymupdf (sort={sort}): {page_count} pages in {duration_ms} ms")


def main() -> None:
    if len(sys.argv) != 3:
        sys.exit("Usage: extract_with_pymupdf.py <pdf> <out-dir>")
    pdf_path, out_dir = sys.argv[1], pathlib.Path(sys.argv[2])
    write_pages(pdf_path, out_dir / "default", sort=False)
    write_pages(pdf_path, out_dir / "sorted", sort=True)


if __name__ == "__main__":
    main()
