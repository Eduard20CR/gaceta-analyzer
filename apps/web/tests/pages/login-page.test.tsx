import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';

import { getPassword } from '../../src/api';
import { server } from '../msw/server';
import { renderApp } from '../render-app';

const PASSWORD = 'clave-correcta';

async function typePasswordAndSubmit(password: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Contraseña'), password);
  await user.click(screen.getByRole('button', { name: 'Entrar' }));
}

describe('LoginPage', () => {
  it('asks for the password in a password field', () => {
    renderApp('/login');

    expect(
      screen.getByRole('heading', { name: 'Iniciar sesión' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Contraseña')).toHaveAttribute(
      'type',
      'password',
    );
    // Nothing to send yet.
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeDisabled();
  });

  it('stores a correct password and opens the job list', async () => {
    let sentAuthorization: string | null = null;
    server.use(
      http.get('/api/auth/check', ({ request }) => {
        sentAuthorization = request.headers.get('Authorization');
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { router } = renderApp('/login');

    await typePasswordAndSubmit(PASSWORD);

    expect(
      await screen.findByRole('heading', { name: 'Análisis' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
    expect(getPassword()).toBe(PASSWORD);
    expect(sentAuthorization).toBe(`Bearer ${PASSWORD}`);
  });

  it.each([401, 403])(
    'shows "Contraseña incorrecta" and stores nothing on a %i',
    async (status) => {
      server.use(
        http.get('/api/auth/check', () => new HttpResponse(null, { status })),
      );
      const { router } = renderApp('/login');

      await typePasswordAndSubmit('clave-incorrecta');

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Contraseña incorrecta',
      );
      expect(getPassword()).toBeNull();
      expect(router.state.location.pathname).toBe('/login');
      // The user can try again right away.
      expect(screen.getByRole('button', { name: 'Entrar' })).toBeEnabled();
    },
  );

  it('asks to try again when the server cannot be reached', async () => {
    server.use(http.get('/api/auth/check', () => HttpResponse.error()));
    renderApp('/login');

    await typePasswordAndSubmit(PASSWORD);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo comprobar la contraseña. Revise su conexión a internet e intente de nuevo.',
    );
    expect(getPassword()).toBeNull();
  });

  it('checks the password only once when "Entrar" is clicked twice', async () => {
    let checks = 0;
    server.use(
      http.get('/api/auth/check', () => {
        checks += 1;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderApp('/login');
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Contraseña'), PASSWORD);

    await user.dblClick(screen.getByRole('button', { name: 'Entrar' }));

    expect(
      await screen.findByRole('heading', { name: 'Análisis' }),
    ).toBeInTheDocument();
    expect(checks).toBe(1);
  });

  it('does not show "Cerrar sesión" on the login page', () => {
    renderApp('/login');

    expect(
      screen.queryByRole('button', { name: 'Cerrar sesión' }),
    ).not.toBeInTheDocument();
  });
});
