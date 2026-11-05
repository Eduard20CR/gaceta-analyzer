// Uploads the PDF straight to S3 with the presigned POST from `createJob`
// (ADR-0005, FR-02).
//
// Two details matter here:
// - The request goes to S3, not to our API, so it must NOT include the
//   `Authorization` header: S3 would reject it, and the password must never be
//   sent to another service.
// - `fetch` cannot report upload progress, so this uses `XMLHttpRequest`, whose
//   `upload.onprogress` event says how many bytes have been sent.

import type { CreateJobResponse } from '@gaceta/shared';

import { API_ERROR_MESSAGES, ApiError } from './errors';

export type PresignedUpload = CreateJobResponse['upload'];

/** Called with the fraction uploaded so far, from 0 to 1. */
export type UploadProgressHandler = (fraction: number) => void;

export function uploadPdf(
  upload: PresignedUpload,
  file: File,
  onProgress?: UploadProgressHandler,
): Promise<void> {
  const form = buildUploadForm(upload, file);

  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', upload.url);

    request.upload.onprogress = (event) => {
      if (onProgress !== undefined && event.lengthComputable) {
        onProgress(event.loaded / event.total);
      }
    };

    request.onload = () => {
      // S3 answers 204 (or 200/201) when the file was stored.
      if (request.status >= 200 && request.status < 300) {
        onProgress?.(1);
        resolve();
      } else {
        reject(new ApiError(request.status, API_ERROR_MESSAGES.upload));
      }
    };

    // No response at all: network error, or blocked by the bucket's CORS.
    request.onerror = () => {
      reject(new ApiError(0, API_ERROR_MESSAGES.upload));
    };

    request.send(form);
  });
}

/** Exported for tests: the form S3 expects for a presigned POST. */
export function buildUploadForm(upload: PresignedUpload, file: File): FormData {
  const form = new FormData();
  for (const [name, value] of Object.entries(upload.fields)) {
    form.append(name, value);
  }
  // S3 ignores every field after the file, so the file must be the last entry.
  form.append('file', file);
  return form;
}
