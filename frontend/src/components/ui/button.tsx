import { cva, type VariantProps } from 'class-variance-authority';
import type { ButtonHTMLAttributes, Ref } from 'react';
import { cn } from '@/lib/utils';

export const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-sm)] border text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-45 cursor-pointer select-none',
  {
    variants: {
      variant: {
        primary:
          'border-accent-strong bg-accent text-accent-fg hover:bg-accent-strong hover:border-accent',
        secondary: 'border-line-strong bg-raised text-fg hover:border-accent/60 hover:bg-line',
        ghost: 'border-transparent bg-transparent text-muted hover:bg-raised hover:text-fg',
        danger: 'border-bad/60 bg-bad/10 text-bad hover:bg-bad/20',
        outline: 'border-line-strong bg-transparent text-fg hover:border-accent/60',
      },
      size: {
        sm: 'h-7 px-2.5 text-xs',
        md: 'h-9 px-3.5',
        lg: 'h-10 px-5',
        icon: 'h-8 w-8 p-0',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  ref?: Ref<HTMLButtonElement>;
}

export function Button({ className, variant, size, type = 'button', ref, ...props }: ButtonProps) {
  return (
    <button ref={ref} type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  );
}
