import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router';

import { ApiError, UnauthorizedError, checkAuth, setPassword } from '../api';
import { pathAfterLogin } from '../auth';
import { Button } from '../components/Button';
import { ErrorMessage } from '../components/ErrorMessage';

/** Shown when the API says the password is wrong (FR-01). */
export const WRONG_PASSWORD_MESSAGE = 'Contraseña incorrecta';

/** Shown when the server could not be reached, so the password was not checked. */
export const LOGIN_NETWORK_ERROR_MESSAGE =
  'No se pudo comprobar la contraseña. Revise su conexión a internet e intente de nuevo.';

/**
 * Login page (FR-01). The password is checked with `GET /api/auth/check`
 * before it is stored, so a wrong password is never saved on the device.
 */
export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const [password, setPasswordInput] = useState('');
  const [isChecking, setIsChecking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // A ref, unlike state, changes immediately, so a fast double click cannot
  // start a second check before the page re-renders with the disabled button.
  const isCheckingRef = useRef(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    // Stop the browser from reloading the page, which is what a form does by default.
    event.preventDefault();
    if (isCheckingRef.current) {
      return;
    }

    isCheckingRef.current = true;
    setIsChecking(true);
    setErrorMessage(null);
    try {
      await checkAuth(password);
      setPassword(password);
      await navigate(pathAfterLogin(location.state), { replace: true });
    } catch (error) {
      setErrorMessage(messageForLoginError(error));
      isCheckingRef.current = false;
      setIsChecking(false);
    }
  }

  const canSubmit = password !== '' && !isChecking;

  return (
    <section className="login card">
      <h1>Iniciar sesión</h1>
      <form
        className="login__form"
        onSubmit={(event) => void handleSubmit(event)}
      >
        <label htmlFor="login-password" className="login__label">
          Contraseña
        </label>
        <input
          id="login-password"
          className="login__input"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPasswordInput(event.target.value)}
        />
        <Button type="submit" disabled={!canSubmit}>
          {isChecking ? 'Comprobando…' : 'Entrar'}
        </Button>
      </form>
      {errorMessage !== null && <ErrorMessage message={errorMessage} />}
    </section>
  );
}

/** The Spanish message for an error of `checkAuth`. */
function messageForLoginError(error: unknown): string {
  if (error instanceof UnauthorizedError) {
    return WRONG_PASSWORD_MESSAGE;
  }
  // Status 0 means there was no response at all (offline, DNS, …).
  if (error instanceof ApiError && error.status === 0) {
    return LOGIN_NETWORK_ERROR_MESSAGE;
  }
  if (error instanceof ApiError) {
    // The API's own Spanish message, which already says what to do.
    return error.message;
  }
  return LOGIN_NETWORK_ERROR_MESSAGE;
}
