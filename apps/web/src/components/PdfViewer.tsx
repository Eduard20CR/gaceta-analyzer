// In-app PDF viewer with page navigation and zoom (FR-06, ADR-0009).
//
// react-pdf draws one page with pdf.js, the same library the backend uses to
// read the text. Only the current page is rendered: a 500-page Gaceta would
// freeze the browser if every page were drawn at once.

import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
// `?url` makes Vite copy the pdf.js worker into the build and give its address,
// so the worker is served by CloudFront with the app instead of an external CDN.
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

import {
  FIT_WIDTH_ZOOM,
  ZOOM_STEP,
  clampPage,
  clampZoom,
  formatZoom,
} from '../lib/pdf-pages';
import { Button } from './Button';
import { Spinner } from './Spinner';

// pdf.js reads the PDF in a "worker" (a background thread), so a large file
// does not block the page while it is being parsed.
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

// Width of a page in pixels before the viewer has been measured.
const DEFAULT_PAGE_WIDTH = 600;

interface PdfViewerProps {
  /** Presigned URL of the PDF (valid 15 minutes). */
  url: string;
  /** The page to show, from 1. The parent owns it, so a finding can change it. */
  page: number;
  onPageChange: (page: number) => void;
  /** Called when the PDF cannot be loaded (for example, the URL expired). */
  onLoadError: () => void;
}

export function PdfViewer({
  url,
  page,
  onPageChange,
  onLoadError,
}: PdfViewerProps) {
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [zoom, setZoom] = useState(FIT_WIDTH_ZOOM);
  const [containerRef, containerWidth] = useElementWidth<HTMLDivElement>();

  // Until the PDF has loaded, the number of pages is unknown.
  const currentPage = pageCount === null ? page : clampPage(page, pageCount);

  function goToPage(target: number) {
    if (pageCount !== null) {
      onPageChange(clampPage(target, pageCount));
    }
  }

  return (
    <div className="pdf-viewer">
      <div className="pdf-viewer__toolbar">
        <div className="pdf-viewer__nav">
          <Button
            variant="secondary"
            disabled={pageCount === null || currentPage <= 1}
            onClick={() => goToPage(currentPage - 1)}
          >
            Anterior
          </Button>
          {/* `key`: when the page changes (a finding, previous/next), React
            creates the input again, so it shows the new page number. */}
          <PageInput
            key={currentPage}
            page={currentPage}
            pageCount={pageCount}
            onSubmit={goToPage}
          />
          <Button
            variant="secondary"
            disabled={pageCount === null || currentPage >= pageCount}
            onClick={() => goToPage(currentPage + 1)}
          >
            Siguiente
          </Button>
        </div>

        <span className="pdf-viewer__zoom">
          <Button
            variant="secondary"
            aria-label="Alejar"
            onClick={() => setZoom((current) => clampZoom(current - ZOOM_STEP))}
          >
            −
          </Button>
          <span className="pdf-viewer__zoom-level" aria-live="polite">
            {formatZoom(zoom)}
          </span>
          <Button
            variant="secondary"
            aria-label="Acercar"
            onClick={() => setZoom((current) => clampZoom(current + ZOOM_STEP))}
          >
            +
          </Button>
          <Button variant="secondary" onClick={() => setZoom(FIT_WIDTH_ZOOM)}>
            Ajustar al ancho
          </Button>
        </span>
      </div>

      <div ref={containerRef} className="pdf-viewer__canvas">
        <Document
          file={url}
          loading={<Spinner label="Cargando el PDF…" />}
          // The error is shown by the parent, which may first retry with a
          // fresh URL; react-pdf's own message would be in English.
          error={<span />}
          onLoadSuccess={(pdf) => setPageCount(pdf.numPages)}
          onLoadError={onLoadError}
        >
          <Page
            pageNumber={currentPage}
            width={containerWidth ?? DEFAULT_PAGE_WIDTH}
            scale={zoom}
            loading={<Spinner label="Cargando la página…" />}
          />
        </Document>
      </div>
    </div>
  );
}

interface PageInputProps {
  page: number;
  pageCount: number | null;
  onSubmit: (page: number) => void;
}

/**
 * "Página [ 14 ] / 500". The typed number is only applied with Enter (or when
 * the field loses focus), so typing "1" on the way to "120" does not jump to
 * page 1.
 */
function PageInput({ page, pageCount, onSubmit }: PageInputProps) {
  const [text, setText] = useState(String(page));

  function apply() {
    const typed = Number(text);
    if (text.trim() === '' || Number.isNaN(typed)) {
      setText(String(page));
      return;
    }
    onSubmit(typed);
    // If the clamped page is the same as before, the input is not created
    // again (same key), so show the clamped number here.
    setText(String(pageCount === null ? page : clampPage(typed, pageCount)));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      apply();
    }
  }

  return (
    <div className="pdf-viewer__page-form">
      <label htmlFor="pdf-viewer-page">Página</label>
      <input
        id="pdf-viewer-page"
        type="number"
        inputMode="numeric"
        min={1}
        max={pageCount ?? undefined}
        value={text}
        disabled={pageCount === null}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={apply}
      />
      <span className="pdf-viewer__page-count">
        {page} / {pageCount ?? '…'}
      </span>
    </div>
  );
}

/**
 * The width of an element, kept up to date when the window is resized, so
 * "fit to width" really fits on a phone and on a desktop. `undefined` until it
 * is measured, or where ResizeObserver does not exist (tests).
 */
function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState<number | undefined>(undefined);

  useEffect(() => {
    const element = ref.current;
    if (element === null || typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry !== undefined) {
        setWidth(Math.floor(entry.contentRect.width));
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, width] as const;
}
