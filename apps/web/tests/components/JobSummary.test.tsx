import { render, screen } from '@testing-library/react';
import type { Finding, Relevance } from '@gaceta/shared';
import { describe, expect, it } from 'vitest';

import { JobSummary } from '../../src/components/JobSummary';

function finding(page: number, relevance: Relevance): Finding {
  return {
    page,
    topic: 'Impuestos',
    quote: 'Una cita',
    reason: 'Una razón',
    relevance,
    verification: 'verified',
  };
}

describe('JobSummary', () => {
  it('shows the total and the pages with high or medium relevance', () => {
    render(
      <JobSummary
        findings={[
          finding(3, 'high'),
          finding(9, 'low'),
          finding(14, 'medium'),
        ]}
        failedPages={[]}
      />,
    );

    expect(screen.getByText('Se encontraron 3 hallazgos.')).toBeInTheDocument();
    expect(
      screen.getByText('Páginas con relevancia alta o media: 3, 14.'),
    ).toBeInTheDocument();
  });

  it('uses the singular for one finding and says when no page is relevant', () => {
    render(<JobSummary findings={[finding(9, 'low')]} failedPages={[]} />);

    expect(screen.getByText('Se encontró 1 hallazgo.')).toBeInTheDocument();
    expect(
      screen.getByText('Páginas con relevancia alta o media: ninguna.'),
    ).toBeInTheDocument();
  });

  it('lists the pages that could not be analyzed, only when there are some', () => {
    const { rerender } = render(<JobSummary findings={[]} failedPages={[]} />);
    expect(screen.queryByRole('note')).not.toBeInTheDocument();

    rerender(<JobSummary findings={[]} failedPages={[41, 42, 43]} />);

    expect(screen.getByRole('note')).toHaveTextContent(
      'No se pudieron analizar las páginas: 41, 42, 43.',
    );
  });
});
