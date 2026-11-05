import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { useRoutes } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';

import type { JobSummary, ListJobsResponse } from '@gaceta/shared';

import { setPassword } from '../../src/api';
import { formatDateTime } from '../../src/lib/format-date';
import { routes } from '../../src/routes';
import { server } from '../msw/server';
import { renderWithProviders } from '../render-app';

/** The app's real route table, so clicking a job opens the real job page. */
function AppRoutes() {
  return useRoutes(routes);
}

function renderJobList() {
  return renderWithProviders(<AppRoutes />, { route: '/' });
}

/** A completed job named "Análisis <n>", created <n> minutes after a fixed date. */
function makeJob(n: number): JobSummary {
  const createdAt = new Date(Date.UTC(2026, 10, 4, 12, n)).toISOString();
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    name: `Análisis ${n}`,
    status: 'COMPLETED',
    createdAt,
    findingsCount: n,
  };
}

/** Job numbers from..to, both included. */
function makeJobs(from: number, to: number): JobSummary[] {
  const jobs: JobSummary[] = [];
  for (let n = from; n <= to; n += 1) {
    jobs.push(makeJob(n));
  }
  return jobs;
}

/** Answers GET /api/jobs with `pages[0]` for no cursor and `pages[i]` for cursor "page-i". */
function serveJobPages(pages: ListJobsResponse[]) {
  const requestedCursors: (string | null)[] = [];
  server.use(
    http.get('/api/jobs', ({ request }) => {
      const cursor = new URL(request.url).searchParams.get('cursor');
      requestedCursors.push(cursor);
      const index = cursor === null ? 0 : Number(cursor.replace('page-', ''));
      return HttpResponse.json(pages[index]);
    }),
  );
  return requestedCursors;
}

function jobLinks(): HTMLElement[] {
  // Only the job rows: the header also has links ("Nuevo análisis").
  const list = screen.getByRole('list');
  return within(list).getAllByRole('link');
}

describe('JobListPage', () => {
  beforeEach(() => {
    setPassword('clave-correcta');
  });

  it('shows the jobs in the order the API returns them (newest first)', async () => {
    serveJobPages([
      { jobs: [makeJob(3), makeJob(2), makeJob(1)], nextCursor: null },
    ]);
    renderJobList();

    await screen.findByText('Análisis 3');
    const names = jobLinks().map(
      (link) => link.querySelector('.job-list__name')?.textContent,
    );
    expect(names).toEqual(['Análisis 3', 'Análisis 2', 'Análisis 1']);
  });

  it('shows the name, the Costa Rica date and the status of each job', async () => {
    const job = makeJob(1);
    serveJobPages([{ jobs: [job], nextCursor: null }]);
    renderJobList();

    const link = await screen.findByRole('link', { name: /Análisis 1/ });
    expect(link).toHaveTextContent(formatDateTime(job.createdAt));
    expect(link).toHaveTextContent('Completado');
  });

  it('"Cargar más" adds the next 20 jobs and disappears on the last page', async () => {
    const requestedCursors = serveJobPages([
      { jobs: makeJobs(1, 20), nextCursor: 'page-1' },
      { jobs: makeJobs(21, 23), nextCursor: null },
    ]);
    renderJobList();
    const user = userEvent.setup();

    await screen.findByText('Análisis 20');
    expect(jobLinks()).toHaveLength(20);

    await user.click(screen.getByRole('button', { name: 'Cargar más' }));

    expect(await screen.findByText('Análisis 23')).toBeInTheDocument();
    expect(jobLinks()).toHaveLength(23);
    // The first 20 are still there, before the new ones.
    expect(jobLinks()[0]).toHaveTextContent('Análisis 1');
    expect(requestedCursors).toEqual([null, 'page-1']);
    expect(
      screen.queryByRole('button', { name: 'Cargar más' }),
    ).not.toBeInTheDocument();
  });

  it('does not show "Cargar más" when there is only one page', async () => {
    serveJobPages([{ jobs: [makeJob(1)], nextCursor: null }]);
    renderJobList();

    await screen.findByText('Análisis 1');
    expect(
      screen.queryByRole('button', { name: 'Cargar más' }),
    ).not.toBeInTheDocument();
  });

  it('shows the findings count only for completed jobs', async () => {
    const completed: JobSummary = { ...makeJob(1), findingsCount: 3 };
    const single: JobSummary = { ...makeJob(2), findingsCount: 1 };
    const processing: JobSummary = {
      id: '00000000-0000-4000-8000-000000000099',
      name: 'En proceso',
      status: 'PROCESSING',
      createdAt: '2026-11-04T12:00:00.000Z',
    };
    serveJobPages([
      { jobs: [completed, single, processing], nextCursor: null },
    ]);
    renderJobList();

    expect(
      await screen.findByRole('link', { name: /Análisis 1/ }),
    ).toHaveTextContent('3 hallazgos');
    expect(screen.getByRole('link', { name: /Análisis 2/ })).toHaveTextContent(
      '1 hallazgo',
    );
    const processingLink = screen.getByRole('link', { name: /En proceso/ });
    expect(processingLink).toHaveTextContent('Analizando');
    expect(processingLink).not.toHaveTextContent('hallazgo');
  });

  it('invites the user to create the first analysis when there are none', async () => {
    serveJobPages([{ jobs: [], nextCursor: null }]);
    renderJobList();

    expect(
      await screen.findByText('Todavía no hay análisis.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Crear el primer análisis' }),
    ).toHaveAttribute('href', '/jobs/new');
  });

  it('opens the job page when a job is clicked', async () => {
    const job = makeJob(1);
    serveJobPages([{ jobs: [job], nextCursor: null }]);
    renderJobList();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('link', { name: /Análisis 1/ }));

    // The job page shows the id from the address.
    expect(await screen.findByText(`Análisis ${job.id}`)).toBeInTheDocument();
  });

  it('shows an error with "Reintentar", which loads the list again', async () => {
    let requests = 0;
    server.use(
      http.get('/api/jobs', () => {
        requests += 1;
        if (requests === 1) {
          return HttpResponse.json({ error: 'Falló' }, { status: 500 });
        }
        const body: ListJobsResponse = { jobs: [makeJob(1)], nextCursor: null };
        return HttpResponse.json(body);
      }),
    );
    renderJobList();
    const user = userEvent.setup();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudieron cargar los análisis. Intente de nuevo.',
    );

    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByText('Análisis 1')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(requests).toBe(2);
  });

  it('keeps the loaded jobs when "Cargar más" fails and lets the user retry', async () => {
    let nextPageRequests = 0;
    server.use(
      http.get('/api/jobs', ({ request }) => {
        const cursor = new URL(request.url).searchParams.get('cursor');
        if (cursor === null) {
          const body: ListJobsResponse = {
            jobs: makeJobs(1, 20),
            nextCursor: 'page-1',
          };
          return HttpResponse.json(body);
        }
        nextPageRequests += 1;
        if (nextPageRequests === 1) {
          return HttpResponse.json({ error: 'Falló' }, { status: 500 });
        }
        const body: ListJobsResponse = {
          jobs: [makeJob(21)],
          nextCursor: null,
        };
        return HttpResponse.json(body);
      }),
    );
    renderJobList();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Cargar más' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudieron cargar más análisis. Intente de nuevo.',
    );
    expect(jobLinks()).toHaveLength(20);

    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByText('Análisis 21')).toBeInTheDocument();
    expect(jobLinks()).toHaveLength(21);
  });
});
