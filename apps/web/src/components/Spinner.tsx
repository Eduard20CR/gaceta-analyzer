interface SpinnerProps {
  /** Shown next to the spinning circle. Default "Cargando…". */
  label?: string;
}

/**
 * Loading state. `role="status"` lets screen readers announce the label
 * without interrupting the user.
 */
export function Spinner({ label = 'Cargando…' }: SpinnerProps) {
  return (
    <div role="status" className="spinner">
      {/* Decorative: the label below already says what is happening. */}
      <span className="spinner__circle" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
