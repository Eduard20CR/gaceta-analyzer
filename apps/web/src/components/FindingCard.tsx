import type { Finding } from '@gaceta/shared';

import { Button } from './Button';
import { RELEVANCE_LABELS, VERIFICATION_LABELS } from './relevance-labels';

interface FindingCardProps {
  finding: Finding;
  /**
   * When given, the card shows a "Ver página N" button that calls it, so the
   * PDF viewer can jump to the page of the finding (FR-06).
   */
  onShowPage?: ((page: number) => void) | undefined;
  /**
   * The viewer shows this finding's page. The card is highlighted, like a
   * selected comment in a PDF reader, and `aria-current` tells screen readers.
   */
  isActive?: boolean;
}

/** One finding: page, topic, relevance, the quote, why it matters, and its check. */
export function FindingCard({
  finding,
  onShowPage,
  isActive = false,
}: FindingCardProps) {
  const isNotFound = finding.verification === 'not_found';

  return (
    <article
      className="finding-card"
      // `undefined` leaves the attribute out instead of writing "false".
      aria-current={isActive ? 'true' : undefined}
    >
      <header className="finding-card__header">
        <span className="finding-card__page">Página {finding.page}</span>
        <span className="finding-card__topic">{finding.topic}</span>
        <span
          className={`finding-card__relevance finding-card__relevance--${finding.relevance}`}
        >
          Relevancia: {RELEVANCE_LABELS[finding.relevance]}
        </span>
      </header>

      {/* The AI could have made this quote up, so a missing quote is a warning
          that stands out, not a small note (FR-07). */}
      {isNotFound && (
        <p role="note" className="finding-card__warning">
          ⚠ {VERIFICATION_LABELS.not_found}
        </p>
      )}

      <blockquote className="finding-card__quote">{finding.quote}</blockquote>
      <p className="finding-card__reason">{finding.reason}</p>

      <footer className="finding-card__footer">
        {!isNotFound && (
          <p className="finding-card__verification">
            {VERIFICATION_LABELS[finding.verification]}
          </p>
        )}

        {onShowPage !== undefined && (
          <Button
            variant="secondary"
            className="finding-card__show-page"
            onClick={() => onShowPage(finding.page)}
          >
            Ver página {finding.page}
          </Button>
        )}
      </footer>
    </article>
  );
}
