import type { JobSummary } from '@gaceta/shared';
import { Link } from 'react-router';

import { formatDateTime } from '../lib/format-date';
import { StatusBadge } from './StatusBadge';

/** "1 hallazgo", "3 hallazgos". */
export function formatFindingsCount(count: number): string {
  return count === 1 ? '1 hallazgo' : `${count} hallazgos`;
}

interface JobListItemProps {
  job: JobSummary;
}

/**
 * One analysis in the history (FR-05). The whole row is a link to the job
 * page, so it is easy to hit on a phone.
 */
export function JobListItem({ job }: JobListItemProps) {
  return (
    <Link to={`/jobs/${job.id}`} className="job-list__item">
      <span className="job-list__name">{job.name}</span>
      <span className="job-list__details">
        <time dateTime={job.createdAt}>{formatDateTime(job.createdAt)}</time>
        <StatusBadge status={job.status} />
        {/* Only completed jobs have findings; before that there is no count. */}
        {job.status === 'COMPLETED' && job.findingsCount !== undefined && (
          <span>{formatFindingsCount(job.findingsCount)}</span>
        )}
      </span>
    </Link>
  );
}
