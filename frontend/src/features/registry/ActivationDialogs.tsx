import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/controls';
import { Dialog } from '@/components/ui/dialog';
import { Notice, Spinner } from '@/components/ui/layout';
import { api, ApiError, describeError, type Issue } from '@/lib/api';
import type { JsonObject } from '@/lib/json';
import { useLive } from '@/lib/live-context';
import { keys, useActivation, validateConfig } from '@/lib/queries';
import type { Draft, RevisionRow, ValidationResult } from '@/lib/types';
import { DiffView } from './DiffView';
import { IssueList } from './IssueList';

type Check =
  | { state: 'checking' }
  | { state: 'ok'; result: ValidationResult }
  | { state: 'invalid'; issues: Issue[] }
  | { state: 'stale'; message: string }
  | { state: 'error'; message: string };

class StaleSubject extends Error {}

/**
 * Checks exactly one subject (draft id + saved version, or a revision). A result and
 * any confirmation belong to that subject and to the active revision they were computed
 * against: when either changes, the check restarts and the old result is discarded.
 * `run` is read through a ref, so it always validates the *current* subject without
 * making the restart depend on callback identity (no re-check loops).
 */
function useCheck(open: boolean, subject: string, run: () => Promise<ValidationResult>) {
  const client = useQueryClient();
  const live = useLive();
  const runRef = useRef(run);
  runRef.current = run;
  const ticket = useRef(0);
  const [state, setState] = useState<{ subject: string; check: Check; expected: number }>({ subject, check: { state: 'checking' }, expected: 0 });

  const start = useCallback(async () => {
    const mine = ++ticket.current;
    const runCandidate = runRef.current;
    setState({ subject, check: { state: 'checking' }, expected: 0 });
    let outcome: Check;
    let expected = 0;
    try {
      const active = await client.fetchQuery({ queryKey: keys.active, queryFn: () => api<RevisionRow | null>('registry/active'), staleTime: 0 });
      if (mine !== ticket.current) return;
      expected = active?.revision ?? 0;
      const result = await runCandidate();
      const after = await api<RevisionRow | null>('registry/active');
      if ((after?.revision ?? 0) !== expected) throw new StaleSubject('Die aktive Revision hat sich während der Prüfung geändert. Erneut prüfen.');
      outcome = { state: 'ok', result };
    } catch (error) {
      if (error instanceof StaleSubject) outcome = { state: 'stale', message: error.message };
      else if (error instanceof ApiError && error.kind === 'validation') outcome = { state: 'invalid', issues: error.issues };
      else outcome = { state: 'error', message: describeError(error) };
    }
    if (mine === ticket.current) setState({ subject, check: outcome, expected });
  }, [client, subject]);

  useEffect(() => {
    if (open) void start();
    else ticket.current += 1; // a closed dialog keeps no result
  }, [open, start]);

  // A result computed for another subject is never shown or confirmable.
  const current = state.subject === subject;
  const base: Check = current ? state.check : { state: 'checking' };
  const expected = current ? state.expected : 0;
  // The active revision moved while the dialog was open: the diff no longer describes the change.
  const moved = open && current && base.state === 'ok' && live.registryRevision !== null && live.registryRevision !== expected;
  const check: Check = moved ? { state: 'stale', message: `Die aktive Revision ist inzwischen ${live.registryRevision} (geprüft gegen ${expected}).` } : base;
  return { check, expected, restart: start, key: `${subject}@${expected}` };
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

function StaleNotice({ message, onRecheck }: { message: string; onRecheck: () => void }) {
  return (
    <Notice tone="warn" title="Prüfergebnis veraltet">
      {message}
      <div className="mt-2"><Button size="sm" onClick={onRecheck}>Erneut prüfen</Button></div>
    </Notice>
  );
}

export function ActivateDialog({ draft, open, onOpenChange }: { draft: Draft; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { activate } = useActivation();
  const subject = `draft:${draft.draft_id}@${draft.draft_version}`;
  const { check, expected, restart, key } = useCheck(open, subject, async () => {
    // The saved draft on the server must still be the very version the user is about to activate.
    const saved = await api<Draft>(`registry/drafts/${encodeURIComponent(draft.draft_id)}`);
    if (saved.draft_version !== draft.draft_version) {
      throw new StaleSubject(`Der Draft wurde zwischenzeitlich auf v${saved.draft_version} geändert (geöffnet: v${draft.draft_version}). Neu laden und erneut prüfen.`);
    }
    const result = await api<ValidationResult>(`registry/drafts/${encodeURIComponent(draft.draft_id)}/validate`, { method: 'POST', body: {} });
    const after = await api<Draft>(`registry/drafts/${encodeURIComponent(draft.draft_id)}`);
    if (after.draft_version !== saved.draft_version) throw new StaleSubject('Der Draft hat sich während der Prüfung geändert. Neu laden und erneut prüfen.');
    return result;
  });
  const [confirmedFor, setConfirmedFor] = useState<string | null>(null);
  const [done, setDone] = useState<{ subject: string; revision: RevisionRow } | null>(null);
  // Confirmation is valid only for the exact (draft, version, active revision) that was checked.
  const confirmed = confirmedFor === key;
  const result = done?.subject === subject ? done.revision : null;
  useEffect(() => {
    setConfirmedFor(null);
    setDone(null);
    activate.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, subject]);
  const ready = check.state === 'ok' && check.result.valid && !activate.error;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="Registry aktivieren"
      description={`Gespeicherter Draft „${draft.display_name || draft.draft_id}“ (v${draft.draft_version}) wird als neue Revision aktiv.`}
      footer={
        result ? (
          <Button variant="primary" onClick={() => onOpenChange(false)}>Schließen</Button>
        ) : (
          <>
            <Button onClick={() => onOpenChange(false)}>Abbrechen</Button>
            <Button
              variant="primary"
              disabled={!ready || !confirmed || activate.isPending}
              onClick={() => activate.mutate({ draft, expectedActiveRevision: expected }, { onSuccess: (revision) => setDone({ subject, revision }) })}
            >
              Jetzt aktivieren
            </Button>
          </>
        )
      }
    >
      {result ? (
        <Notice tone="ok" title={`Revision ${result.revision} ist aktiv`}>
          Prüfsumme {result.checksum.slice(0, 16)}… Die Live-Zustände werden mit der neuen Revision neu veröffentlicht. Die Live-Abnahme in Home Assistant bleibt ein eigener, manueller Schritt.
        </Notice>
      ) : (
        <div className="flex flex-col gap-4">
          <Notice tone="warn" title="Aktivierung ändert den aktiven Zustand">
            Drafts sind bis zu diesem Schritt wirkungslos. Die Aktivierung ersetzt die aktive Registry (aktuell Revision {expected || '–'}) atomar und mit Versionsprüfung; Rücknahme geht nur als neue Revision.
          </Notice>
          {check.state === 'checking' && <Spinner label="Server prüft den gespeicherten Draft …" />}
          {check.state === 'error' && <Notice tone="bad" title="Prüfung nicht möglich">{check.message}</Notice>}
          {check.state === 'stale' && <StaleNotice message={check.message} onRecheck={() => { setConfirmedFor(null); void restart(); }} />}
          {check.state === 'invalid' && (
            <>
              <Notice tone="bad" title="Der gespeicherte Draft ist nicht gültig">Aktivieren ist erst nach Korrektur und erneutem Speichern möglich.</Notice>
              <IssueList issues={check.issues} config={draft.config as JsonObject} />
            </>
          )}
          {check.state === 'ok' && check.result.diff && <DiffView diff={check.result.diff} against={`aktive Revision ${expected || '–'}`} />}
          {ready && (
            <Checkbox
              checked={confirmed}
              onCheckedChange={(on) => setConfirmedFor(on ? key : null)}
              label={<>Ich habe die Auswirkungen geprüft und aktiviere diesen Stand als Revision {expected + 1}.</>}
            />
          )}
          <Outcome error={activate.error} onRecheck={() => { activate.reset(); setConfirmedFor(null); void restart(); }} />
        </div>
      )}
    </Dialog>
  );
}

export function RollbackDialog({ revision, open, onOpenChange }: { revision: RevisionRow; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { rollback } = useActivation();
  const subject = `revision:${revision.revision}:${revision.checksum}`;
  const { check, expected, restart, key } = useCheck(open, subject, () => validateConfig(revision.config));
  const [confirmedFor, setConfirmedFor] = useState<string | null>(null);
  const [done, setDone] = useState<{ subject: string; revision: RevisionRow } | null>(null);
  const confirmed = confirmedFor === key;
  const result = done?.subject === subject ? done.revision : null;
  useEffect(() => {
    setConfirmedFor(null);
    setDone(null);
    rollback.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, subject]);
  const ready = check.state === 'ok' && check.result.valid && !rollback.error;
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={`Auf Revision ${revision.revision} zurückrollen`}
      description="Der historische Stand wird als neue Revision aktiviert; frühere Revisionen bleiben unverändert erhalten."
      footer={
        result ? (
          <Button variant="primary" onClick={() => onOpenChange(false)}>Schließen</Button>
        ) : (
          <>
            <Button onClick={() => onOpenChange(false)}>Abbrechen</Button>
            <Button
              variant="danger"
              disabled={!ready || !confirmed || rollback.isPending}
              onClick={() => rollback.mutate({ revision: revision.revision, expectedActiveRevision: expected }, { onSuccess: (r) => setDone({ subject, revision: r }) })}
            >
              Zurückrollen
            </Button>
          </>
        )
      }
    >
      {result ? (
        <Notice tone="ok" title={<span className="flex items-center gap-2"><CheckCircle2 size={15} /> Neue Revision {result.revision} aktiv</span>}>
          Inhalt entspricht Revision {revision.revision}. Gehaltene Zeitkontexte können bei geänderten Fingerprints neu starten.
        </Notice>
      ) : (
        <div className="flex flex-col gap-4">
          <Notice tone="warn" title="Rollback ändert den aktiven Zustand">Auswirkungen gegenüber der aktuell aktiven Revision {expected || '–'}:</Notice>
          {check.state === 'checking' && <Spinner label="Server analysiert den historischen Stand …" />}
          {check.state === 'error' && <Notice tone="bad" title="Analyse nicht möglich">{check.message}</Notice>}
          {check.state === 'stale' && <StaleNotice message={check.message} onRecheck={() => { setConfirmedFor(null); void restart(); }} />}
          {check.state === 'invalid' && (
            <>
              <Notice tone="bad" title="Dieser historische Stand ist unter der aktuellen Software nicht mehr gültig">Er kann nicht zurückgerollt werden.</Notice>
              <IssueList issues={check.issues} config={revision.config as JsonObject} />
            </>
          )}
          {check.state === 'ok' && check.result.diff && <DiffView diff={check.result.diff} against={`aktive Revision ${expected || '–'}`} />}
          {ready && (
            <Checkbox checked={confirmed} onCheckedChange={(on) => setConfirmedFor(on ? key : null)} label={<>Ich möchte Revision {revision.revision} als neue Revision {expected + 1} aktivieren.</>} />
          )}
          <Outcome error={rollback.error} onRecheck={() => { rollback.reset(); setConfirmedFor(null); void restart(); }} />
        </div>
      )}
    </Dialog>
  );
}
