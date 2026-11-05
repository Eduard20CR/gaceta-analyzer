// Where the web app keeps the app password between visits (FR-01, ADR-0006).
//
// It is stored in the browser's localStorage under the key below, so the user
// does not have to type it again every time. The API client reads it to send
// `Authorization: Bearer <password>` and the app deletes it on 401/403.

/** localStorage key that holds the password. */
export const PASSWORD_STORAGE_KEY = 'gaceta-analyzer.password';

/** The stored password, or `null` if the user has not logged in. */
export function getPassword(): string | null {
  return localStorage.getItem(PASSWORD_STORAGE_KEY);
}

export function setPassword(password: string): void {
  localStorage.setItem(PASSWORD_STORAGE_KEY, password);
}

export function clearPassword(): void {
  localStorage.removeItem(PASSWORD_STORAGE_KEY);
}
