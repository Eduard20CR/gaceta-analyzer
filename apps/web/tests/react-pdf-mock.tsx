// A fake `react-pdf` for every test (ADR-0013): jsdom has no canvas, so the
// real pdf.js cannot draw a page. tests/setup.ts replaces the module with this
// file. The fake "loads" a PDF of `fakePdf.pageCount` pages and draws each page
// as a line of text, so tests can check which page (and how many pages) the
// app renders.

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

interface FakePdfState {
  /** Pages of every fake PDF. */
  pageCount: number;
  /** URLs whose load must fail (for example an expired presigned URL). */
  failingUrls: Set<string>;
  /** Every URL the viewer tried to load, in order. */
  loadedUrls: string[];
}

export const fakePdf: FakePdfState = {
  pageCount: 10,
  failingUrls: new Set(),
  loadedUrls: [],
};

/** Back to a 10-page PDF that loads fine (called after every test). */
export function resetFakePdf(): void {
  fakePdf.pageCount = 10;
  fakePdf.failingUrls = new Set();
  fakePdf.loadedUrls = [];
}

export const pdfjs = { GlobalWorkerOptions: { workerSrc: '' } };

interface FakeDocumentProps {
  file: string;
  onLoadSuccess?: (pdf: { numPages: number }) => void;
  onLoadError?: (error: Error) => void;
  children?: ReactNode;
}

export function Document({
  file,
  onLoadSuccess,
  onLoadError,
  children,
}: FakeDocumentProps) {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fakePdf.loadedUrls.push(file);
    // Asynchronous, like a real download.
    void Promise.resolve().then(() => {
      if (fakePdf.failingUrls.has(file)) {
        onLoadError?.(new Error('Fake load error'));
        return;
      }
      onLoadSuccess?.({ numPages: fakePdf.pageCount });
      setLoaded(true);
    });
    // Only a new file is a new load, as in react-pdf.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  return <div data-testid="pdf-document">{loaded ? children : null}</div>;
}

interface FakePageProps {
  pageNumber: number;
  scale?: number;
}

export function Page({ pageNumber, scale = 1 }: FakePageProps) {
  return (
    <div data-testid="pdf-page" data-scale={scale}>
      Página {pageNumber} del PDF
    </div>
  );
}
