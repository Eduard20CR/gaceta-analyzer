import { describe, expect, it } from 'vitest';

import * as shared from '../src/index';

// Smoke test that proves the Vitest setup works in this workspace.
// Replace it with real tests when the shared types and constants are added (#6).
describe('@gaceta/shared', () => {
  it('can be imported', () => {
    expect(shared).toBeTypeOf('object');
  });
});
