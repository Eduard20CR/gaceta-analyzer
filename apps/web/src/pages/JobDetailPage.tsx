import { useQuery } from '@tanstack/react-query';
import { POLLING_INTERVAL_MS } from '@gaceta/shared';
import type { Finding, Job } from '@gaceta/shared';
import { useState } from 'react';
import { Link, useParams } from 'react-router';

import { ApiError, getJob } from '../api';
import { ErrorMessage } from '../components/ErrorMessage';
import { FindingCard } from '../components/FindingCard';
import { FindingsFilter } from '../components/FindingsFilter';
import { JobRunning } from '../components/JobRunning';
import { JobSummary } from '../components/JobSummary';
import { Spinner } from '../components/Spinner';
import { StatusBadge } from '../components/StatusBadge';
import { formatDateTime } from '../lib/format-date';
import {
  countByRelevance,
  filterByRelevance,
  isJobRunning,
  sortByPage,
} from '../lib/job-results';
import type { RelevanceFilter } from '../lib/job-results';

export const JOB_NOT_FOUND_MESSAGE = 'El análisis no existe';
export const JOB_LOAD_ERROR_MESSAGE =
  'No se pudo cargar el análisis. Intente de nuevo.';
/** Shown when a FAILED job has no message of its own. */
export const JOB_FAILED_FALLBACK_MESSAGE = 'El análisis no se pudo completar.';

function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}

/**
 * The job page, at the stable address /jobs/{id} (FR-04).
 *
 * While the job is running, it asks the API for the job every 4 seconds; once
 * the job is COMPLETED or FAILED it stops, because nothing will change. The
 * API already turns a job that took too long into FAILED (ADR-0005).
 */
export function JobDetailPage() {
  // The route is /jobs/:id, so `id` is always present here.
  const { id = '' } = useParams();

  const jobQuery = useQuery({
    queryKey: ['job', id],
    queryFn: () => getJob(id),
    // Called after every response: a number means "ask again in N ms",
    // `false` means stop asking.
    refetchInterval: (query) => {
      const status = query.state.data?.job.status;
      if (status !== undefined && isJobRunning(status)) {
        return POLLING_INTERVAL_MS;
      }
      return false;
    },
  });

  if (jobQuery.isPending) {
    return <Spinner label="Cargando análisis…" />;
  }

  if (jobQuery.isError) {
    return <JobLoadError error={jobQuery.error} onRetry={jobQuery.refetch} />;
  }

  const { job, findings } = jobQuery.data;

  return (
    <article className="job-detail">
      <JobHeader job={job} />
      <JobBody job={job} findings={findings ?? []} />
    </article>
  );
}

interface JobLoadErrorProps {
  error: Error;
  onRetry: () => unknown;
}

function JobLoadError({ error, onRetry }: JobLoadErrorProps) {
  if (isNotFound(error)) {
    return (
      <section>
        <h1>{JOB_NOT_FOUND_MESSAGE}</h1>
        <p>
          <Link to="/">Volver a la lista de análisis</Link>
        </p>
      </section>
    );
  }
  return (
    <ErrorMessage
      message={JOB_LOAD_ERROR_MESSAGE}
      action={{ label: 'Reintentar', onClick: () => void onRetry() }}
    />
  );
}

function JobHeader({ job }: { job: Job }) {
  return (
    <header className="job-detail__header">
      <div className="job-detail__title">
        <h1>{job.name}</h1>
        <StatusBadge status={job.status} />
      </div>
      <dl className="job-detail__facts">
        <dt>Búsqueda</dt>
        <dd>{job.query}</dd>
        <dt>Páginas por bloque</dt>
        <dd>{job.pagesPerBlock}</dd>
        <dt>Creado</dt>
        <dd>
          <time dateTime={job.createdAt}>{formatDateTime(job.createdAt)}</time>
        </dd>
      </dl>
    </header>
  );
}

/** What is below the header depends on the status. */
function JobBody({ job, findings }: { job: Job; findings: Finding[] }) {
  switch (job.status) {
    case 'PENDING_UPLOAD':
    case 'PROCESSING':
      return <JobRunning status={job.status} />;
    case 'FAILED':
      return (
        <div className="job-detail__failed">
          <ErrorMessage
            message={job.errorMessage ?? JOB_FAILED_FALLBACK_MESSAGE}
          />
          <p>
            <Link to="/jobs/new">Crear un análisis nuevo</Link>
          </p>
        </div>
      );
    case 'COMPLETED':
      return (
        <JobResults findings={findings} failedPages={job.failedPages ?? []} />
      );
  }
}

interface JobResultsProps {
  findings: Finding[];
  failedPages: number[];
}

function JobResults({ findings, failedPages }: JobResultsProps) {
  const [filter, setFilter] = useState<RelevanceFilter>('all');

  const sortedFindings = sortByPage(findings);
  const visibleFindings = filterByRelevance(sortedFindings, filter);

  return (
    <>
      <JobSummary findings={sortedFindings} failedPages={failedPages} />

      <section aria-labelledby="job-findings-title">
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
                  <FindingCard finding={finding} />
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </>
  );
}
