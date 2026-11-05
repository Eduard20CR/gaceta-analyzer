import { Button } from './Button';

interface ErrorMessageProps {
  /** In Spanish, and saying what to do (NFR-UX-04), for example "No se pudo cargar. Intente de nuevo." */
  message: string;
  /** Optional button next to the message, for example "Reintentar". */
  action?: {
    label: string;
    onClick: () => void;
  };
}

/**
 * An error box. `role="alert"` makes screen readers announce it as soon as it
 * appears, so the user notices the error even without seeing it.
 */
export function ErrorMessage({ message, action }: ErrorMessageProps) {
  return (
    <div role="alert" className="error-message">
      <p className="error-message__text">{message}</p>
      {action !== undefined && (
        <Button variant="secondary" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
