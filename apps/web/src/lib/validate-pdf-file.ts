// Checks the chosen file before anything is uploaded (FR-02).
//
// S3 enforces the same limits (the presigned POST only accepts application/pdf
// up to 100 MB, NFR-SEC-08), but checking here first tells the user why right
// away, instead of after a long upload that S3 rejects.

import { MAX_FILE_SIZE_BYTES } from '@gaceta/shared';

export const NOT_A_PDF_MESSAGE = 'El archivo debe ser un PDF';
export const FILE_TOO_LARGE_MESSAGE =
  'El archivo puede pesar como máximo 100 MB';
export const EMPTY_FILE_MESSAGE = 'El archivo está vacío';

/** Returns why the file cannot be analyzed, in Spanish, or `null` if it is fine. */
export function validatePdfFile(file: File): string | null {
  if (!looksLikePdf(file)) {
    return NOT_A_PDF_MESSAGE;
  }
  if (file.size === 0) {
    return EMPTY_FILE_MESSAGE;
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return FILE_TOO_LARGE_MESSAGE;
  }
  return null;
}

// Browsers fill `type` from the file extension, and some leave it empty, so
// either the type or the extension is enough.
function looksLikePdf(file: File): boolean {
  if (file.type === 'application/pdf') {
    return true;
  }
  return file.name.toLowerCase().endsWith('.pdf');
}
