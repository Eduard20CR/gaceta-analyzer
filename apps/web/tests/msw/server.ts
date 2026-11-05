// The fake network for the tests (ADR-0013). MSW intercepts `fetch` and
// `XMLHttpRequest`, so the real API client runs against the handlers below.

import { setupServer } from 'msw/node';

import { handlers } from './handlers';

export const server = setupServer(...handlers);
