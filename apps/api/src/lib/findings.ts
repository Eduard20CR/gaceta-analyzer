// Turns the AI's raw findings into the findings the user sees (FR-03):
// 1. verify each quote against the real page text,
// 2. remove duplicates caused by overlapping blocks,
// 3. sort by page,
// 4. summarize for the job record (findingsCount, relevantPages).
//
// NEVER log quotes or page text (NFR-OBS-03).

import { RELEVANCES, VERIFICATIONS } from '@gaceta/shared';
import type { Finding, Relevance, Verification } from '@gaceta/shared';

import type { Block } from './blocks';
import type { PageText } from './pdf';

/** A finding as the AI returns it: everything except the verification result. */
export type UnverifiedFinding = Omit<Finding, 'verification'>;

/** Page text by 1-based page number, so a page can be found without searching. */
export type PagesByNumber = ReadonlyMap<number, PageText>;

export function indexPagesByNumber(pages: PageText[]): PagesByNumber {
  const pagesByNumber = new Map<number, PageText>();
  for (const page of pages) {
    pagesByNumber.set(page.pageNumber, page);
  }
  return pagesByNumber;
}

/**
 * Makes two texts comparable when they only differ in layout. Applied to both
 * the quote and the page text. The rules, in order:
 *
 * 1. Unicode NFC, so "é" written as one character or as "e" + accent is the same.
 * 2. Lower case. Accents are kept: "año" and "ano" are different words.
 * 3. Soft hyphens (U+00AD) are removed.
 * 4. A hyphen and any whitespace after it are removed. unpdf writes a word broken
 *    across lines ("produc-\ntos") and a real hyphen at the end of a line
 *    ("29643-\nH") in the same way, so the only safe rule is to drop every hyphen
 *    on both sides: "productos" and "29643h" then match in both cases
 *    (docs/spikes/0001-pdf-extraction.md).
 * 5. Typographic quotes become plain ones (“ ” « » → ", ‘ ’ → ').
 * 6. Any run of whitespace, including line breaks, becomes one space; the ends are trimmed.
 */
export function normalizeForComparison(text: string): string {
  let normalized = text.normalize('NFC');
  normalized = normalized.toLowerCase();
  normalized = normalized.replaceAll('­', '');
  normalized = normalized.replace(/-\s*/g, '');
  normalized = normalized.replace(/[“”«»]/g, '"');
  normalized = normalized.replace(/[‘’]/g, "'");
  normalized = normalized.replace(/\s+/g, ' ');
  return normalized.trim();
}

/**
 * Checks where the quote really is (FR-03):
 * - on the page the AI said → `verified`;
 * - on another page of the same block → `page_corrected`, with `page` fixed;
 * - anywhere else, or nowhere → `not_found`, page unchanged.
 */
export function verifyFinding(
  raw: UnverifiedFinding,
  block: Block,
  pagesByNumber: PagesByNumber,
): Finding {
  const quote = normalizeForComparison(raw.quote);

  const statedPageIsInBlock = block.pageNumbers.includes(raw.page);
  if (statedPageIsInBlock && pageContains(raw.page, quote, pagesByNumber)) {
    return { ...raw, verification: 'verified' };
  }

  for (const pageNumber of block.pageNumbers) {
    if (pageNumber === raw.page) {
      continue;
    }
    if (pageContains(pageNumber, quote, pagesByNumber)) {
      return { ...raw, page: pageNumber, verification: 'page_corrected' };
    }
  }

  return { ...raw, verification: 'not_found' };
}

function pageContains(
  pageNumber: number,
  normalizedQuote: string,
  pagesByNumber: PagesByNumber,
): boolean {
  const page = pagesByNumber.get(pageNumber);
  if (page === undefined || normalizedQuote === '') {
    return false;
  }
  return normalizeForComparison(page.text).includes(normalizedQuote);
}

/**
 * Removes duplicates: the same page and the same normalized quote. This happens
 * when two overlapping blocks both report the overlap page. The finding kept is
 * the one with the higher relevance; on a tie, the better verification.
 * The first finding's position is kept.
 */
export function deduplicateFindings(findings: Finding[]): Finding[] {
  const bestByKey = new Map<string, Finding>();

  for (const finding of findings) {
    const key = `${finding.page}|${normalizeForComparison(finding.quote)}`;
    const current = bestByKey.get(key);
    if (current === undefined || isBetter(finding, current)) {
      bestByKey.set(key, finding);
    }
  }

  return [...bestByKey.values()];
}

function isBetter(candidate: Finding, current: Finding): boolean {
  const relevanceDifference =
    relevanceRank(candidate.relevance) - relevanceRank(current.relevance);
  if (relevanceDifference !== 0) {
    return relevanceDifference < 0;
  }
  return (
    verificationRank(candidate.verification) <
    verificationRank(current.verification)
  );
}

// Lower rank = better. RELEVANCES is ordered high, medium, low and
// VERIFICATIONS verified, page_corrected, not_found.
function relevanceRank(relevance: Relevance): number {
  return RELEVANCES.indexOf(relevance);
}

function verificationRank(verification: Verification): number {
  return VERIFICATIONS.indexOf(verification);
}

/** Sorts by page, then by relevance (high first). Returns a new array. */
export function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) => {
    if (a.page !== b.page) {
      return a.page - b.page;
    }
    return relevanceRank(a.relevance) - relevanceRank(b.relevance);
  });
}

export interface FindingsSummary {
  findingsCount: number;
  /** Pages with at least one high or medium finding, sorted, without repeats. */
  relevantPages: number[];
}

/** The numbers stored in the job record (docs/architecture.md, ADR-0004). */
export function summarizeFindings(findings: Finding[]): FindingsSummary {
  const relevantPages = new Set<number>();
  for (const finding of findings) {
    if (finding.relevance === 'high' || finding.relevance === 'medium') {
      relevantPages.add(finding.page);
    }
  }

  return {
    findingsCount: findings.length,
    relevantPages: [...relevantPages].sort((a, b) => a - b),
  };
}
