import { useId, type InputHTMLAttributes, type ReactNode, type Ref, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const control = 'w-full rounded-[var(--radius-sm)] border border-line-strong bg-sunken px-2.5 text-sm text-fg placeholder:text-faint transition-colors hover:border-faint focus-visible:border-fg disabled:opacity-50 disabled:cursor-not-allowed aria-[invalid=true]:border-bad';

export function Input({ className, ref, ...props }: InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  return <input ref={ref} className={cn(control, 'h-9', className)} {...props} />;
}

export function Textarea({ className, ref, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { ref?: Ref<HTMLTextAreaElement> }) {
  return <textarea ref={ref} className={cn(control, 'min-h-24 py-2 font-mono text-xs', className)} {...props} />;
}

/** Native select: reliable in Firefox, fully keyboard accessible, no extra runtime. */
export function Select({ className, children, ref, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { ref?: Ref<HTMLSelectElement> }) {
  return (
    <select ref={ref} className={cn(control, 'h-9 pr-8', className)} {...props}>
      {children}
    </select>
  );
}

interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  /** Server findings addressed to exactly this field. */
  errors?: { code: string; message: string }[];
  children: (props: { id: string; 'aria-invalid': boolean; 'aria-describedby': string | undefined }) => ReactNode;
  className?: string;
  pointer?: string;
}

/** Label + control + hint + structured server errors at the affected input. */
export function Field({ label, hint, errors = [], children, className, pointer }: FieldProps) {
  const id = useId();
  const describedBy = errors.length || hint ? `${id}-d` : undefined;
  return (
    <div data-field-pointer={pointer} className={cn('flex min-w-0 flex-col gap-1', className)}>
      <label htmlFor={id} className="text-xs font-medium text-muted">
        {label}
      </label>
      {children({ id, 'aria-invalid': errors.length > 0, 'aria-describedby': describedBy })}
      {(errors.length > 0 || hint) && (
        <div id={`${id}-d`} className="flex flex-col gap-0.5">
          {errors.map((error, i) => (
            <p key={i} role="alert" className="text-xs text-bad">
              {error.message}
            </p>
          ))}
          {hint && <p className="text-xs text-faint">{hint}</p>}
        </div>
      )}
    </div>
  );
}
