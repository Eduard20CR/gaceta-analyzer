import type { ReactNode } from 'react';

/** Props that connect an input to its label, hint and error. */
export interface FormFieldInputProps {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
}

interface FormFieldProps {
  /** The input's id; the label points at it. */
  id: string;
  label: string;
  /** Help text under the label, always visible. */
  hint?: string | undefined;
  /** Spanish message shown under the input when the value is not valid. */
  error?: string | undefined;
  /**
   * Renders the input. It receives the props that link it to the label, the
   * hint and the error, so screen readers read all three; spread them on the
   * input: `{(inputProps) => <input {...inputProps} />}`.
   */
  children: (inputProps: FormFieldInputProps) => ReactNode;
}

/** A form field: label, optional hint, the input, and its error if any. */
export function FormField({
  id,
  label,
  hint,
  error,
  children,
}: FormFieldProps) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  const describedBy: string[] = [];
  if (hint !== undefined) {
    describedBy.push(hintId);
  }
  if (error !== undefined) {
    describedBy.push(errorId);
  }

  const inputProps: FormFieldInputProps = { id };
  if (describedBy.length > 0) {
    inputProps['aria-describedby'] = describedBy.join(' ');
  }
  if (error !== undefined) {
    inputProps['aria-invalid'] = true;
  }

  return (
    <div className="form-field">
      <label htmlFor={id} className="form-field__label">
        {label}
      </label>
      {hint !== undefined && (
        <p id={hintId} className="form-field__hint">
          {hint}
        </p>
      )}
      {children(inputProps)}
      {error !== undefined && (
        <p id={errorId} className="form-field__error">
          {error}
        </p>
      )}
    </div>
  );
}
