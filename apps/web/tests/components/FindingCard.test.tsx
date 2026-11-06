import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Finding } from '@gaceta/shared';
import { describe, expect, it, vi } from 'vitest';

import { FindingCard } from '../../src/components/FindingCard';

const FINDING: Finding = {
  page: 14,
  topic: 'Aranceles',
  quote: 'Se modifica el arancel de importación del arroz',
  reason: 'Cambia un arancel de importación',
  relevance: 'high',
  verification: 'verified',
};

describe('FindingCard', () => {
  it('shows page, topic, relevance, quote, reason and verification', () => {
    render(<FindingCard finding={FINDING} />);

    expect(screen.getByText('Página 14')).toBeInTheDocument();
    expect(screen.getByText('Aranceles')).toBeInTheDocument();
    expect(screen.getByText('Relevancia: Alta')).toBeInTheDocument();
    expect(
      screen.getByText('Se modifica el arancel de importación del arroz'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Cambia un arancel de importación'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Cita verificada en el documento'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('shows the quote inside a quotation', () => {
    render(<FindingCard finding={FINDING} />);

    expect(
      screen.getByText('Se modifica el arancel de importación del arroz')
        .tagName,
    ).toBe('BLOCKQUOTE');
  });

  it('notes when the page number was corrected', () => {
    render(
      <FindingCard finding={{ ...FINDING, verification: 'page_corrected' }} />,
    );

    expect(
      screen.getByText('Cita verificada; el número de página se corrigió'),
    ).toBeInTheDocument();
  });

  it('warns when the quote was not found in the document', () => {
    render(<FindingCard finding={{ ...FINDING, verification: 'not_found' }} />);

    expect(screen.getByRole('note')).toHaveTextContent(
      'La cita no se encontró en el documento',
    );
  });

  it('has no "Ver página" button without a viewer', () => {
    render(<FindingCard finding={FINDING} />);

    expect(
      screen.queryByRole('button', { name: 'Ver página 14' }),
    ).not.toBeInTheDocument();
  });

  it('"Ver página N" asks to show the page of the finding', async () => {
    const onShowPage = vi.fn();
    render(<FindingCard finding={FINDING} onShowPage={onShowPage} />);

    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Ver página 14' }));

    expect(onShowPage).toHaveBeenCalledWith(14);
  });

  it('is marked as the current finding when the viewer shows its page', () => {
    render(<FindingCard finding={FINDING} isActive />);

    expect(screen.getByRole('article')).toHaveAttribute('aria-current', 'true');
  });

  it('is not marked as current by default', () => {
    render(<FindingCard finding={FINDING} />);

    expect(screen.getByRole('article')).not.toHaveAttribute('aria-current');
  });
});
