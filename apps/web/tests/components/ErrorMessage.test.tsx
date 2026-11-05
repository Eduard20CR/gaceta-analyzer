import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ErrorMessage } from '../../src/components/ErrorMessage';

describe('ErrorMessage', () => {
  it('shows its text as an alert', () => {
    render(<ErrorMessage message="No se pudo cargar. Intente de nuevo." />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'No se pudo cargar. Intente de nuevo.',
    );
  });

  it('shows no button when there is no action', () => {
    render(<ErrorMessage message="No se pudo cargar." />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('calls its action when the button is clicked', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(
      <ErrorMessage
        message="No se pudo cargar."
        action={{ label: 'Reintentar', onClick: onRetry }}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
