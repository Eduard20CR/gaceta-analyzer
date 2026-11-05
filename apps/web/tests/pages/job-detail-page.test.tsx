import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { useRoutes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { POLLING_INTERVAL_MS } from '@gaceta/shared';
import type { Finding, GetJobResponse, Job } from '@gaceta/shared';

import { setPassword } from '../../src/api';
import { formatDateTime } from '../../src/lib/format-date';
import { routes } from '../../src/routes';
import { COMPLETED_JOB, FAKE_PDF_URL } from '../msw/fixtures';
import { server } from '../msw/server';
import { fakePdf } from '../react-pdf-mock';
import { renderWithProviders } from '../render-app';

/** The app's real route table (layout, login guard and pages). */
function AppRoutes() {
  return useRoutes(routes);
}

const JOB_ID = COMPLETED_JOB.id;
const JOB_PATH = `/jobs/${JOB_ID}`;

function renderJobPage() {
  return renderWithProviders(<AppRoutes />, { route: JOB_PATH });
}

/** The same job while it is being analyzed: no results yet. */
const PROCESSING_JOB: Job = {
  id: COMPLETED_JOB.id,
  createdAt: COMPLETED_JOB.createdAt,
  updatedAt: COMPLETED_JOB.createdAt,
  name: COMPLETED_JOB.name,
  query: COMPLETED_JOB.query,
  pagesPerBlock: COMPLETED_JOB.pagesPerBlock,
  fileName: COMPLETED_JOB.fileName,
  fileSize: COMPLETED_JOB.fileSize,
  pdfKey: COMPLETED_JOB.pdfKey,
  status: 'PROCESSING',
};

const FINDINGS: Finding[] = [
  {
    page: 30,
    topic: 'Impuestos',
    quote: 'Se crea un impuesto a los vehículos eléctricos',
    reason: 'Crea un impuesto nuevo',
    relevance: 'medium',
    verification: 'page_corrected',
  },
  {
    page: 14,
    topic: 'Aranceles',
    quote: 'Se modifica el arancel de importación del arroz',
    reason: 'Cambia un arancel de importación',
    relevance: 'high',
    verification: 'verified',
  },
  {
    page: 52,
    topic: 'Aranceles',
    quote: 'Texto que la IA citó mal',
    reason: 'Menciona aranceles',
    relevance: 'low',
    verification: 'not_found',
  },
];

/**
 * Answers GET /api/jobs/:id with each response in turn (the last one is
 * repeated) and counts the requests.
 */
function serveJob(...responses: GetJobResponse[]): { count: number } {
  const requests = { count: 0 };
  server.use(
    http.get('/api/jobs/:id', () => {
      const index = Math.min(requests.count, responses.length - 1);
      requests.count += 1;
      return HttpResponse.json(responses[index]);
    }),
  );
  return requests;
}

function completed(
  findings: Finding[] = FINDINGS,
  job: Partial<Job> = {},
): GetJobResponse {
  return {
    job: { ...COMPLETED_JOB, ...job },
    findings,
    pdfUrl: FAKE_PDF_URL,
  };
}

function findingsList(): HTMLElement {
  return screen.getByRole('list');
}

describe('JobDetailPage', () => {
  beforeEach(() => {
    setPassword('clave-correcta');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the name, query, pages per block, date and status', async () => {
    serveJob(completed());
    renderJobPage();

    expect(
      await screen.findByRole('heading', { name: COMPLETED_JOB.name }),
    ).toBeInTheDocument();
    expect(screen.getByText(COMPLETED_JOB.query)).toBeInTheDocument();
    expect(
      screen.getByText('Páginas por bloque').nextSibling,
    ).toHaveTextContent('5');
    expect(
      screen.getByText(formatDateTime(COMPLETED_JOB.createdAt)),
    ).toBeInTheDocument();
    expect(screen.getByText('Completado')).toBeInTheDocument();
  });

  it('polls every 4 seconds while processing and stops when completed', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const requests = serveJob(
      { job: PROCESSING_JOB, pdfUrl: FAKE_PDF_URL },
      { job: PROCESSING_JOB, pdfUrl: FAKE_PDF_URL },
      completed(),
    );
    renderJobPage();

    expect(
      await screen.findByText('Analizando el documento…'),
    ).toBeInTheDocument();
    expect(requests.count).toBe(1);

    await act(() => vi.advanceTimersByTimeAsync(POLLING_INTERVAL_MS));
    expect(requests.count).toBe(2);
    expect(screen.getByText('Analizando el documento…')).toBeInTheDocument();

    await act(() => vi.advanceTimersByTimeAsync(POLLING_INTERVAL_MS));
    expect(await screen.findByText('Resumen')).toBeInTheDocument();
    expect(requests.count).toBe(3);

    // Finished: no more requests, however long the page stays open.
    await act(() => vi.advanceTimersByTimeAsync(POLLING_INTERVAL_MS * 5));
    expect(requests.count).toBe(3);
  });

  it('shows "Analizando el documento…" without a block counter', async () => {
    serveJob({ job: PROCESSING_JOB, pdfUrl: FAKE_PDF_URL });
    renderJobPage();

    expect(
      await screen.findByText('Analizando el documento…'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.queryByText(/bloque \d+ de/i)).not.toBeInTheDocument();
  });

  it('waits for the upload while the job is pending', async () => {
    serveJob({
      job: { ...PROCESSING_JOB, status: 'PENDING_UPLOAD' },
      pdfUrl: null,
    });
    renderJobPage();

    expect(
      await screen.findByText('Esperando que termine la subida…'),
    ).toBeInTheDocument();
  });

  it('shows the summary and every finding with all its fields, in page order', async () => {
    serveJob(completed());
    renderJobPage();

    expect(
      await screen.findByText('Se encontraron 3 hallazgos.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Páginas con relevancia alta o media: 14, 30.'),
    ).toBeInTheDocument();

    const cards = within(findingsList()).getAllByRole('article');
    expect(
      cards.map((card) => within(card).getByText(/^Página/).textContent),
    ).toEqual(['Página 14', 'Página 30', 'Página 52']);

    const first = cards[0];
    if (first === undefined) {
      throw new Error('Expected at least one finding card');
    }
    expect(first).toHaveTextContent('Aranceles');
    expect(first).toHaveTextContent('Relevancia: Alta');
    expect(first).toHaveTextContent(
      'Se modifica el arancel de importación del arroz',
    );
    expect(first).toHaveTextContent('Cambia un arancel de importación');
    expect(first).toHaveTextContent('Cita verificada en el documento');
  });

  it('warns on findings whose quote was not found', async () => {
    serveJob(completed());
    renderJobPage();

    const warning = await screen.findByText(
      /La cita no se encontró en el documento/,
    );
    const card = warning.closest('article');
    expect(card).toHaveTextContent('Página 52');
  });

  it('filters by relevance and shows a count per option', async () => {
    serveJob(completed());
    renderJobPage();
    const user = userEvent.setup();
    await screen.findByText('Resumen');
    const filter = screen.getByRole('group', {
      name: 'Filtrar por relevancia',
    });

    expect(
      within(filter).getByRole('button', { name: 'Todas (3)' }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      within(filter).getByRole('button', { name: 'Alta (1)' }),
    ).toBeInTheDocument();
    expect(
      within(filter).getByRole('button', { name: 'Media (1)' }),
    ).toBeInTheDocument();
    expect(
      within(filter).getByRole('button', { name: 'Baja (1)' }),
    ).toBeInTheDocument();

    await user.click(within(filter).getByRole('button', { name: 'Alta (1)' }));

    const cards = within(findingsList()).getAllByRole('article');
    expect(cards).toHaveLength(1);
    expect(cards[0]).toHaveTextContent('Página 14');

    await user.click(within(filter).getByRole('button', { name: 'Todas (3)' }));
    expect(within(findingsList()).getAllByRole('article')).toHaveLength(3);
  });

  it('lists the pages not analyzed only when some blocks failed', async () => {
    serveJob(completed(FINDINGS, { failedPages: [41, 42, 43] }));
    renderJobPage();

    expect(
      await screen.findByText(
        'No se pudieron analizar las páginas: 41, 42, 43.',
      ),
    ).toBeInTheDocument();
  });

  it('shows no failed pages notice when every block worked', async () => {
    serveJob(completed(FINDINGS, { failedPages: [] }));
    renderJobPage();

    await screen.findByText('Resumen');
    expect(
      screen.queryByText(/No se pudieron analizar las páginas/),
    ).not.toBeInTheDocument();
  });

  it('says so when a completed analysis found nothing', async () => {
    serveJob(completed([]));
    renderJobPage();

    expect(
      await screen.findByText(
        'No se encontraron citas relacionadas con su búsqueda.',
      ),
    ).toBeInTheDocument();
  });

  it('shows the Spanish error message of a failed job', async () => {
    serveJob({
      job: {
        ...PROCESSING_JOB,
        status: 'FAILED',
        errorMessage: 'El análisis tardó demasiado',
      },
      pdfUrl: FAKE_PDF_URL,
    });
    renderJobPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El análisis tardó demasiado',
    );
    expect(
      screen.getByRole('link', { name: 'Crear un análisis nuevo' }),
    ).toHaveAttribute('href', '/jobs/new');
  });

  it('shows "El análisis no existe" for an unknown job', async () => {
    const requests = { count: 0 };
    server.use(
      http.get('/api/jobs/:id', () => {
        requests.count += 1;
        return HttpResponse.json(
          { error: 'El análisis no existe' },
          { status: 404 },
        );
      }),
    );
    renderJobPage();

    expect(
      await screen.findByRole('heading', { name: 'El análisis no existe' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Volver a la lista de análisis' }),
    ).toHaveAttribute('href', '/');
    expect(requests.count).toBe(1);
  });

  it('offers "Reintentar" when the job could not be loaded', async () => {
    let requests = 0;
    server.use(
      http.get('/api/jobs/:id', () => {
        requests += 1;
        if (requests === 1) {
          return HttpResponse.json({ error: 'Falló' }, { status: 500 });
        }
        return HttpResponse.json(completed());
      }),
    );
    renderJobPage();
    const user = userEvent.setup();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo cargar el análisis. Intente de nuevo.',
    );
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByText('Resumen')).toBeInTheDocument();
  });

  it('asks for the job of the address, so reloading shows the same job', async () => {
    let requestedId: string | undefined;
    server.use(
      http.get('/api/jobs/:id', ({ params }) => {
        requestedId = String(params['id']);
        return HttpResponse.json(completed());
      }),
    );

    // A reload is a fresh app at the same address.
    const first = renderJobPage();
    await screen.findByRole('heading', { name: COMPLETED_JOB.name });
    first.unmount();
    renderJobPage();

    expect(
      await screen.findByRole('heading', { name: COMPLETED_JOB.name }),
    ).toBeInTheDocument();
    expect(requestedId).toBe(JOB_ID);
  });
});

describe('JobDetailPage PDF viewer (FR-06)', () => {
  beforeEach(() => {
    setPassword('clave-correcta');
  });

  it('shows the PDF next to the findings, with a tab for each on phones', async () => {
    serveJob(completed());
    renderJobPage();

    expect(await screen.findByText('Página 1 del PDF')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Documento' }),
    ).toBeInTheDocument();
    // Tabs (only visible on narrow screens, styles.css); findings first.
    expect(screen.getByRole('tab', { name: 'Hallazgos' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tab', { name: 'Documento' })).toHaveAttribute(
      'aria-selected',
      'false',
    );
  });

  it('jumps to the page of a finding and opens the "Documento" tab', async () => {
    fakePdf.pageCount = 100;
    serveJob(completed());
    renderJobPage();
    const user = userEvent.setup();
    await screen.findByText('Página 1 del PDF');

    await user.click(screen.getByRole('button', { name: 'Ver página 30' }));

    expect(screen.getByText('Página 30 del PDF')).toBeInTheDocument();
    expect(screen.getByText('30 / 100')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Documento' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('renders only one page of a 500-page PDF', async () => {
    fakePdf.pageCount = 500;
    serveJob(completed());
    renderJobPage();

    await screen.findByText('Página 1 del PDF');
    expect(screen.getAllByTestId('pdf-page')).toHaveLength(1);
  });

  it('shows "El PDF ya no está disponible" and keeps the findings', async () => {
    serveJob({ ...completed(), pdfUrl: null });
    renderJobPage();

    expect(
      await screen.findByText('El PDF ya no está disponible'),
    ).toBeInTheDocument();
    expect(within(findingsList()).getAllByRole('article')).toHaveLength(3);
    expect(screen.queryByTestId('pdf-document')).not.toBeInTheDocument();
    // Nothing to jump to.
    expect(
      screen.queryByRole('button', { name: /^Ver página/ }),
    ).not.toBeInTheDocument();
  });

  it('asks for a fresh PDF link once when the PDF cannot be loaded', async () => {
    const expiredUrl = `${FAKE_PDF_URL}-expired`;
    const freshUrl = `${FAKE_PDF_URL}-fresh`;
    fakePdf.failingUrls.add(expiredUrl);
    const requests = serveJob(
      { ...completed(), pdfUrl: expiredUrl },
      { ...completed(), pdfUrl: freshUrl },
    );
    renderJobPage();

    expect(await screen.findByText('Página 1 del PDF')).toBeInTheDocument();
    expect(requests.count).toBe(2);
    expect(fakePdf.loadedUrls).toEqual([expiredUrl, freshUrl]);
  });

  it('shows an error when the fresh link fails too, after exactly one refetch', async () => {
    const firstUrl = `${FAKE_PDF_URL}-1`;
    const secondUrl = `${FAKE_PDF_URL}-2`;
    fakePdf.failingUrls.add(firstUrl);
    fakePdf.failingUrls.add(secondUrl);
    const requests = serveJob(
      { ...completed(), pdfUrl: firstUrl },
      { ...completed(), pdfUrl: secondUrl },
    );
    renderJobPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo cargar el PDF.',
    );
    expect(requests.count).toBe(2);
    // The findings are still there.
    expect(within(findingsList()).getAllByRole('article')).toHaveLength(3);
  });
});
