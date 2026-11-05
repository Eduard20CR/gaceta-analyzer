import { useInfiniteQuery } from '@tanstack/react-query';

import { listJobs } from '../api';
import { Button } from '../components/Button';
import { EmptyJobList } from '../components/EmptyJobList';
import { ErrorMessage } from '../components/ErrorMessage';
import { JobListItem } from '../components/JobListItem';
import { Spinner } from '../components/Spinner';

/** Shown when the first page of the history could not be loaded. */
export const LIST_ERROR_MESSAGE =
  'No se pudieron cargar los análisis. Intente de nuevo.';

/** Shown when "Cargar más" failed; the jobs already loaded stay visible. */
export const LOAD_MORE_ERROR_MESSAGE =
  'No se pudieron cargar más análisis. Intente de nuevo.';

/**
 * The job history, one page of 20 at a time (FR-05).
 *
 * The API returns 20 jobs plus a `nextCursor` that says where the next 20
 * start (`null` when there are no more). `useInfiniteQuery` keeps every page
 * loaded so far, and `fetchNextPage` asks for the next one.
 */
function useJobList() {
  return useInfiniteQuery({
    queryKey: ['jobs'],
    // `pageParam` is the cursor: `undefined` for the first page.
    queryFn: ({ pageParam }) => listJobs(pageParam),
    initialPageParam: undefined as string | undefined,
    // Returning `undefined` tells TanStack Query that there is no next page.
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}

/** Home page: the analyses, newest first, as the API returns them (FR-05). */
export function JobListPage() {
  return (
    <section>
      <h1>Análisis</h1>
      <JobListContent />
    </section>
  );
}

function JobListContent() {
  const jobsQuery = useJobList();

  if (jobsQuery.isPending) {
    return <Spinner label="Cargando análisis…" />;
  }

  // The first page failed, so there is nothing to show yet.
  if (jobsQuery.isError && jobsQuery.data === undefined) {
    return (
      <ErrorMessage
        message={LIST_ERROR_MESSAGE}
        action={{
          label: 'Reintentar',
          onClick: () => void jobsQuery.refetch(),
        }}
      />
    );
  }

  const jobs = jobsQuery.data.pages.flatMap((page) => page.jobs);
  if (jobs.length === 0) {
    return <EmptyJobList />;
  }

  return (
    <>
      <ul className="job-list">
        {jobs.map((job) => (
          <li key={job.id}>
            <JobListItem job={job} />
          </li>
        ))}
      </ul>

      {jobsQuery.isFetchNextPageError && (
        <ErrorMessage
          message={LOAD_MORE_ERROR_MESSAGE}
          action={{
            label: 'Reintentar',
            onClick: () => void jobsQuery.fetchNextPage(),
          }}
        />
      )}

      {jobsQuery.hasNextPage && !jobsQuery.isFetchNextPageError && (
        <Button
          variant="secondary"
          className="job-list__load-more"
          disabled={jobsQuery.isFetchingNextPage}
          onClick={() => void jobsQuery.fetchNextPage()}
        >
          {jobsQuery.isFetchingNextPage ? 'Cargando…' : 'Cargar más'}
        </Button>
      )}
    </>
  );
}
