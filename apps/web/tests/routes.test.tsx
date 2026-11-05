import { screen } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { useRoutes } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';

import type { GetJobResponse } from '@gaceta/shared';

import { setPassword } from '../src/api';

import { routes } from '../src/routes';
import { COMPLETED_JOB } from './msw/fixtures';
import { server } from './msw/server';
import { renderWithProviders } from './render-app';

/** The app's real route table, rendered inside the test router. */
function AppRoutes() {
  return useRoutes(routes);
}

describe('routes', () => {
  // Every page except /login needs a stored password (RequireAuth).
  beforeEach(() => {
    setPassword('clave-correcta');
  });

  it.each([
    ['/login', 'Iniciar sesión'],
    ['/', 'Análisis'],
    ['/jobs/new', 'Nuevo análisis'],
    ['/no-existe', 'Página no encontrada'],
  ])('%s shows "%s"', (route, heading) => {
    renderWithProviders(<AppRoutes />, { route });

    expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
  });

  it('passes the job id from the address to the detail page', async () => {
    let requestedId: string | undefined;
    server.use(
      http.get('/api/jobs/:id', ({ params }) => {
        requestedId = String(params['id']);
        const body: GetJobResponse = {
          job: COMPLETED_JOB,
          findings: [],
          pdfUrl: null,
        };
        return HttpResponse.json(body);
      }),
    );
    renderWithProviders(<AppRoutes />, { route: '/jobs/abc' });

    expect(
      await screen.findByRole('heading', { name: COMPLETED_JOB.name }),
    ).toBeInTheDocument();
    expect(requestedId).toBe('abc');
  });
});
