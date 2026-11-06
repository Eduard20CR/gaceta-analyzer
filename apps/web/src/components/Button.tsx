import type { ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * `primary` for the main action of a page, `secondary` for the rest, and
   * `ghost` (no box until hovered) for quiet actions such as "Cerrar sesión".
   */
  variant?: 'primary' | 'secondary' | 'ghost';
}

/**
 * The app's button. It accepts every prop of a normal <button>.
 *
 * `type` defaults to "button": a plain <button> inside a form defaults to
 * "submit", which would send the form by accident. Pass `type="submit"` when
 * that is what you want.
 */
export function Button({
  variant = 'primary',
  type = 'button',
  className,
  ...buttonProps
}: ButtonProps) {
  const classNames = ['button', `button--${variant}`];
  if (className !== undefined) {
    classNames.push(className);
  }

  return (
    <button type={type} className={classNames.join(' ')} {...buttonProps} />
  );
}
