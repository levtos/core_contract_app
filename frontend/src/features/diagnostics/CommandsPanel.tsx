import { codeLabel, reasonLabel } from '@/i18n/codes';
import { t as uiText } from '@/i18n';
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
  accepted: uiText("features.diagnostics.CommandsPanel.angenommen_die_transition_wurde_ausgefuhrt_833e56"),
  rejected: uiText("features.diagnostics.CommandsPanel.abgelehnt_34b49d"),
  expired: uiText("features.diagnostics.CommandsPanel.abgelaufen_die_gultigkeit_endete_vor_der_verarbe_7e9bc2"),
  not_supported: uiText("features.diagnostics.CommandsPanel.nicht_unterstutzt_der_contract_kennt_diesen_befe_51e577"),
  command_id_conflict: uiText("features.diagnostics.CommandsPanel.command_id_konflikt_dieselbe_id_wurde_mit_andere_d2b1a5"),
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
        origin: { kind: 'workbench', actor: 'admin', client_name: 'terra-workbench' },
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
    onError: (error) => setSent((s) => (s ? { ...s, error: uiText("features.diagnostics.CommandsPanel.kein_gespeichertes_ergebnis_v0_f20069", { v0: (describeError(error)) }) } : s)),
  });

  if (active.isPending || caps.isPending) return <Spinner />;
  if (eligible.length === 0) return <Empty title={uiText("features.diagnostics.CommandsPanel.keine_commands_verfugbar_7e30a7")}>{uiText("features.diagnostics.CommandsPanel.commands_gibt_es_nur_fur_aktivierte_contracts_de_eced61")}</Empty>;

  return (
    <><PanelLayout view="diagnostics.commands"><LayoutPanel id="command" title={uiText("features.diagnostics.CommandsPanel.command_713166")} span={2}>
      <Panel>
        <PanelHeader title={uiText("features.diagnostics.CommandsPanel.command_713166")} description={uiText("features.diagnostics.CommandsPanel.nur_fur_die_aktive_registry_ein_command_fordert__3a3fc2")} />
        <div className="flex flex-col gap-4 p-4">
          <Field label={uiText("features.diagnostics.CommandsPanel.contract_a6f5b0")}>
            {(p) => (
              <Select {...p} value={contract ? contractId : ''} onChange={(e) => onContract(e.target.value)}>
                <option value="">{uiText("features.diagnostics.CommandsPanel.wahlen_602246")}</option>
                {eligible.map((c) => <option key={str(c.contract_id)} value={str(c.contract_id)}>{str(c.contract_id)}</option>)}
              </Select>
            )}
          </Field>
          {contract && spec && (
            <>
              <Field label={uiText("features.diagnostics.CommandsPanel.befehl_c8505b")}>{(p) => <Select {...p} value={spec.name} onChange={(e) => setCommandName(e.target.value)}>{commands.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}</Select>}</Field>
              {spec.fields && Object.keys(spec.fields).length > 0 && (
                <fieldset className="flex flex-col gap-3">
                  <legend className="mb-1 text-xs font-medium text-muted">{uiText("features.diagnostics.CommandsPanel.argumente_typisiert_b6a75c")}</legend>
                  {Object.entries(spec.fields).map(([name, schema]) => (
                    <TypedValueEditor key={name} label={uiText("features.diagnostics.CommandsPanel.v0_v1_63ec26", { v0: (name), v1: (schema.required ? ' *' : '') })} schema={schema} pointer={`/args/${name}`} value={(args[name] ?? null) as Json} onChange={(v) => setArgs({ ...args, [name]: v })} />
                  ))}
                </fieldset>
              )}
              {spec.schema && <SchemaForm root={spec.schema} node={spec.schema} value={args} pointer="/args" onChange={(v) => setArgs(isObject(v) ? v : {})} />}
              {spec.fields && Object.keys(spec.fields).length === 0 && <p className="text-xs text-muted">{uiText("features.diagnostics.CommandsPanel.dieser_befehl_hat_keine_argumente_cc8092")}</p>}
              <div>
                <Button variant="primary" disabled={send.isPending} onClick={() => setConfirming(true)}><Send size={14} /> {uiText("features.diagnostics.CommandsPanel.command_senden_8e5910")}</Button>
              </div>
            </>
          )}
        </div>
      </Panel>
      </LayoutPanel><LayoutPanel id="result" title={uiText("features.diagnostics.CommandsPanel.ergebnis_cd8e22")} span={1}><Panel>
        <PanelHeader title={uiText("features.diagnostics.CommandsPanel.ergebnis_cd8e22")} />
        <div className="flex flex-col gap-3 p-4">
          {!sent && <p className="text-sm text-muted">{uiText("features.diagnostics.CommandsPanel.noch_kein_command_gesendet_a8eea1")}</p>}
          {sent && !sent.result && !sent.error && <Spinner label={uiText("features.diagnostics.CommandsPanel.warte_auf_die_antwort_5e512a")} />}
          {sent?.result && (
            <Notice tone={RESULT_TONE[String(sent.result.status)] === 'ok' ? 'ok' : RESULT_TONE[String(sent.result.status)] === 'bad' ? 'bad' : 'warn'} title={<span className="flex items-center gap-2"><Badge tone={RESULT_TONE[String(sent.result.status)] ?? 'neutral'}>{codeLabel(sent.result.status)}</Badge>{sent.result.reason ? <Badge>{reasonLabel(sent.result.reason)}</Badge> : null}</span>}>
              {RESULT_TEXT[String(sent.result.status)] ?? ''}
            </Notice>
          )}
          {sent?.error && (
            <Notice tone="warn" title={uiText("features.diagnostics.CommandsPanel.antwort_unbekannt_e79d9d")}>
              {sent.error} {uiText("features.diagnostics.CommandsPanel.der_command_kann_trotzdem_verarbeitet_worden_sei_a1e8f2")}<div className="mt-2"><Button size="sm" disabled={recover.isPending} onClick={() => recover.mutate(sent.id)}>{uiText("features.diagnostics.CommandsPanel.gespeichertes_ergebnis_abfragen_f219ee")}</Button></div>
            </Notice>
          )}
          {sent && <KeyValue items={[{ label: uiText("features.diagnostics.CommandsPanel.command_id_8aab8c"), value: <code className="break-all text-xs">{sent.id}</code> }]} />}
        </div>
      </Panel>
      </LayoutPanel></PanelLayout><ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={uiText("features.diagnostics.CommandsPanel.command_wirklich_senden_dfa28f")}
        description={<>„{spec?.name}{uiText("features.diagnostics.CommandsPanel.wird_an_bc6f65")}<code>{contractId}</code> {uiText("features.diagnostics.CommandsPanel.gesendet_das_ist_eine_aktion_am_laufenden_system_55df5a")}</>}
        confirmLabel={uiText("features.diagnostics.CommandsPanel.senden_079bef")}
        busy={send.isPending}
        onConfirm={() => {
          setConfirming(false);
          send.mutate();
        }}
      />
    </>
  );
}
