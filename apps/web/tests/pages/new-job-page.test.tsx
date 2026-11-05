import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MAX_FILE_SIZE_BYTES } from '@gaceta/shared';
import type { CreateJobRequestInput } from '@gaceta/shared';

import { setPassword } from '../../src/api';
import { UPLOAD_LINK_LIFETIME_MS } from '../../src/lib/upload-link';
import { FAKE_UPLOAD_URL, PENDING_JOB } from '../msw/fixtures';
import { s3Response } from '../msw/handlers';
import { server } from '../msw/server';
import { renderApp } from '../render-app';

/**
 * Renders the whole app at /jobs/new, so a finished upload really navigates
 * and the test can check the address.
 */
function renderNewJobPage() {
  const result = renderApp('/jobs/new');
  // `applyAccept: false` lets tests choose a non-PDF file, which a user can
  // also do with "All files" in the file dialog.
  const user = userEvent.setup({ applyAccept: false });
  return { ...result, user };
}

/** Waits until the app shows the page of the job created by the default handler. */
async function expectJobPageOpened(
  router: ReturnType<typeof renderApp>['router'],
) {
  await waitFor(() => {
    expect(router.state.location.pathname).toBe(`/jobs/${PENDING_JOB.id}`);
  });
}

/** A small fake file. `size` is faked so no test allocates 100 MB. */
function fakeFile(name: string, type: string, size?: number): File {
  const file = new File(['%PDF-1.7 fake'], name, { type });
  if (size !== undefined) {
    Object.defineProperty(file, 'size', { value: size });
  }
  return file;
}

const PDF = fakeFile('gaceta-2026-11-05.pdf', 'application/pdf');

/** Records every `POST /api/jobs` body and answers with the default handler's job. */
function recordCreateJobRequests(): CreateJobRequestInput[] {
  const bodies: CreateJobRequestInput[] = [];
  server.events.on('request:start', ({ request }) => {
    if (request.method === 'POST' && request.url.endsWith('/api/jobs')) {
      void request
        .clone()
        .json()
        .then((body) => bodies.push(body as CreateJobRequestInput));
    }
  });
  return bodies;
}

/** Counts the uploads to the fake S3 bucket (not the CORS preflights). */
function countUploads(): { count: number } {
  const uploads = { count: 0 };
  server.events.on('request:start', ({ request }) => {
    if (request.method === 'POST' && request.url.startsWith(FAKE_UPLOAD_URL)) {
      uploads.count += 1;
    }
  });
  return uploads;
}

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(
    screen.getByLabelText('¿Qué desea buscar?'),
    'impuestos, aranceles',
  );
  await user.upload(screen.getByLabelText('Archivo PDF'), PDF);
}

function analyzeButton(): HTMLElement {
  return screen.getByRole('button', { name: 'Analizar' });
}

