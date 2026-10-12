import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const badge = cva(
  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-4 whitespace-nowrap',
  {
    variants: {
      tone: {
        neutral: 'border-line-strong bg-raised text-muted',
        accent: 'border-accent/40 bg-accent/10 text-accent',
        ok: 'border-ok/40 bg-ok/10 text-ok',
        warn: 'border-warn/40 bg-warn/10 text-warn',
        bad: 'border-bad/40 bg-bad/10 text-bad',
        info: 'border-info/40 bg-info/10 text-info',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export type Tone = NonNullable<VariantProps<typeof badge>['tone']>;

export function Badge({ className, tone, ...props }: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badge>) {
  return <span className={cn(badge({ tone }), className)} {...props} />;
}
