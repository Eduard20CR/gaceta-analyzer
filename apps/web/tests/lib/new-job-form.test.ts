import { describe, expect, it } from 'vitest';

import { validateNewJobForm } from '../../src/lib/new-job-form';
import type { NewJobFormValues } from '../../src/lib/new-job-form';

const PDF = new File(['%PDF-1.7'], 'gaceta.pdf', { type: 'application/pdf' });

const VALID_VALUES: NewJobFormValues = {
  name: '',
  query: 'impuestos, aranceles',
  file: PDF,
  pagesPerBlock: '5',
};

describe('validateNewJobForm', () => {
  it('builds the request body when every field is valid', () => {
    const result = validateNewJobForm({ ...VALID_VALUES, name: 'Gaceta' });

    expect(result).toEqual({
      valid: true,
      request: {
        name: 'Gaceta',
        query: 'impuestos, aranceles',
        fileName: 'gaceta.pdf',
        fileSize: PDF.size,
        pagesPerBlock: 5,
      },
    });
  });

  it('leaves out an empty name, so the API uses the file name', () => {
    const result = validateNewJobForm({ ...VALID_VALUES, name: '   ' });

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.request.name).toBeUndefined();
    }
  });

  it('asks for a file when none was chosen', () => {
    expect(validateNewJobForm({ ...VALID_VALUES, file: null })).toEqual({
      valid: false,
      errors: { file: 'Elija el PDF que desea analizar' },
    });
  });

  it('uses the shared schema messages for the query and the name', () => {
    const result = validateNewJobForm({
      ...VALID_VALUES,
      name: 'x'.repeat(121),
      query: 'ab',
    });

    expect(result).toEqual({
      valid: false,
      errors: {
        name: 'El nombre puede tener como máximo 120 caracteres',
        query: 'La búsqueda debe tener al menos 3 caracteres',
      },
    });
  });

  it.each([
    ['1', 'Las páginas por bloque deben ser al menos 2'],
    ['2.5', 'Las páginas por bloque deben ser un número entero'],
    ['', 'Las páginas por bloque deben ser un número entero'],
  ])('rejects %j pages per block', (pagesPerBlock, message) => {
    expect(validateNewJobForm({ ...VALID_VALUES, pagesPerBlock })).toEqual({
      valid: false,
      errors: { pagesPerBlock: message },
    });
  });

  it('accepts big blocks: there is no maximum (ADR-0012)', () => {
    expect(
      validateNewJobForm({ ...VALID_VALUES, pagesPerBlock: '200' }).valid,
    ).toBe(true);
  });
});
