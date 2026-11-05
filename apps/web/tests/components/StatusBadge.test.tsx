import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { JobStatus } from '@gaceta/shared';

import { StatusBadge } from '../../src/components/StatusBadge';

describe('StatusBadge', () => {
  it.each<[JobStatus, string]>([
    ['PENDING_UPLOAD', 'Esperando archivo'],
    ['PROCESSING', 'Analizando'],
    ['COMPLETED', 'Completado'],
    ['FAILED', 'Falló'],
  ])('shows %s as "%s"', (status, label) => {
    render(<StatusBadge status={status} />);

    expect(screen.getByText(label)).toBeInTheDocument();
    // The internal status name never reaches the user.
    expect(screen.queryByText(status)).not.toBeInTheDocument();
  });
});
