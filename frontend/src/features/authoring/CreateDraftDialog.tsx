import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input, Textarea } from '@/components/ui/form';
import { Notice } from '@/components/ui/layout';
import { Field } from '@/components/ui/form';
import { describeError } from '@/lib/api';
import { clone } from '@/lib/json';
import { useActiveExport, useDraftMutations } from '@/lib/queries';
import type { Draft, Registry } from '@/lib/types';
import { emptyRegistry } from './model';
import { parseRegistryJson } from './importExport';
import { useWorkingDocument } from './WorkingDocument';

type Origin = 'empty' | 'active' | 'import' | 'copy';

/**
 * Creating a draft never touches live state. A draft can start empty, from the
 * active registry, from an imported file/text, or as a copy of another draft.
 */
export function CreateDraftDialog({
  open,
  onOpenChange,
  copyOf,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  copyOf?: { config: Registry; name: string };
  onCreated?: (draft: Draft) => void;
}) {
  const { create } = useDraftMutations();
  const active = useActiveExport();
  const doc = useWorkingDocument();
  const [origin, setOrigin] = useState<Origin>(copyOf ? 'copy' : 'empty');
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setOrigin(copyOf ? 'copy' : active.data ? 'active' : 'empty');
    setName(copyOf ? `${copyOf.name} (Kopie)` : '');
    setText('');
    setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const submit = async () => {
    setError('');
    let config: Registry;
    let display = name.trim();
    if (origin === 'empty') config = emptyRegistry();
    else if (origin === 'active') config = clone(active.data ?? emptyRegistry());
    else if (origin === 'copy' && copyOf) config = clone(copyOf.config);
    else {
      const parsed = parseRegistryJson(text);
      if (!parsed.ok) return setError(parsed.error);
      config = parsed.config;
      display ||= parsed.display_name ?? '';
    }
    try {
      const draft = await create.mutateAsync({ config, ...(display ? { display_name: display } : {}) });
      doc.open(draft);
      onCreated?.(draft);
      onOpenChange(false);
    } catch (e) {
      setError(describeError(e));
    }
  };

  const options: { value: Origin; label: string; hint: string; disabled?: boolean }[] = [
    { value: 'empty', label: 'Leere Registry', hint: 'Von Grund auf neu aufbauen (fingerprint_version 2 für deklarative Definitionen).' },
    { value: 'active', label: 'Kopie der aktiven Registry', hint: active.data ? 'Bestehende Konfiguration weiterentwickeln.' : 'Es ist keine Registry aktiv.', disabled: !active.data },
    { value: 'import', label: 'Import (JSON)', hint: 'Datei oder Text; wird wie jeder Draft validiert und ist danach vollständig grafisch bearbeitbar.' },
    ...(copyOf ? [{ value: 'copy' as Origin, label: `Kopie von „${copyOf.name}“`, hint: 'Duplikat dieses Drafts.' }] : []),
  ];

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Neuer Draft"
      description="Ein Draft ist niemals live. Erst die ausdrückliche Aktivierung einer validierten Revision verändert den aktiven Zustand."
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button variant="primary" disabled={create.isPending || (origin === 'import' && !text.trim())} onClick={submit}>
            Draft anlegen
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Name (optional)">{(p) => <Input {...p} value={name} maxLength={256} onChange={(e) => setName(e.target.value)} placeholder="z. B. Licht-Umbau" />}</Field>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-xs font-medium text-muted">Ausgangspunkt</legend>
          {options.map((option) => (
            <label key={option.value} className={`flex cursor-pointer items-start gap-2.5 rounded-[var(--radius-md)] border p-3 text-sm ${origin === option.value ? 'border-accent/60 bg-accent/5' : 'border-line'} ${option.disabled ? 'opacity-50' : ''}`}>
              <input type="radio" name="origin" className="mt-1 accent-[var(--color-accent)]" disabled={option.disabled} checked={origin === option.value} onChange={() => setOrigin(option.value)} />
              <span>
                <span className="font-medium">{option.label}</span>
                <span className="block text-xs text-muted">{option.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
        {origin === 'import' && (
          <div className="flex flex-col gap-2">
            <Field label="Registry-Datei (.json)">
              {(p) => (
                <input
                  {...p}
                  type="file"
                  accept="application/json,.json"
                  className="text-sm file:mr-3 file:cursor-pointer file:rounded-[var(--radius-sm)] file:border file:border-line-strong file:bg-raised file:px-3 file:py-1.5 file:text-fg"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) setText(await file.text());
                  }}
                />
              )}
            </Field>
            <Field label="oder JSON einfügen">{(p) => <Textarea {...p} rows={8} spellCheck={false} value={text} onChange={(e) => setText(e.target.value)} />}</Field>
          </div>
        )}
        {error && <Notice tone="bad" title="Draft konnte nicht angelegt werden">{error}</Notice>}
      </div>
    </Dialog>
  );
}
