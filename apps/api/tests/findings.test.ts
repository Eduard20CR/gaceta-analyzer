import { describe, expect, it } from 'vitest';

import type { Finding } from '@gaceta/shared';

import { buildBlocks } from '../src/lib/blocks';
import {
  deduplicateFindings,
  indexPagesByNumber,
  normalizeForComparison,
  sortFindings,
  summarizeFindings,
  verifyFinding,
} from '../src/lib/findings';
import type { UnverifiedFinding } from '../src/lib/findings';
import type { PageText } from '../src/lib/pdf';

const pages: PageText[] = [
  { pageNumber: 1, text: 'Portada de La Gaceta.' },
  {
    pageNumber: 2,
    text: 'Se reforma el impuesto sobre la\nrenta para el período 2027.',
  },
  {
    pageNumber: 3,
    text: 'Los aranceles de importación de alimen-\ntos bajan un 5 %.',
  },
  { pageNumber: 4, text: 'Decreto Ejecutivo N° 29643-\nH, reglamento.' },
  { pageNumber: 5, text: 'Página sin relación.' },
  { pageNumber: 6, text: 'Nuevo impuesto a los vehículos eléctricos.' },
];
const pagesByNumber = indexPagesByNumber(pages);

// Blocks of size 3 over 6 pages: 1–3, 3–5, 5–6.
const [firstBlock, secondBlock] = buildBlocks(pages, 3);
if (firstBlock === undefined || secondBlock === undefined) {
  throw new Error('Expected at least two blocks');
}

function rawFinding(overrides: Partial<UnverifiedFinding>): UnverifiedFinding {
  return {
    page: 2,
    topic: 'impuestos',
    quote: 'Se reforma el impuesto sobre la renta',
    reason: 'Modifica un impuesto.',
    relevance: 'high',
    ...overrides,
  };
}

function finding(overrides: Partial<Finding>): Finding {
  return { ...rawFinding({}), verification: 'verified', ...overrides };
}

describe('normalizeForComparison', () => {
  it('lower-cases, collapses whitespace and line breaks, and trims', () => {
    expect(normalizeForComparison('  Se REFORMA\n\tel   impuesto  ')).toBe(
      'se reforma el impuesto',
    );
  });

  it('keeps accents', () => {
    expect(normalizeForComparison('Año')).toBe('año');
    expect(normalizeForComparison('Año')).not.toBe(
      normalizeForComparison('Ano'),
    );
  });

  it('treats composed and decomposed accents as the same text', () => {
    // "í" as one character (U+00ED) and as "i" + combining accent (U+0301).
    const composed = 'per\u00EDodo';
    const decomposed = 'peri\u0301odo';
    expect(normalizeForComparison(decomposed)).toBe(
      normalizeForComparison(composed),
    );
  });

  it('removes soft hyphens and hyphens at line ends', () => {
    expect(normalizeForComparison('alimen­tos')).toBe('alimentos');
    expect(normalizeForComparison('alimen-\ntos')).toBe('alimentos');
  });

  it('makes a real hyphen split by a line break match the same hyphen on one line', () => {
    expect(normalizeForComparison('29643-\nH')).toBe(
      normalizeForComparison('29643-H'),
    );
  });

  it('turns typographic quotes into plain quotes', () => {
    expect(normalizeForComparison('“Zona” ‘A’ «B»')).toBe(`"zona" 'a' "b"`);
  });
});

