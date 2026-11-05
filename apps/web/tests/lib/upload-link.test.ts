import { describe, expect, it } from 'vitest';

import {
  UPLOAD_LINK_LIFETIME_MS,
  isUploadLinkValid,
} from '../../src/lib/upload-link';

describe('isUploadLinkValid', () => {
  const createdAt = Date.UTC(2026, 10, 5, 12, 0);

  it('is valid for 15 minutes after the job was created', () => {
    expect(UPLOAD_LINK_LIFETIME_MS).toBe(15 * 60 * 1000);
    expect(isUploadLinkValid(createdAt, createdAt)).toBe(true);
    expect(
      isUploadLinkValid(createdAt, createdAt + UPLOAD_LINK_LIFETIME_MS - 1),
    ).toBe(true);
  });

  it('expires after 15 minutes', () => {
    expect(
      isUploadLinkValid(createdAt, createdAt + UPLOAD_LINK_LIFETIME_MS),
    ).toBe(false);
  });
});