describe('NewJobPage', () => {
  beforeEach(() => {
    setPassword('clave-correcta');
  });

  afterEach(() => {
    server.events.removeAllListeners();
    vi.restoreAllMocks();
  });

  it('keeps "Analizar" disabled until the query and the file are valid', async () => {
    const { user } = renderNewJobPage();
    expect(analyzeButton()).toBeDisabled();

    await user.type(screen.getByLabelText('¿Qué desea buscar?'), 'ab');
    await user.tab();
    expect(
      screen.getByText('La búsqueda debe tener al menos 3 caracteres'),
    ).toBeInTheDocument();
    expect(analyzeButton()).toBeDisabled();

    await user.type(screen.getByLabelText('¿Qué desea buscar?'), 'c');
    expect(analyzeButton()).toBeDisabled(); // still no file

    await user.upload(screen.getByLabelText('Archivo PDF'), PDF);
    expect(analyzeButton()).toBeEnabled();
  });

  it('shows both query styles in the placeholder', () => {
    renderNewJobPage();

    const placeholder =
      screen.getByLabelText('¿Qué desea buscar?').getAttribute('placeholder') ??
      '';
    expect(placeholder).toContain('impuestos, aranceles');
    expect(placeholder).toContain(
      'cambios en tarifas de importación de alimentos',
    );
  });

  it.each([
    [
      'a file that is not a PDF',
      fakeFile('foto.png', 'image/png'),
      'El archivo debe ser un PDF',
    ],
    [
      'a PDF over 100 MB',
      fakeFile('grande.pdf', 'application/pdf', MAX_FILE_SIZE_BYTES + 1),
      'El archivo puede pesar como máximo 100 MB',
    ],
  ])(
    'explains why %s cannot be analyzed and uploads nothing',
    async (_, file, message) => {
      const createRequests = recordCreateJobRequests();
      const uploads = countUploads();
      const { user } = renderNewJobPage();
      await user.type(
        screen.getByLabelText('¿Qué desea buscar?'),
        'impuestos, aranceles',
      );

      await user.upload(screen.getByLabelText('Archivo PDF'), file);

      expect(screen.getByText(message)).toBeInTheDocument();
      expect(screen.getByLabelText('Archivo PDF')).toHaveAttribute(
        'aria-invalid',
        'true',
      );
      expect(analyzeButton()).toBeDisabled();
      await user.click(analyzeButton());
      expect(createRequests).toHaveLength(0);
      expect(uploads.count).toBe(0);
    },
  );

  it('keeps "Configuración avanzada" closed, with 5 pages per block by default', async () => {
    const { user } = renderNewJobPage();
    const toggle = screen.getByRole('button', {
      name: 'Configuración avanzada',
    });

    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(
      screen.queryByLabelText('Páginas por bloque'),
    ).not.toBeInTheDocument();

    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText('Páginas por bloque')).toHaveValue(5);
    expect(
      screen.getByText(/Bloques más grandes hacen menos llamadas a la IA/),
    ).toBeInTheDocument();
  });

  it.each([
    ['1', 'Las páginas por bloque deben ser al menos 2'],
    ['2.5', 'Las páginas por bloque deben ser un número entero'],
  ])('rejects %s pages per block', async (pagesPerBlock, message) => {
    const { user } = renderNewJobPage();
    await fillValidForm(user);
    await user.click(
      screen.getByRole('button', { name: 'Configuración avanzada' }),
    );

    const input = screen.getByLabelText('Páginas por bloque');
    await user.clear(input);
    await user.type(input, pagesPerBlock);

    expect(screen.getByText(message)).toBeInTheDocument();
    expect(analyzeButton()).toBeDisabled();
  });

  it('sends the chosen pages per block', async () => {
    const createRequests = recordCreateJobRequests();
    const { user, router } = renderNewJobPage();
    await fillValidForm(user);
    await user.click(
      screen.getByRole('button', { name: 'Configuración avanzada' }),
    );
    const input = screen.getByLabelText('Páginas por bloque');
    await user.clear(input);
    await user.type(input, '12');

    await user.click(analyzeButton());

    await expectJobPageOpened(router);
    expect(createRequests[0]?.pagesPerBlock).toBe(12);
  });

  it('shows a progress bar while the PDF is uploading', async () => {
    // The fake S3 waits until the test lets it answer.
    let finishUpload: () => void = () => undefined;
    const uploadCanFinish = new Promise<void>((resolve) => {
      finishUpload = resolve;
    });
    server.use(
      http.post(FAKE_UPLOAD_URL, async () => {
        await uploadCanFinish;
        return s3Response(204);
      }),
    );
    const { user, router } = renderNewJobPage();
    await fillValidForm(user);

    await user.click(analyzeButton());

    expect(
      await screen.findByRole('progressbar', { name: 'Subiendo el PDF…' }),
    ).toBeInTheDocument();
    // The form is locked while the job exists, so nothing can change under it.
    expect(screen.getByLabelText('¿Qué desea buscar?')).toBeDisabled();

    finishUpload();
    await expectJobPageOpened(router);
  });

  it('opens the job page after a successful upload', async () => {
    const { user, router } = renderNewJobPage();
    await fillValidForm(user);

    await user.click(analyzeButton());

    // The job page shows the id from the address /jobs/<id>.
    await expectJobPageOpened(router);
  });

  it('leaves the name out when it is empty, so the API uses the file name', async () => {
    const createRequests = recordCreateJobRequests();
    const { user, router } = renderNewJobPage();
    await fillValidForm(user);

    await user.click(analyzeButton());

    await expectJobPageOpened(router);
    expect(createRequests).toEqual([
      {
        query: 'impuestos, aranceles',
        fileName: PDF.name,
        fileSize: PDF.size,
        pagesPerBlock: 5,
      },
    ]);
  });

  it('retries a failed upload for the same job, without creating another one', async () => {
    const createRequests = recordCreateJobRequests();
    const uploads = countUploads();
    let failNextUpload = true;
    server.use(
      http.post(FAKE_UPLOAD_URL, () => {
        if (failNextUpload) {
          failNextUpload = false;
          return s3Response(500);
        }
        return s3Response(204);
      }),
    );
    const { user, router } = renderNewJobPage();
    await fillValidForm(user);

    await user.click(analyzeButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo subir el PDF.',
    );

    await user.click(screen.getByRole('button', { name: 'Reintentar subida' }));

    await expectJobPageOpened(router);
    expect(createRequests).toHaveLength(1);
    expect(uploads.count).toBe(2);
  });

  it('asks to start over when the upload link expired (15 minutes)', async () => {
    const createdAt = Date.UTC(2026, 10, 5, 12, 0);
    let now = createdAt;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    server.use(
      http.post(FAKE_UPLOAD_URL, () => {
        // The user came back after more than 15 minutes.
        now = createdAt + UPLOAD_LINK_LIFETIME_MS + 1;
        return s3Response(403);
      }),
    );
    const { user } = renderNewJobPage();
    await fillValidForm(user);

    await user.click(analyzeButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'el permiso para subir el PDF venció',
    );
    expect(
      screen.queryByRole('button', { name: 'Reintentar subida' }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Empezar de nuevo' }));

    expect(analyzeButton()).toBeEnabled();
    expect(screen.getByLabelText('¿Qué desea buscar?')).toHaveValue(
      'impuestos, aranceles',
    );
  });

  it('shows the API message when the job cannot be created', async () => {
    server.use(
      http.post('/api/jobs', () =>
        HttpResponse.json(
          { error: 'La búsqueda debe tener al menos 3 caracteres' },
          { status: 400 },
        ),
      ),
    );
    const uploads = countUploads();
    const { user } = renderNewJobPage();
    await fillValidForm(user);

    await user.click(analyzeButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'La búsqueda debe tener al menos 3 caracteres',
    );
    expect(uploads.count).toBe(0);
    // Nothing was created, so the user can try again.
    expect(analyzeButton()).toBeEnabled();
  });

  it('creates only one job when "Analizar" is clicked twice', async () => {
    const createRequests = recordCreateJobRequests();
    const { user, router } = renderNewJobPage();
    await fillValidForm(user);

    await user.dblClick(analyzeButton());

    await expectJobPageOpened(router);
    expect(createRequests).toHaveLength(1);
  });
});
