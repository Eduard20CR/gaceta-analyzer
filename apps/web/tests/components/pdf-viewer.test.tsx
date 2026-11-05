import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { PdfViewer } from '../../src/components/PdfViewer';
import { fakePdf } from '../react-pdf-mock';

const URL = 'https://s3.test/gaceta-analyzer-data/uploads/x.pdf?sig=1';

/** The viewer with its page kept in state, like JobResults does. */
function ViewerWithPage({
  initialPage = 1,
  onLoadError = () => undefined,
}: {
  initialPage?: number;
  onLoadError?: () => void;
}) {
  const [page, setPage] = useState(initialPage);
  return (
    <PdfViewer
      url={URL}
      page={page}
      onPageChange={setPage}
      onLoadError={onLoadError}
    />
  );
}

async function renderLoadedViewer(pageCount: number, initialPage = 1) {
  fakePdf.pageCount = pageCount;
  render(<ViewerWithPage initialPage={initialPage} />);
  await screen.findByText(`Página ${initialPage} del PDF`);
  return userEvent.setup();
}

function pageInput(): HTMLElement {
  return screen.getByLabelText('Página');
}

describe('PdfViewer', () => {
  it('renders only the current page of a 500-page document', async () => {
    await renderLoadedViewer(500);

    expect(screen.getAllByTestId('pdf-page')).toHaveLength(1);
    expect(screen.getByText('1 / 500')).toBeInTheDocument();
  });

  it('moves with "Anterior" and "Siguiente" and stays within 1…N', async () => {
    const user = await renderLoadedViewer(3);
    const previous = screen.getByRole('button', { name: 'Anterior' });
    const next = screen.getByRole('button', { name: 'Siguiente' });

    expect(previous).toBeDisabled();

    await user.click(next);
    await user.click(next);
    expect(screen.getByText('Página 3 del PDF')).toBeInTheDocument();
    expect(next).toBeDisabled();

    await user.click(previous);
    expect(screen.getByText('Página 2 del PDF')).toBeInTheDocument();
  });

  it('goes to a typed page with Enter', async () => {
    const user = await renderLoadedViewer(500);

    await user.clear(pageInput());
    await user.type(pageInput(), '120{Enter}');

    expect(screen.getByText('Página 120 del PDF')).toBeInTheDocument();
    expect(screen.getByText('120 / 500')).toBeInTheDocument();
  });

  it.each([
    ['999', 500],
    ['0', 1],
    ['-4', 1],
  ])('keeps a typed %s inside 1…N (page %i)', async (typed, expected) => {
    const user = await renderLoadedViewer(500, 7);

    await user.clear(pageInput());
    await user.type(pageInput(), `${typed}{Enter}`);

    expect(screen.getByText(`Página ${expected} del PDF`)).toBeInTheDocument();
    expect(pageInput()).toHaveValue(expected);
  });

  it('zooms in, out, and back to the width of the viewer', async () => {
    const user = await renderLoadedViewer(3);
    const page = () => screen.getByTestId('pdf-page');

    await user.click(screen.getByRole('button', { name: 'Acercar' }));
    expect(page()).toHaveAttribute('data-scale', '1.25');
    expect(screen.getByText('125 %')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Alejar' }));
    await user.click(screen.getByRole('button', { name: 'Alejar' }));
    expect(page()).toHaveAttribute('data-scale', '0.75');

    await user.click(screen.getByRole('button', { name: 'Ajustar al ancho' }));
    expect(page()).toHaveAttribute('data-scale', '1');
  });

  it('reports a load error to the parent', async () => {
    fakePdf.failingUrls.add(URL);
    const onLoadError = vi.fn();
    render(<ViewerWithPage onLoadError={onLoadError} />);

    await vi.waitFor(() => {
      expect(onLoadError).toHaveBeenCalledTimes(1);
    });
  });
});
