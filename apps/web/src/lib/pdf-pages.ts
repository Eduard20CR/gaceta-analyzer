// Page and zoom rules of the PDF viewer (FR-06), as pure functions so they can
// be tested without rendering a PDF.

/** Zoom levels: 100% is "fit to the width of the viewer". */
export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 3;
export const ZOOM_STEP = 0.25;
export const FIT_WIDTH_ZOOM = 1;

/**
 * Keeps a page number inside 1…pageCount, so previous/next and a typed page can
 * never go outside the document. Decimals are rounded down ("3.7" → 3).
 */
export function clampPage(page: number, pageCount: number): number {
  if (pageCount < 1 || Number.isNaN(page)) {
    return 1;
  }
  const wholePage = Math.floor(page);
  if (wholePage < 1) {
    return 1;
  }
  if (wholePage > pageCount) {
    return pageCount;
  }
  return wholePage;
}

/** Keeps a zoom level inside MIN_ZOOM…MAX_ZOOM. */
export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/** "125 %" for 1.25. */
export function formatZoom(zoom: number): string {
  return `${Math.round(zoom * 100)} %`;
}
