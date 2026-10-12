import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/controls';
import { Dialog } from '@/components/ui/dialog';
import { Notice, Spinner } from '@/components/ui/layout';
import { api, ApiError, describeError, type Issue } from '@/lib/api';
import type { JsonObject } from '@/lib/json';
import { keys, useActivation, validateConfig } from '@/lib/queries';
import type { Draft, RevisionRow, ValidationResult } from '@/lib/types';
import { DiffView } from './DiffView';
import { IssueList } from './IssueList';

type Check = { state: 'checking' } | { state: 'ok'; result: ValidationResult } | { state: 'invalid'; issues: Issue[] } | { state: 'error'; message: string };

/** Fresh active revision + server-side validation of exactly what would become active. */
function useCheck(open: boolean, run: () => Promise<ValidationResult>) {
  const client = useQueryClient();
  const [check, setCheck] = useState<Check>({ state: 'checking' });
  const [expected, setExpected] = useState<number>(0);
  const start = useCallback(async () => {
    setCheck({ state: 'checking' });
    try {
      const active = await client.fetchQuery({ queryKey: keys.active, queryFn: () => api<RevisionRow | null>('registry/active'), staleTime: 0 });
      setExpected(active?.revision ?? 0);
      setCheck({ state: 'ok', result: await run() });
    } catch (error) {
      if (error instanceof ApiError && error.kind === 'validation') setCheck({ state: 'invalid', issues: error.issues });
      else setCheck({ state: 'error', message: describeError(error) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client]);
  useEffect(() => {
    if (open) void start();
  }, [open, start]);
  return { check, expected, restart: start };
}

function Outcome({ error, onRecheck }: { error: unknown; onRecheck: () => void }) {
  if (!error) return null;
  if (error instanceof ApiError && error.kind === 'conflict') {
    return (
      <Notice tone="bad" title="Konflikt – nichts wurde aktiviert">
        {describeError(error)}
        <div className="mt-2"><Button size="sm" onClick={onRecheck}>Stand neu laden und erneut prüfen</Button></div>
      </Notice>
    );
  }
  if (error instanceof ApiError && error.kind === 'validation') {
    return <Notice tone="bad" title="Der Server hat die Aktivierung abgelehnt"><IssueList issues={error.issues} config={null} /></Notice>;
  }
  return <Notice tone="bad" title="Aktion fehlgeschlagen">{describeError(error)}</Notice>;
}

export function ActivateDialog({ draft, open, onOpenChange }: { draft: Draft; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { activate } = useActivation();
  const [confirmed, setConfirmed] = useState(false);
  const { check, expected, restart } = useCheck(open, () => api<ValidationResult>(`registry/drafts/${encodeURIComponent(draft.draft_id)}/validate`, { method: 'POST', body: {} }));
  const [done, setDone] = useState<RevisionRow | null>(null);
  useEffect(() => {
    if (open) {
      setConfirmed(false);
      setDone(null);
      activate.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const ready = check.state === 'ok' && check.result.valid;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="Registry aktivieren"
      description={`Gespeicherter Draft „${draft.display_name || draft.draft_id}“ (v${draft.draft_version}) wird als neue Revision aktiv.`}
      footer={
        done ? (
          <Button variant="primary" onClick={() => onOpenChange(false)}>Schließen</Button>
        ) : (
          <>
            <Button onClick={() => onOpenChange(false)}>Abbrechen</Button>
            <Button variant="primary" disabled={!ready || !confirmed || activate.isPending} onClick={() => activate.mutate({ draft, expectedActiveRevision: expected }, { onSuccess: setDone })}>
              Jetzt aktivieren
            </Button>
          </>
        )
      }
    >
      {done ? (
        <Notice tone="ok" title={`Revision ${done.revision} ist aktiv`}>
          Prüfsumme {done.checksum.slice(0, 16)}… Die Live-Zustände werden mit der neuen Revision neu veröffentlicht. Die Live-Abnahme in Home Assistant bleibt ein eigener, manueller Schritt.
        </Notice>
      ) : (
        <div className="flex flex-col gap-4">
          <Notice tone="warn" title="Aktivierung ändert den aktiven Zustand">
            Drafts sind bis zu diesem Schritt wirkungslos. Die Aktivierung ersetzt die aktive Registry (aktuell Revision {expected || '–'}) atomar und mit Versionsprüfung; Rücknahme geht nur als neue Revision.
          </Notice>
          {check.state === 'checking' && <Spinner label="Server prüft den gespeicherten Draft …" />}
          {check.state === 'error' && <Notice tone="bad" title="Prüfung nicht möglich">{check.message}</Notice>}
          {check.state === 'invalid' && (
            <>
              <Notice tone="bad" title="Der gespeicherte Draft ist nicht gültig">Aktivieren ist erst nach Korrektur und erneutem Speichern möglich.</Notice>
              <IssueList issues={check.issues} config={draft.config as JsonObject} />
            </>
          )}
          {check.state === 'ok' && check.result.diff && <DiffView diff={check.result.diff} against={`aktive Revision ${expected || '–'}`} />}
          {ready && (
            <Checkbox checked={confirmed} onCheckedChange={setConfirmed} label={<>Ich habe die Auswirkungen geprüft und aktiviere diesen Stand als Revision {expected + 1}.</>} />
          )}
          <Outcome error={activate.error} onRecheck={() => { activate.reset(); setConfirmed(false); void restart(); }} />
        </div>
      )}
    </Dialog>
  );
}

export function RollbackDialog({ revision, open, onOpenChange }: { revision: RevisionRow; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { rollback } = useActivation();
  const [confirmed, setConfirmed] = useState(false);
  const { check, expected, restart } = useCheck(open, () => validateConfig(revision.config));
  const [done, setDone] = useState<RevisionRow | null>(null);
  useEffect(() => {
    if (open) {
      setConfirmed(false);
      setDone(null);
      rollback.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const ready = check.state === 'ok' && check.result.valid;
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={`Auf Revision ${revision.revision} zurückrollen`}
      description="Der historische Stand wird als neue Revision aktiviert; frühere Revisionen bleiben unverändert erhalten."
      footer={
        done ? (
          <Button variant="primary" onClick={() => onOpenChange(false)}>Schließen</Button>
        ) : (
          <>
            <Button onClick={() => onOpenChange(false)}>Abbrechen</Button>
            <Button variant="danger" disabled={!ready || !confirmed || rollback.isPending} onClick={() => rollback.mutate({ revision: revision.revision, expectedActiveRevision: expected }, { onSuccess: setDone })}>
              Zurückrollen
            </Button>
          </>
        )
      }
    >
      {done ? (
        <Notice tone="ok" title={<span className="flex items-center gap-2"><CheckCircle2 size={15} /> Neue Revision {done.revision} aktiv</span>}>Inhalt entspricht Revision {revision.revision}. Gehaltene Zeitkontexte können bei geänderten Fingerprints neu starten.</Notice>
      ) : (
        <div className="flex flex-col gap-4">
          <Notice tone="warn" title="Rollback ändert den aktiven Zustand">Auswirkungen gegenüber der aktuell aktiven Revision {expected || '–'}:</Notice>
          {check.state === 'checking' && <Spinner label="Server analysiert den historischen Stand …" />}
          {check.state === 'error' && <Notice tone="bad" title="Analyse nicht möglich">{check.message}</Notice>}
          {check.state === 'invalid' && (
            <>
              <Notice tone="bad" title="Dieser historische Stand ist unter der aktuellen Software nicht mehr gültig">Er kann nicht zurückgerollt werden.</Notice>
              <IssueList issues={check.issues} config={revision.config as JsonObject} />
            </>
          )}
          {check.state === 'ok' && check.result.diff && <DiffView diff={check.result.diff} against={`aktive Revision ${expected || '–'}`} />}
          {ready && <Checkbox checked={confirmed} onCheckedChange={setConfirmed} label={<>Ich möchte Revision {revision.revision} als neue Revision {expected + 1} aktivieren.</>} />}
          <Outcome error={rollback.error} onRecheck={() => { rollback.reset(); setConfirmed(false); void restart(); }} />
        </div>
      )}
    </Dialog>
  );
}
