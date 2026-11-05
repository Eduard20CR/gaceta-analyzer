import type { Finding } from '@gaceta/shared';

import { formatPageList, relevantPages } from '../lib/job-results';

interface JobSummaryProps {
  findings: readonly Finding[];
  /** Pages of blocks that could not be analyzed (FR-03). */
  failedPages: readonly number[];
}

/** "Resumen": how many findings there are and which pages to read first (FR-04). */
export function JobSummary({ findings, failedPages }: JobSummaryProps) {
  const pages = relevantPages(findings);

  return (
    <section aria-labelledby="job-summary-title" className="job-summary">
      <h2 id="job-summary-title">Resumen</h2>
      <p>
        {findings.length === 1
          ? 'Se encontró 1 hallazgo.'
          : `Se encontraron ${findings.length} hallazgos.`}
      </p>
      <p>
        Páginas con relevancia alta o media:{' '}
        {pages.length > 0 ? formatPageList(pages) : 'ninguna'}.
      </p>

      {/* Only when some blocks failed: the user must know what was not read. */}
      {failedPages.length > 0 && (
        <p role="note" className="job-summary__failed-pages">
          No se pudieron analizar las páginas: {formatPageList(failedPages)}.
        </p>
      )}
    </section>
  );
}
