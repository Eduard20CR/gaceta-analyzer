import type { Relevance, Verification } from '@gaceta/shared';

import type { RelevanceFilter } from '../lib/job-results';

/** What the user reads for each relevance (and for the "every finding" filter). */
export const RELEVANCE_FILTER_LABELS: Record<RelevanceFilter, string> = {
  all: 'Todas',
  high: 'Alta',
  medium: 'Media',
  low: 'Baja',
};

export const RELEVANCE_LABELS: Record<Relevance, string> = {
  high: 'Alta',
  medium: 'Media',
  low: 'Baja',
};

/** How the quote was checked against the PDF text (FR-07). */
export const VERIFICATION_LABELS: Record<Verification, string> = {
  verified: 'Cita verificada en el documento',
  page_corrected: 'Cita verificada; el número de página se corrigió',
  not_found: 'La cita no se encontró en el documento',
};
