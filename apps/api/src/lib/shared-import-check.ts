// Proves that the API can import @gaceta/shared through the npm workspace.
// Remove this file once a real module in apps/api imports from @gaceta/shared.
import type * as Shared from '@gaceta/shared';

export type SharedModule = typeof Shared;
