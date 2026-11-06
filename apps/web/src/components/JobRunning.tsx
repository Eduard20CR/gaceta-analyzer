import type { JobStatus } from '@gaceta/shared';

import { Spinner } from './Spinner';

interface JobRunningProps {
  status: Extract<JobStatus, 'PENDING_UPLOAD' | 'PROCESSING'>;
}

/**
 * Shown while the job is not finished. There is no per-block progress, only
 * that it is still working (ADR-0014).
 */
export function JobRunning({ status }: JobRunningProps) {
  const label =
    status === 'PENDING_UPLOAD'
      ? 'Esperando que termine la subida…'
      : 'Analizando el documento…';

  return (
    <div className="job-running card">
      <Spinner label={label} />
      <p>Puede cerrar esta página y volver más tarde: el análisis continúa.</p>
    </div>
  );
}
