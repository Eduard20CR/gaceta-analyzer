import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRoutes } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';

import { setPassword } from '../../src/api';

import { Layout } from '../../src/components/Layout';
import { routes } from '../../src/routes';
import { renderWithProviders } from '../render-app';

/** The app's real route table, rendered inside the test router. */
function AppRoutes() {
  return useRoutes(routes);
}

describe('Layout', () => {
  // Every page except /login needs a stored password (RequireAuth).
  beforeEach(() => {
    setPassword('clave-correcta');
  });

  it('renders the header links and its children', () => {
    renderWithProviders(
      <Layout>
        <p>Contenido de la página</p>
      </Layout>,
    );

    expect(
      screen.getByRole('link', { name: 'Analizador de La Gaceta' }),
    ).toHaveAttribute('href', '/');
    expect(
      screen.getByRole('link', { name: 'Nuevo análisis' }),
    ).toHaveAttribute('href', '/jobs/new');
    expect(screen.getByRole('main')).toHaveTextContent(
      'Contenido de la página',
    );
  });

  it('shows the header actions, for example the logout button', () => {
    renderWithProviders(
      <Layout headerActions={<button type="button">Cerrar sesión</button>}>
        <p>Contenido</p>
      </Layout>,
    );

    expect(
      screen.getByRole('button', { name: 'Cerrar sesión' }),
    ).toBeInTheDocument();
  });

  it.each(['/login', '/', '/jobs/new', '/jobs/abc', '/no-existe'])(
    'wraps the page at %s',
    async (route) => {
      renderWithProviders(<AppRoutes />, { route });

      expect(screen.getByRole('banner')).toBeInTheDocument();
      // Some pages load their data first, so the heading can come a bit later.
      expect(screen.getByRole('main')).toContainElement(
        await screen.findByRole('heading', { level: 1 }),
      );
    },
  );

  it('goes to the new job page from the header link', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AppRoutes />, { route: '/' });

    await user.click(screen.getByRole('link', { name: 'Nuevo análisis' }));

    expect(
      screen.getByRole('heading', { name: 'Nuevo análisis' }),
    ).toBeInTheDocument();
  });
});
