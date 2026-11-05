import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Spinner } from '../../src/components/Spinner';

describe('Spinner', () => {
  it('announces "Cargando…" by default', () => {
    render(<Spinner />);

    expect(screen.getByRole('status')).toHaveTextContent('Cargando…');
  });

  it('shows a custom label', () => {
    render(<Spinner label="Subiendo el PDF…" />);

    expect(screen.getByRole('status')).toHaveTextContent('Subiendo el PDF…');
  });
});
