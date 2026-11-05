import type { Finding } from '@gaceta/shared';

import { RELEVANCE_LABELS, VERIFICATION_LABELS } from './relevance-labels';

interface FindingCardProps {
  finding: Finding;
}

/** One finding: page, topic, relevance, the quote, why it matters, and its check. */
export function FindingCard({ finding }: FindingCardProps) {
  const isNotFound = finding.verification === 'not_found';

  return (
    <article className="finding-card">
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

      {!isNotFound && (
        <p className="finding-card__verification">
          {VERIFICATION_LABELS[finding.verification]}
        </p>
      )}
    </article>
  );
}
