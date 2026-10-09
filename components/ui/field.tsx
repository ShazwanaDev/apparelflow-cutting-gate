import type { ReactNode } from 'react';

/**
 * A labelled form control with a hint and an inline error. The error is linked
 * with aria-describedby and announced, and the control is marked aria-invalid,
 * so the message reaches screen readers as well as sighted users.
 */
export function Field({
  id,
  label,
  hint,
  error,
  required,
  children,
  className = '',
}: {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  children: (props: { id: string; 'aria-invalid': boolean; 'aria-describedby': string | undefined; required?: boolean }) => ReactNode;
  className?: string;
}) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
        {required && (
          <span aria-hidden className="ml-0.5 text-shortage">
            *
          </span>
        )}
      </label>
      {children({ id, 'aria-invalid': Boolean(error), 'aria-describedby': describedBy, required })}
      {error ? (
        <p id={errorId} role="alert" className="text-sm font-medium text-shortage">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
