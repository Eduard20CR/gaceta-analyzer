import { MutationObserver } from '@tanstack/react-query';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';

import { createJob, getPassword, listJobs, setPassword } from '../src/api';
import { pathAfterLogin } from '../src/auth';
import { COMPLETED_JOB } from './msw/fixtures';
import { server } from './msw/server';
import { renderApp } from './render-app';

const PASSWORD = 'clave-correcta';

async function logIn(password = PASSWORD) {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText('Contraseña'), password);
  await user.click(screen.getByRole('button', { name: 'Entrar' }));
}

/** The job page at /jobs/abc: the default handler returns COMPLETED_JOB for any id. */
function findJobHeading() {
  return screen.findByRole('heading', { name: COMPLETED_JOB.name });
}

function expectLoginPage() {
  return screen.findByRole('heading', { name: 'Iniciar sesión' });
}

describe('route guard', () => {
  it.each(['/', '/jobs/new', '/jobs/abc', '/no-existe'])(
    'sends %s to the login page when no password is stored',
    async (route) => {
      const { router } = renderApp(route);

      expect(await expectLoginPage()).toBeInTheDocument();
      expect(router.state.location.pathname).toBe('/login');
    },
  );

  it('goes back to the page the user wanted after logging in', async () => {
    const { router } = renderApp('/jobs/abc');
    await expectLoginPage();

    await logIn();

    expect(await findJobHeading()).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/jobs/abc');
  });

  it('does not ask again once the password is stored (for example after a reload)', async () => {
    const firstVisit = renderApp('/');
    await logIn();
    await screen.findByRole('heading', { name: 'Análisis' });
    firstVisit.unmount();

    // A reload starts the app again from scratch; only localStorage survives.
    const { router } = renderApp('/');

    expect(
      screen.getByRole('heading', { name: 'Análisis' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
    expect(getPassword()).toBe(PASSWORD);
  });
});

describe('401 or 403 from any API call', () => {
  it.each([401, 403])(
    'a query that gets %i clears the password and opens the login page',
    async (status) => {
      setPassword('clave-vieja');
      server.use(
        http.get('/api/jobs', () => new HttpResponse(null, { status })),
      );
      const { router, queryClient } = renderApp('/jobs/abc');
      expect(await findJobHeading()).toBeInTheDocument();

      await expect(
        queryClient.fetchQuery({
          queryKey: ['jobs'],
          queryFn: () => listJobs(),
        }),
      ).rejects.toThrow();

      expect(await expectLoginPage()).toBeInTheDocument();
      expect(getPassword()).toBeNull();
      expect(router.state.location.pathname).toBe('/login');
    },
  );

  it('a mutation that gets 403 clears the password and opens the login page', async () => {
    setPassword('clave-vieja');
    server.use(
      http.post('/api/jobs', () => new HttpResponse(null, { status: 403 })),
    );
    const { queryClient } = renderApp('/jobs/new');
    const observer = new MutationObserver(queryClient, {
      mutationFn: () =>
        createJob({
          query: 'impuestos',
          fileName: 'gaceta.pdf',
          fileSize: 1000,
        }),
    });

    await expect(observer.mutate()).rejects.toThrow();

    expect(await expectLoginPage()).toBeInTheDocument();
    expect(getPassword()).toBeNull();
  });

  it('returns to the same page after logging in again', async () => {
    setPassword('clave-vieja');
    server.use(
      http.get('/api/jobs', () => new HttpResponse(null, { status: 403 })),
    );
    const { router, queryClient } = renderApp('/jobs/abc');
    await expect(
      queryClient.fetchQuery({ queryKey: ['jobs'], queryFn: () => listJobs() }),
    ).rejects.toThrow();
    await expectLoginPage();

    await logIn();

    expect(await findJobHeading()).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/jobs/abc');
    expect(getPassword()).toBe(PASSWORD);
  });

  it('other errors do not log the user out', async () => {
    setPassword(PASSWORD);
    server.use(
      http.get('/api/jobs', () =>
        HttpResponse.json({ error: 'Algo falló' }, { status: 500 }),
      ),
    );
    const { router, queryClient } = renderApp('/');

    await expect(
      queryClient.fetchQuery({
        queryKey: ['jobs'],
        queryFn: () => listJobs(),
        retry: false,
      }),
    ).rejects.toThrow('Algo falló');

    expect(getPassword()).toBe(PASSWORD);
    expect(router.state.location.pathname).toBe('/');
  });
});

describe('"Cerrar sesión"', () => {
  it('clears the password and the cached data, then opens the login page', async () => {
    setPassword(PASSWORD);
    const { router, queryClient } = renderApp('/');
    await queryClient.fetchQuery({
      queryKey: ['jobs'],
      queryFn: () => listJobs(),
    });
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Cerrar sesión' }));

    expect(await expectLoginPage()).toBeInTheDocument();
    expect(getPassword()).toBeNull();
    expect(router.state.location.pathname).toBe('/login');
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });
});

describe('pathAfterLogin', () => {
  it.each([
    [{ from: '/jobs/abc?x=1' }, '/jobs/abc?x=1'],
    [null, '/'],
    [undefined, '/'],
    ['/jobs/abc', '/'],
    [{ from: 42 }, '/'],
    [{ from: '/login' }, '/'],
    [{ from: '//example.com' }, '/'],
    [{ from: 'https://example.com' }, '/'],
  ])('%j → %s', (state, expected) => {
    expect(pathAfterLogin(state)).toBe(expected);
  });
});
