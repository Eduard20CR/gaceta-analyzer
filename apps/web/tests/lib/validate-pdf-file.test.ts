import { MAX_FILE_SIZE_BYTES } from '@gaceta/shared';
import { describe, expect, it } from 'vitest';

import { validatePdfFile } from '../../src/lib/validate-pdf-file';

/** A small fake file. `size` is faked so no test allocates 100 MB. */
function fakeFile(name: string, type: string, size = 10): File {
  const file = new File(['%PDF-1.7'], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

describe('validatePdfFile', () => {
  it('accepts a PDF up to 100 MB', () => {
    expect(validatePdfFile(fakeFile('gaceta.pdf', 'application/pdf'))).toBe(
      null,
    );
    expect(
      validatePdfFile(
        fakeFile('gaceta.pdf', 'application/pdf', MAX_FILE_SIZE_BYTES),
      ),
    ).toBe(null);
  });

  it('accepts a .pdf file whose type the browser left empty', () => {
    expect(validatePdfFile(fakeFile('GACETA.PDF', ''))).toBe(null);
  });

  it('rejects a file that is not a PDF', () => {
    expect(validatePdfFile(fakeFile('foto.png', 'image/png'))).toBe(
      'El archivo debe ser un PDF',
    );
  });

  it('rejects a PDF over 100 MB', () => {
    expect(
      validatePdfFile(
        fakeFile('gaceta.pdf', 'application/pdf', MAX_FILE_SIZE_BYTES + 1),
      ),
    ).toBe('El archivo puede pesar como máximo 100 MB');
  });

  it('rejects an empty file', () => {
    expect(validatePdfFile(fakeFile('gaceta.pdf', 'application/pdf', 0))).toBe(
      'El archivo está vacío',
    );
  });
});
