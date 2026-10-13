import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LayoutPanel, PanelLayout } from '@/components/PanelLayout';
import { Send } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Field, Select } from '@/components/ui/form';
import { Empty, KeyValue, Notice, Panel, PanelHeader, Spinner } from '@/components/ui/layout';
import { SchemaForm } from '@/editors/SchemaForm';
import { TypedValueEditor } from '@/editors/common';
import { defaultLiteralValue, asObject, str, type FieldSchema } from '@/features/authoring/model';
import { api, describeError } from '@/lib/api';
import type { TypeDescription } from '@/lib/capabilities';
import { isObject, type Json, type JsonObject } from '@/lib/json';
import { useLive } from '@/lib/live-context';
import { keys, useActiveExport, useCapabilities } from '@/lib/queries';
import type { CommandResult, Info } from '@/lib/types';
import { uuid } from '@/lib/uuid';

interface CommandSpec {
  name: string;
  /** Declarative: typed arguments; package types: JSON Schema. */
  fields?: Record<string, FieldSchema>;
  schema?: JsonObject;
}

function commandsOf(type: TypeDescription | undefined): CommandSpec[] {
  if (!type) return [];
  const machine = type.definition && isObject(type.definition.machine) ? type.definition.machine : null;
  const declared = machine && isObject(machine.commands) ? machine.commands : null;
  if (declared) {
    return Object.entries(declared).map(([name, c]) => ({ name, fields: asObject(asObject(c).arguments) as Record<string, FieldSchema> }));
  }
  return Object.entries(type.commands ?? {}).map(([name, schema]) => ({ name, schema }));
}

const RESULT_TONE: Record<string, 'ok' | 'bad' | 'warn' | 'neutral'> = { accepted: 'ok', rejected: 'bad', expired: 'warn', not_supported: 'warn', command_id_conflict: 'bad' };
const RESULT_TEXT: Record<string, string> = {
  accepted: 'Angenommen: Die Transition wurde ausgeführt.',
  rejected: 'Abgelehnt.',
  expired: 'Abgelaufen: die Gültigkeit endete vor der Verarbeitung.',
  not_supported: 'Nicht unterstützt: der Contract kennt diesen Befehl nicht.',
  command_id_conflict: 'Command-ID-Konflikt: dieselbe ID wurde mit anderem Inhalt verwendet.',
};

/**
 * Typed commands for contracts of the *active* registry. A command only requests
 * a named, guarded transition; the server decides. The command id is stable, so a
 * lost response can be recovered by asking for the stored result (no blind retry).
 */
