import { t as uiText } from '@/i18n';
import { AlertDialog } from '@base-ui/react/alert-dialog';
import { Dialog as BaseDialog } from '@base-ui/react/dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Button } from './button';

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'md' | 'lg' | 'xl';
}

const widths = { md: 'max-w-lg', lg: 'max-w-3xl', xl: 'max-w-6xl' };

export function Dialog({ open, onOpenChange, title, description, children, footer, size = 'md' }: DialogProps) {
  return (
    <BaseDialog.Root open={open} onOpenChange={onOpenChange}>
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className="popup-anim fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px]" />
        <BaseDialog.Popup
          className={cn(
            'popup-anim fixed left-1/2 top-1/2 z-50 flex max-h-[88vh] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-[var(--radius-lg)] bg-panel shadow-pop',
            widths[size],
          )}
        >
          <header className="flex shrink-0 items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div className="min-w-0">
              <BaseDialog.Title className="text-base font-semibold">{title}</BaseDialog.Title>
              {description && (
                <BaseDialog.Description className="mt-1 text-sm text-muted">{description}</BaseDialog.Description>
              )}
            </div>
            <BaseDialog.Close render={<Button variant="ghost" size="icon" aria-label={uiText("components.ui.dialog.schlie_en_b808f6")} />}>
              <X size={16} />
            </BaseDialog.Close>
          </header>
          <div className="min-h-0 flex-1 overflow-auto px-5 py-4">{children}</div>
          {footer && <footer className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-line bg-panel px-5 py-3">{footer}</footer>}
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}

interface ConfirmProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description: ReactNode;
  confirmLabel: string;
  tone?: 'primary' | 'danger';
  busy?: boolean;
  onConfirm: () => void;
  children?: ReactNode;
  confirmDisabled?: boolean;
}

/** Explicit confirmation dialog: the default focus is on "Abbrechen", never on the action. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  tone = 'primary',
  busy,
  onConfirm,
  children,
  confirmDisabled,
}: ConfirmProps) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="popup-anim fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px]" />
        <AlertDialog.Popup className="popup-anim fixed left-1/2 top-1/2 z-50 flex max-h-[88vh] w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 flex-col rounded-[var(--radius-lg)] bg-panel shadow-pop">
          <div className="min-h-0 flex-1 overflow-auto px-5 pb-2 pt-5">
            <AlertDialog.Title className="text-base font-semibold">{title}</AlertDialog.Title>
            <AlertDialog.Description render={<div />} className="mt-2 text-sm text-muted">
              {description}
            </AlertDialog.Description>
            {children && <div className="mt-3">{children}</div>}
          </div>
          <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
            <AlertDialog.Close render={<Button variant="secondary" />} autoFocus>
              {uiText("components.ui.dialog.abbrechen_f7ff11")}</AlertDialog.Close>
            <Button variant={tone === 'danger' ? 'danger' : 'primary'} disabled={busy || confirmDisabled} onClick={onConfirm}>
              {confirmLabel}
            </Button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
