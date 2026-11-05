import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Button } from '../../src/components/Button';

describe('Button', () => {
  it('does not submit a form unless asked to', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <form
        onSubmit={(event) => {
          // jsdom cannot navigate; stop the real submit and only record it.
          event.preventDefault();
          onSubmit();
        }}
      >
        <Button>Cancelar</Button>
        <Button type="submit">Enviar</Button>
      </form>,
    );

    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onSubmit).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Enviar' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('can be focused with the keyboard', async () => {
    const user = userEvent.setup();
    render(<Button>Guardar</Button>);

    await user.tab();

    expect(screen.getByRole('button', { name: 'Guardar' })).toHaveFocus();
  });
});
