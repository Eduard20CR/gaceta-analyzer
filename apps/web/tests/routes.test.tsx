import { screen } from '@testing-library/react';
import { useRoutes } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';

import { setPassword } from '../src/api';

import { routes } from '../src/routes';
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
    ['/jobs/abc', 'Detalle del análisis'],
    ['/no-existe', 'Página no encontrada'],
  ])('%s shows "%s"', (route, heading) => {
    renderWithProviders(<AppRoutes />, { route });

    expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
  });

  it('passes the job id from the address to the detail page', () => {
    renderWithProviders(<AppRoutes />, { route: '/jobs/abc' });

    expect(screen.getByText('Análisis abc')).toBeInTheDocument();
  });
});