describe('verifyFinding', () => {
  it('marks a quote found on the stated page as verified', () => {
    const result = verifyFinding(rawFinding({}), firstBlock, pagesByNumber);

    expect(result.verification).toBe('verified');
    expect(result.page).toBe(2);
  });

  it('corrects the page when the quote is on another page of the same block', () => {
    const result = verifyFinding(
      rawFinding({ page: 1 }),
      firstBlock,
      pagesByNumber,
    );

    expect(result.verification).toBe('page_corrected');
    expect(result.page).toBe(2);
  });

  it('marks a missing quote as not_found and keeps the page', () => {
    const result = verifyFinding(
      rawFinding({ quote: 'Texto que no existe en el documento' }),
      firstBlock,
      pagesByNumber,
    );

    expect(result.verification).toBe('not_found');
    expect(result.page).toBe(2);
  });

  it('marks a quote that is only on a page outside the block as not_found', () => {
    const result = verifyFinding(
      rawFinding({
        page: 3,
        quote: 'Nuevo impuesto a los vehículos eléctricos',
      }),
      firstBlock,
      pagesByNumber,
    );

    expect(result.verification).toBe('not_found');
    expect(result.page).toBe(3);
  });

  it('does not trust a stated page outside the block', () => {
    // Page 6 has the quote, but the block is 1–3.
    const result = verifyFinding(
      rawFinding({
        page: 6,
        quote: 'Nuevo impuesto a los vehículos eléctricos',
      }),
      firstBlock,
      pagesByNumber,
    );

    expect(result.verification).toBe('not_found');
  });

  it.each([
    ['extra spaces', 'Se  reforma el   impuesto sobre la renta'],
    [
      'a line break in the page text',
      'impuesto sobre la renta para el período',
    ],
    ['different letter case', 'SE REFORMA EL IMPUESTO'],
  ])('verifies a quote that differs only in %s', (_label, quote) => {
    const result = verifyFinding(
      rawFinding({ quote }),
      firstBlock,
      pagesByNumber,
    );

    expect(result.verification).toBe('verified');
  });

  it('verifies a quote across end-of-line hyphenation', () => {
    const result = verifyFinding(
      rawFinding({ page: 3, quote: 'aranceles de importación de alimentos' }),
      firstBlock,
      pagesByNumber,
    );

    expect(result.verification).toBe('verified');
  });

  it('verifies a quote with a real hyphen that the PDF split across lines', () => {
    const result = verifyFinding(
      rawFinding({ page: 4, quote: 'Decreto Ejecutivo N° 29643-H' }),
      secondBlock,
      pagesByNumber,
    );

    expect(result.verification).toBe('verified');
  });

  it('marks an empty quote as not_found', () => {
    const result = verifyFinding(
      rawFinding({ quote: '   ' }),
      firstBlock,
      pagesByNumber,
    );

    expect(result.verification).toBe('not_found');
  });
});

describe('deduplicateFindings', () => {
  it('keeps one copy of a finding reported by two overlapping blocks', () => {
    // Page 3 is in blocks 1–3 and 3–5, so both blocks can report it.
    const fromFirstBlock = verifyFinding(
      rawFinding({ page: 3, quote: 'aranceles de importación' }),
      firstBlock,
      pagesByNumber,
    );
    const fromSecondBlock = verifyFinding(
      rawFinding({ page: 3, quote: 'Aranceles de  importación' }),
      secondBlock,
      pagesByNumber,
    );

    const result = deduplicateFindings([fromFirstBlock, fromSecondBlock]);

    expect(result).toHaveLength(1);
  });

  it('keeps the duplicate with the higher relevance', () => {
    const result = deduplicateFindings([
      finding({ relevance: 'low' }),
      finding({ relevance: 'high' }),
      finding({ relevance: 'medium' }),
    ]);

    expect(result).toEqual([finding({ relevance: 'high' })]);
  });

  it('prefers a verified duplicate when the relevance is the same', () => {
    const result = deduplicateFindings([
      finding({ verification: 'not_found' }),
      finding({ verification: 'verified' }),
    ]);

    expect(result).toEqual([finding({ verification: 'verified' })]);
  });

  it('keeps the same quote on different pages', () => {
    const result = deduplicateFindings([
      finding({ page: 2 }),
      finding({ page: 3 }),
    ]);

    expect(result).toHaveLength(2);
  });
});

describe('sortFindings', () => {
  it('sorts by page, then by relevance with high first', () => {
    const result = sortFindings([
      finding({ page: 9, relevance: 'high' }),
      finding({ page: 2, relevance: 'low' }),
      finding({ page: 2, relevance: 'high' }),
      finding({ page: 5, relevance: 'medium' }),
    ]);

    expect(result.map((item) => [item.page, item.relevance])).toEqual([
      [2, 'high'],
      [2, 'low'],
      [5, 'medium'],
      [9, 'high'],
    ]);
  });

  it('does not change the input array', () => {
    const input = [finding({ page: 9 }), finding({ page: 2 })];

    sortFindings(input);

    expect(input.map((item) => item.page)).toEqual([9, 2]);
  });
});

describe('summarizeFindings', () => {
  it('counts findings and lists pages with high or medium findings, sorted and unique', () => {
    const result = summarizeFindings([
      finding({ page: 9, relevance: 'medium' }),
      finding({ page: 2, relevance: 'high' }),
      finding({ page: 2, relevance: 'medium' }),
      finding({ page: 5, relevance: 'low' }),
    ]);

    expect(result).toEqual({ findingsCount: 4, relevantPages: [2, 9] });
  });

  it('leaves out pages that only have low findings', () => {
    const result = summarizeFindings([finding({ page: 5, relevance: 'low' })]);

    expect(result).toEqual({ findingsCount: 1, relevantPages: [] });
  });
});