export function CommandsPanel({ contractId, onContract }: { contractId: string; onContract: (id: string) => void }) {
  const caps = useCapabilities();
  const active = useActiveExport();
  const live = useLive();
  const client = useQueryClient();
  const contracts = useMemo(() => (Array.isArray(active.data?.contracts) ? (active.data!.contracts as JsonObject[]) : []), [active.data]);
  const eligible = contracts.filter((c) => c.enabled !== false && commandsOf(caps.data?.types.find((t) => t.type_id === c.type_id && t.type_version === c.type_version)).length > 0);
  const contract = eligible.find((c) => str(c.contract_id) === contractId) ?? null;
  const type = contract ? caps.data?.types.find((t) => t.type_id === contract.type_id && t.type_version === contract.type_version) : undefined;
  const commands = commandsOf(type);
  const [commandName, setCommandName] = useState('');
  const [args, setArgs] = useState<JsonObject>({});
  const [confirming, setConfirming] = useState(false);
  const [sent, setSent] = useState<{ id: string; result: CommandResult | null; error: string | null } | null>(null);
  const spec = commands.find((c) => c.name === commandName) ?? commands[0];

  useEffect(() => {
    setCommandName(commands[0]?.name ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractId, caps.data]);
  useEffect(() => {
    if (!spec) return setArgs({});
    setArgs(spec.fields ? Object.fromEntries(Object.entries(spec.fields).map(([n, f]) => [n, defaultLiteralValue(f)])) : {});
    setSent(null);
  }, [spec?.name, contractId]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = useMutation({
    retry: false,
    mutationFn: async () => {
      const id = uuid();
      setSent({ id, result: null, error: null });
      // Use the server clock: issued_at must not be in the server's future; valid_until is exclusive.
      const info = await client.fetchQuery({ queryKey: keys.info, queryFn: () => api<Info>('info'), staleTime: 0 });
      const issued = new Date(info.server_time).getTime();
      const body: JsonObject = {
        command_id: id,
        contract_id: contractId,
        command: spec!.name,
        args,
        origin: { kind: 'workbench', actor: 'admin', client_name: 'Terra Workbench' },
        issued_at: new Date(issued).toISOString(),
        valid_until: new Date(issued + 30_000).toISOString(),
        ...(live.registryRevision ? { expected_registry_revision: live.registryRevision } : {}),
      };
      return { id, result: await api<CommandResult>('commands', { method: 'POST', body }) };
    },
    onSuccess: ({ id, result }) => setSent({ id, result, error: null }),
    onError: (error) => setSent((s) => (s ? { ...s, error: describeError(error) } : s)),
  });

  const recover = useMutation({
    mutationFn: (id: string) => api<CommandResult>(`commands/${encodeURIComponent(id)}`),
    onSuccess: (result) => setSent((s) => (s ? { ...s, result, error: null } : s)),
    onError: (error) => setSent((s) => (s ? { ...s, error: `Kein gespeichertes Ergebnis: ${describeError(error)}` } : s)),
  });

  if (active.isPending || caps.isPending) return <Spinner />;
  if (eligible.length === 0) return <Empty title="Keine Commands verfügbar">Commands gibt es nur für aktivierte Contracts, deren Typ Befehle deklariert (z. B. eine State Machine mit Befehlen).</Empty>;

  return (
    <><PanelLayout view="diagnostics.commands"><LayoutPanel id="command" title="Command" span={2}>
      <Panel>
        <PanelHeader title="Command" description="Nur für die aktive Registry. Ein Command fordert eine benannte Transition an; es gibt kein direktes Setzen von Werten." />
        <div className="flex flex-col gap-4 p-4">
          <Field label="Contract">
            {(p) => (
              <Select {...p} value={contract ? contractId : ''} onChange={(e) => onContract(e.target.value)}>
                <option value="">— wählen —</option>
                {eligible.map((c) => <option key={str(c.contract_id)} value={str(c.contract_id)}>{str(c.contract_id)}</option>)}
              </Select>
            )}
          </Field>
          {contract && spec && (
            <>
              <Field label="Befehl">{(p) => <Select {...p} value={spec.name} onChange={(e) => setCommandName(e.target.value)}>{commands.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}</Select>}</Field>
              {spec.fields && Object.keys(spec.fields).length > 0 && (
                <fieldset className="flex flex-col gap-3">
                  <legend className="mb-1 text-xs font-medium text-muted">Argumente (typisiert)</legend>
                  {Object.entries(spec.fields).map(([name, schema]) => (
                    <TypedValueEditor key={name} label={`${name}${schema.required ? ' *' : ''}`} schema={schema} pointer={`/args/${name}`} value={(args[name] ?? null) as Json} onChange={(v) => setArgs({ ...args, [name]: v })} />
                  ))}
                </fieldset>
              )}
              {spec.schema && <SchemaForm root={spec.schema} node={spec.schema} value={args} pointer="/args" onChange={(v) => setArgs(isObject(v) ? v : {})} />}
              {spec.fields && Object.keys(spec.fields).length === 0 && <p className="text-xs text-muted">Dieser Befehl hat keine Argumente.</p>}
              <div>
                <Button variant="primary" disabled={send.isPending} onClick={() => setConfirming(true)}><Send size={14} /> Command senden …</Button>
              </div>
            </>
          )}
        </div>
      </Panel>
      </LayoutPanel><LayoutPanel id="result" title="Ergebnis" span={1}><Panel>
        <PanelHeader title="Ergebnis" />
        <div className="flex flex-col gap-3 p-4">
          {!sent && <p className="text-sm text-muted">Noch kein Command gesendet.</p>}
          {sent && !sent.result && !sent.error && <Spinner label="Warte auf die Antwort …" />}
          {sent?.result && (
            <Notice tone={RESULT_TONE[String(sent.result.status)] === 'ok' ? 'ok' : RESULT_TONE[String(sent.result.status)] === 'bad' ? 'bad' : 'warn'} title={<span className="flex items-center gap-2"><Badge tone={RESULT_TONE[String(sent.result.status)] ?? 'neutral'}>{String(sent.result.status)}</Badge>{sent.result.reason ? <Badge>{String(sent.result.reason)}</Badge> : null}</span>}>
              {RESULT_TEXT[String(sent.result.status)] ?? ''}
            </Notice>
          )}
          {sent?.error && (
            <Notice tone="warn" title="Antwort unbekannt">
              {sent.error} Der Command kann trotzdem verarbeitet worden sein. Nicht erneut senden – stattdessen das gespeicherte Ergebnis dieser ID abfragen.
              <div className="mt-2"><Button size="sm" disabled={recover.isPending} onClick={() => recover.mutate(sent.id)}>Gespeichertes Ergebnis abfragen</Button></div>
            </Notice>
          )}
          {sent && <KeyValue items={[{ label: 'Command-ID', value: <code className="break-all text-xs">{sent.id}</code> }]} />}
        </div>
      </Panel>
      </LayoutPanel></PanelLayout><ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Command wirklich senden?"
        description={<>„{spec?.name}“ wird an <code>{contractId}</code> gesendet. Das ist eine Aktion am laufenden System: Wenn der Guard es erlaubt, wechselt die State Machine ihren Zustand.</>}
        confirmLabel="Senden"
        busy={send.isPending}
        onConfirm={() => {
          setConfirming(false);
          send.mutate();
        }}
      />
    </>
  );
}
