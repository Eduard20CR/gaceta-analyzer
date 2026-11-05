import type { JobStatus } from '@gaceta/shared';

/** What the user reads for each job status (NFR-UX-03). */
export const STATUS_LABELS: Record<JobStatus, string> = {
  PENDING_UPLOAD: 'Esperando archivo',
  PROCESSING: 'Analizando',
  COMPLETED: 'Completado',
  FAILED: 'Falló',
};

// One CSS class per status, so each one has its own color in styles.css.
const STATUS_CLASS_NAMES: Record<JobStatus, string> = {
  PENDING_UPLOAD: 'status-badge--pending',
  PROCESSING: 'status-badge--processing',
  COMPLETED: 'status-badge--completed',
  FAILED: 'status-badge--failed',
};

interface StatusBadgeProps {
  status: JobStatus;
}

/** A small colored label with the job status in Spanish. */
export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span className={`status-badge ${STATUS_CLASS_NAMES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}
