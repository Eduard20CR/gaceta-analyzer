// Body of every error a handler returns (docs/architecture.md → "API contract").

export interface ErrorResponse {
  /** In Spanish, so the web app can show it to the user as it is. */
  error: string;
}
