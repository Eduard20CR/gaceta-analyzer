// Contract of `POST /api/jobs` (docs/architecture.md → "API contract", FR-02).
// The API validates the request body with this schema and the web app can use
// the same schema for its form, so both apply exactly the same rules.

import { z } from 'zod';

import {
  DEFAULT_PAGES_PER_BLOCK,
  MAX_FILE_SIZE_BYTES,
  MIN_PAGES_PER_BLOCK,
} from '../constants';
import type { Job } from '../job';

export const MAX_JOB_NAME_LENGTH = 120;
export const MIN_QUERY_LENGTH = 3;
export const MAX_QUERY_LENGTH = 2000;

// The messages are in Spanish because the API returns them to be shown to the
// user as they are (NFR-UX-04).
const nameSchema = z
  .string({ error: 'El nombre debe ser texto' })
  .trim()
  .max(MAX_JOB_NAME_LENGTH, {
    error: `El nombre puede tener como máximo ${MAX_JOB_NAME_LENGTH} caracteres`,
  });

// `.trim()` runs before the length checks, so "  ab  " counts as 2 characters.
const querySchema = z
  .string({ error: 'Escriba qué desea buscar' })
  .trim()
  .min(MIN_QUERY_LENGTH, {
    error: `La búsqueda debe tener al menos ${MIN_QUERY_LENGTH} caracteres`,
  })
  .max(MAX_QUERY_LENGTH, {
    error: `La búsqueda puede tener como máximo ${MAX_QUERY_LENGTH} caracteres`,
  });

const fileNameSchema = z
  .string({ error: 'Falta el nombre del archivo' })
  .trim()
  .min(1, { error: 'Falta el nombre del archivo' })
  .refine((fileName) => fileName.toLowerCase().endsWith('.pdf'), {
    error: 'El archivo debe ser un PDF',
  });

const fileSizeSchema = z
  .int({ error: 'El tamaño del archivo no es válido' })
  .positive({ error: 'El archivo está vacío' })
  .max(MAX_FILE_SIZE_BYTES, {
    error: 'El archivo puede pesar como máximo 100 MB',
  });

const pagesPerBlockSchema = z
  .int({ error: 'Las páginas por bloque deben ser un número entero' })
  .min(MIN_PAGES_PER_BLOCK, {
    error: `Las páginas por bloque deben ser al menos ${MIN_PAGES_PER_BLOCK}`,
  })
  .default(DEFAULT_PAGES_PER_BLOCK);

export const createJobRequestSchema = z.object({
  // Optional. When it is missing or empty, create-job uses the file name (FR-02).
  name: nameSchema.optional(),
  query: querySchema,
  fileName: fileNameSchema,
  fileSize: fileSizeSchema,
  // Optional in the request; after parsing it always has a value (default 5, ADR-0012).
  pagesPerBlock: pagesPerBlockSchema,
});

/** What the web app sends: `pagesPerBlock` may be left out. */
export type CreateJobRequestInput = z.input<typeof createJobRequestSchema>;

/** The request after validation: trimmed strings and `pagesPerBlock` always set. */
export type CreateJobRequest = z.output<typeof createJobRequestSchema>;

/** Response `201` of `POST /api/jobs`. */
export interface CreateJobResponse {
  job: Job;
  /**
   * Presigned S3 POST (ADR-0005). The browser sends the PDF to `url` as a form
   * with every entry of `fields` plus the file.
   */
  upload: {
    url: string;
    fields: Record<string, string>;
  };
}
