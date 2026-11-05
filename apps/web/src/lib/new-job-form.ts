// The new job form's rules (FR-02), as pure functions so they can be tested
// without rendering the page.
//
// The text fields are checked with `createJobRequestSchema` from @gaceta/shared,
// the same schema the API uses, so the form and the API can never disagree
// about what is valid (NFR-MAINT-06).

import { createJobRequestSchema } from '@gaceta/shared';
import type { CreateJobRequestInput } from '@gaceta/shared';

import { validatePdfFile } from './validate-pdf-file';

/** What the user typed or chose, exactly as the inputs hold it. */
export interface NewJobFormValues {
  name: string;
  query: string;
  file: File | null;
  /** The text of the number input, for example "5" (or "" while typing). */
  pagesPerBlock: string;
}

/** A Spanish message for each field that is not valid. */
export interface NewJobFormErrors {
  name?: string;
  query?: string;
  file?: string;
  pagesPerBlock?: string;
}

export type NewJobFormResult =
  | { valid: true; request: CreateJobRequestInput }
  | { valid: false; errors: NewJobFormErrors };

export const MISSING_FILE_MESSAGE = 'Elija el PDF que desea analizar';

/**
 * Checks every field. When all are valid, returns the request body for
 * `POST /api/jobs`; otherwise, one message per invalid field.
 */
export function validateNewJobForm(values: NewJobFormValues): NewJobFormResult {
  const errors: NewJobFormErrors = {};

  if (values.file === null) {
    errors.file = MISSING_FILE_MESSAGE;
  } else {
    const fileError = validatePdfFile(values.file);
    if (fileError !== null) {
      errors.file = fileError;
    }
  }

  const request = buildRequest(values);
  const parsed = createJobRequestSchema.safeParse(request);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      addSchemaError(errors, String(issue.path[0]), issue.message);
    }
  }

  if (Object.keys(errors).length > 0) {
    return { valid: false, errors };
  }
  return { valid: true, request };
}

function buildRequest(values: NewJobFormValues): CreateJobRequestInput {
  const name = values.name.trim();
  return {
    // An empty name is left out: the API then uses the file name (FR-02).
    name: name === '' ? undefined : name,
    query: values.query,
    // Without a file these are placeholders; the file error above is shown.
    fileName: values.file?.name ?? '',
    fileSize: values.file?.size ?? 0,
    pagesPerBlock: parsePagesPerBlock(values.pagesPerBlock),
  };
}

// The schema rejects anything that is not a whole number of at least 2, and
// NaN (from "2,5" or "abc") is not a whole number. An empty field would be
// `Number("") === 0`; it becomes NaN too, so it gets the "whole number" message.
function parsePagesPerBlock(text: string): number {
  if (text.trim() === '') {
    return Number.NaN;
  }
  return Number(text);
}

function addSchemaError(
  errors: NewJobFormErrors,
  field: string,
  message: string,
): void {
  switch (field) {
    case 'name':
      errors.name = message;
      break;
    case 'query':
      errors.query = message;
      break;
    case 'pagesPerBlock':
      errors.pagesPerBlock = message;
      break;
    default:
      // fileName and fileSize: the file check above already explains the
      // problem better (for example "El archivo debe ser un PDF").
      if (errors.file === undefined) {
        errors.file = message;
      }
  }
}
