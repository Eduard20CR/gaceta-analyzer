// Results of a COMPLETED job: summary, findings and the PDF (FR-04, FR-06).
//
// On a wide screen the findings and the PDF are side by side. On a phone there
// is no room for both, so two tabs ("Hallazgos" / "Documento") show one at a
// time; styles.css hides the tabs on wide screens.

import type { Finding } from '@gaceta/shared';
import { Suspense, lazy, useState } from 'react';

import {
  countByRelevance,
  filterByRelevance,
  sortByPage,
} from '../lib/job-results';
import type { RelevanceFilter } from '../lib/job-results';
import { ErrorMessage } from './ErrorMessage';
import { FindingCard } from './FindingCard';
import { FindingsFilter } from './FindingsFilter';
import { JobSummary } from './JobSummary';
import { Spinner } from './Spinner';

// pdf.js is large (about 1 MB), so it is downloaded only when a job page with
// results opens, instead of making the login page and the list slower.
const PdfViewer = lazy(async () => {
  const module = await import('./PdfViewer');
  return { default: module.PdfViewer };
});

export const PDF_DELETED_MESSAGE = 'El PDF ya no está disponible';
export const PDF_LOAD_ERROR_MESSAGE =
  'No se pudo cargar el PDF. Recargue la página para intentarlo de nuevo.';

type Tab = 'findings' | 'document';

interface JobResultsProps {
  findings: Finding[];
  failedPages: number[];
  /** Presigned URL of the PDF, or `null` once it was deleted (30 days, NFR-SEC-06). */
  pdfUrl: string | null;
  /** Asks the API for the job again, which returns a fresh `pdfUrl`. */
  onRefreshPdfUrl: () => void;
}

export function JobResults({
  findings,
  failedPages,
  pdfUrl,
  onRefreshPdfUrl,
}: JobResultsProps) {
  const [filter, setFilter] = useState<RelevanceFilter>('all');
  const [viewerPage, setViewerPage] = useState(1);
  const [activeTab, setActiveTab] = useState<Tab>('findings');

  const sortedFindings = sortByPage(findings);
  const visibleFindings = filterByRelevance(sortedFindings, filter);

  function showPage(page: number) {
    setViewerPage(page);
    // On a phone the viewer is in the other tab, so open it.
    setActiveTab('document');
  }

  // Without a PDF there is nothing to jump to, so the cards get no button.
  const onShowPage = pdfUrl === null ? undefined : showPage;

  return (
    <>
      <JobSummary findings={sortedFindings} failedPages={failedPages} />

      <div role="tablist" aria-label="Resultados" className="job-results__tabs">
        <TabButton
          tab="findings"
          activeTab={activeTab}
          label="Hallazgos"
          onSelect={setActiveTab}
        />
        <TabButton
          tab="document"
          activeTab={activeTab}
          label="Documento"
          onSelect={setActiveTab}
        />
      </div>

      <div className="job-results__columns">
        <section
          id="job-results-findings"
          aria-labelledby="job-findings-title"
          className={panelClassName('findings', activeTab)}
        >
          <h2 id="job-findings-title">Hallazgos</h2>
          {findings.length === 0 ? (
            <p>No se encontraron citas relacionadas con su búsqueda.</p>
          ) : (
            <>
              <FindingsFilter
                value={filter}
                counts={countByRelevance(findings)}
                onChange={setFilter}
              />
              <ul className="findings-list">
                {visibleFindings.map((finding, index) => (
                  // Two findings can share a page, so the index is part of the key.
                  <li key={`${finding.page}-${index}`}>
                    <FindingCard finding={finding} onShowPage={onShowPage} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <section
          id="job-results-document"
          aria-labelledby="job-document-title"
          className={panelClassName('document', activeTab)}
        >
          <h2 id="job-document-title">Documento</h2>
          <DocumentPanel
            pdfUrl={pdfUrl}
            page={viewerPage}
            onPageChange={setViewerPage}
            onRefreshPdfUrl={onRefreshPdfUrl}
          />
        </section>
      </div>
    </>
  );
}

/** The inactive panel is hidden only on narrow screens (styles.css). */
function panelClassName(tab: Tab, activeTab: Tab): string {
  const classNames = ['job-results__panel'];
  if (tab !== activeTab) {
    classNames.push('job-results__panel--inactive');
  }
  return classNames.join(' ');
}

interface TabButtonProps {
  tab: Tab;
  activeTab: Tab;
  label: string;
  onSelect: (tab: Tab) => void;
}

function TabButton({ tab, activeTab, label, onSelect }: TabButtonProps) {
  return (
    <button
      type="button"
      role="tab"
      className="job-results__tab"
      aria-selected={tab === activeTab}
      aria-controls={`job-results-${tab}`}
      onClick={() => onSelect(tab)}
    >
      {label}
    </button>
  );
}

interface DocumentPanelProps {
  pdfUrl: string | null;
  page: number;
  onPageChange: (page: number) => void;
  onRefreshPdfUrl: () => void;
}

/**
 * The viewer, or why there is none.
 *
 * The PDF link expires 15 minutes after the job was loaded. When loading fails,
 * the most likely reason is an expired link, so the job is asked for again
 * once (which brings a fresh link) before showing an error.
 */
function DocumentPanel({
  pdfUrl,
  page,
  onPageChange,
  onRefreshPdfUrl,
}: DocumentPanelProps) {
  // The link that failed and was replaced by asking for the job again.
  const [refreshedUrl, setRefreshedUrl] = useState<string | null>(null);
  const [gaveUp, setGaveUp] = useState(false);

  if (pdfUrl === null) {
    return <p className="job-results__no-pdf">{PDF_DELETED_MESSAGE}</p>;
  }

  if (gaveUp) {
    return <ErrorMessage message={PDF_LOAD_ERROR_MESSAGE} />;
  }

  // Waiting for the job with the fresh link.
  if (refreshedUrl === pdfUrl) {
    return <Spinner label="Cargando el PDF…" />;
  }

  function handleLoadError() {
    // Only once: if the fresh link fails too, the problem is something else.
    if (refreshedUrl === null && pdfUrl !== null) {
      setRefreshedUrl(pdfUrl);
      onRefreshPdfUrl();
    } else {
      setGaveUp(true);
    }
  }

  return (
    <Suspense fallback={<Spinner label="Cargando el visor…" />}>
      <PdfViewer
        // A new link creates a new viewer, which loads the PDF again.
        key={pdfUrl}
        url={pdfUrl}
        page={page}
        onPageChange={onPageChange}
        onLoadError={handleLoadError}
      />
    </Suspense>
  );
}
