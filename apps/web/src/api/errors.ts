// Errors thrown by the API client, so pages can tell them apart with `instanceof`.

/**
 * The password is missing or wrong: API Gateway answered 401 (no header) or the
 * authorizer answered 403 (wrong password). The app treats both the same way: it
 * deletes the stored password and goes to the login page (docs/architecture.md →
 * "API contract").
 */
export class UnauthorizedError extends Error {
  constructor() {
    super('La contraseña no es válida o ya no está guardada');
    this.name = 'UnauthorizedError';
  }
}

/**
 * Any other failure. `message` is in Spanish and can be shown to the user as it
 * is: it comes from the API's `{ "error": "…" }` body when there is one.
 */
export class ApiError extends Error {
  /** HTTP status, or 0 when there was no response (for example, no internet). */
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/** Messages shown when the response does not include one. */
export const API_ERROR_MESSAGES = {
  network:
    'No se pudo conectar con el servidor. Revise su conexión a internet.',
  unexpected: 'Ocurrió un error inesperado. Intente de nuevo más tarde.',
  upload: 'No se pudo subir el PDF. Intente de nuevo.',
} as const;
