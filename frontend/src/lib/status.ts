import { t as uiText } from '@/i18n';
import type { Tone } from '@/components/ui/badge';
import type { Connection } from './live';
import type { FieldStatus, FieldValue, ServiceState } from './types';
import { formatDuration, formatNumber } from './format';
import { codeLabel } from '@/i18n/codes';

/**
 * Honest status vocabulary. "unknown" is a status, never `false`/`off`, and
 * readiness (can the service evaluate?) is kept apart from quality (how good is
 * a value?). Nothing here computes freshness: the server's labels are shown.
 */

export const FIELD_STATUS: Record<FieldStatus, { label: string; tone: Tone; hint: string }> = {
  valid: { label: uiText("lib.status.gultig_87b71a"), tone: 'ok', hint: uiText("lib.status.wert_ist_aktuell_und_belegt_40eba5") },
  held: { label: uiText("lib.status.gehalten_9ce589"), tone: 'info', hint: uiText("lib.status.letzter_gultiger_wert_wird_bis_zum_ende_der_grac_763ba7") },
  unknown: { label: uiText("lib.status.unbekannt_a418e6"), tone: 'neutral', hint: uiText("lib.status.kein_verwendbarer_wert_das_ist_weder_aus_noch_fa_23fda0") },
  unresolved: { label: uiText("lib.status.ungelost_1a4c83"), tone: 'neutral', hint: uiText("lib.status.der_wert_konnte_nicht_eindeutig_bestimmt_werden_508be4") },
  not_applicable: { label: uiText("lib.status.nicht_anwendbar_d9b971"), tone: 'neutral', hint: uiText("lib.status.positiv_festgestellt_trifft_in_dieser_lage_nicht_96ea6e") },
};

export const QUALITY: Record<'healthy' | 'degraded', { label: string; tone: Tone }> = {
  healthy: { label: uiText("lib.status.gesund_35c867"), tone: 'ok' },
  degraded: { label: uiText("lib.status.eingeschrankt_7c77f8"), tone: 'warn' },
};

/** Value text that never turns a missing value into a plausible-looking one. */
export function displayValue(field: FieldValue, unit?: string): string {
  if (field.status === 'unknown') return uiText("lib.status.unbekannt_a418e6");
  if (field.status === 'unresolved') return uiText("lib.status.ungelost_1a4c83");
  if (field.status === 'not_applicable') return uiText("lib.status.nicht_anwendbar_d9b971");
  const value = field.value;
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? uiText("lib.status.ja_cde9e5") : uiText("lib.status.nein_90ebc1");
  if (typeof value === 'number') return unit === 's' ? formatDuration(value) : `${formatNumber(value)}${unit ? ` ${unit}` : ''}`;
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

export type ConditionKind =
  | 'empty_configuration'
  | 'setup_incomplete'
  | 'readiness_pending'
  | 'limited_source'
  | 'publication_unconfirmed'
  | 'connection_lost'
  | 'persistence_failure'
  | 'system_fault';

export interface Condition {
  kind: ConditionKind;
  tone: Tone;
  title: string;
  detail: string;
}

export interface SystemInput {
  service: ServiceState | null;
  connection: Connection;
  hasActiveRegistry: boolean | undefined;
  /** HTTP-level failure of an essential request, if any. */
  apiFailure?: 'network' | 'unavailable' | 'persistence' | 'other' | null;
}

/** Separate, individually named conditions; never one generic "error". */
export function classifySystem({ service, connection, hasActiveRegistry, apiFailure }: SystemInput): Condition[] {
  const result: Condition[] = [];
  const reasons = service?.reasons ?? [];
  if (reasons.includes('invalid_supervisor_options')) {
    result.push({
      kind: 'setup_incomplete',
      tone: 'bad',
      title: uiText("lib.status.einrichtung_unvollstandig_ab8de5"),
      detail: uiText("lib.status.die_app_optionen_sind_ungultig_im_supervisor_kor_b69b18"),
    });
  }
  if (apiFailure === 'persistence' || service?.persistence === 'persistence_unavailable' || reasons.includes('persistence_unavailable')) {
    result.push({
      kind: 'persistence_failure',
      tone: 'bad',
      title: uiText("lib.status.persistenzfehler_f91758"),
      detail: uiText("lib.status.die_datenbank_ist_nicht_erreichbar_zustande_werd_8902d8"),
    });
  }
  if (hasActiveRegistry === false || reasons.includes('no_active_registry')) {
    result.push({
      kind: 'empty_configuration',
      tone: 'info',
      title: uiText("lib.status.leere_konfiguration_e2bdda"),
      detail: uiText("lib.status.es_ist_noch_keine_registry_aktiv_das_ist_ein_gul_4a298e"),
    });
  }
  if (reasons.includes('first_bridge_snapshot_pending')) {
    result.push({
      kind: 'readiness_pending',
      tone: 'warn',
      title: uiText("lib.status.bereitschaft_ausstehend_3353d4"),
      detail: uiText("lib.status.der_erste_snapshot_der_home_assistant_bridge_ste_9e13ec"),
    });
  }
  if (service && ([service.ha, service.bridge].some((state) => state !== 'connected' && state !== 'not_needed'))) {
    const parts = [service.ha !== 'connected' ? uiText('system.haConnection', { state: connectionLabel(service.ha) }) : '', service.bridge !== 'connected' ? uiText('system.bridgeConnection', { state: connectionLabel(service.bridge) }) : '']
      .filter(Boolean)
      .join(' · ');
    result.push({
      kind: 'limited_source',
      tone: 'warn',
      title: uiText("lib.status.eingeschrankte_quelle_333805"),
      detail: uiText("lib.status.v0_contracts_konnen_unbekannt_oder_eingeschrankt_0d697c", { v0: (parts) }),
    });
  }
  if (service && !service.publication_confirmed) {
    result.push({
      kind: 'publication_unconfirmed',
      tone: 'warn',
      title: uiText("lib.status.letzter_stand_unbestatigt_7c2d6f"),
      detail: uiText("lib.status.die_letzte_veroffentlichung_wurde_nicht_bestatig_a93e9b"),
    });
  }
  if (connection === 'offline' || connection === 'reconnecting' || apiFailure === 'network') {
    result.push({
      kind: 'connection_lost',
      tone: 'warn',
      title: connection === uiText("lib.status.offline_8e2c7a") ? uiText("lib.status.offline_a17947") : uiText("lib.status.verbindungsabbruch_b5a0d4"),
      detail: uiText("lib.status.die_live_verbindung_ist_unterbrochen_gezeigt_wir_355e23"),
    });
  }
  if (apiFailure === 'unavailable' || apiFailure === 'other') {
    result.push({
      kind: 'system_fault',
      tone: 'bad',
      title: uiText("lib.status.systemstorung_43a12a"),
      detail: uiText("lib.status.der_dienst_antwortet_fehlerhaft_details_in_diagn_8a3550"),
    });
  }
  return result;
}

/** Overall verdict for the status chip; readiness, not value quality. */
export function overallState(conditions: Condition[], service: ServiceState | null): { label: string; tone: Tone } {
  if (conditions.some((c) => c.tone === 'bad')) return { label: uiText("lib.status.storung_8f18d2"), tone: 'bad' };
  if (service && !service.ready) return { label: uiText("lib.status.nicht_bereit_11f40b"), tone: 'warn' };
  if (conditions.some((c) => c.tone === 'warn')) return { label: uiText("lib.status.eingeschrankt_55b605"), tone: 'warn' };
  if (!service) return { label: uiText("lib.status.ladt_9dd9e4"), tone: 'neutral' };
  if (conditions.some((c) => c.kind === 'empty_configuration')) return { label: uiText("lib.status.leer_f4e0ac"), tone: 'info' };
  return { label: uiText("lib.status.bereit_8d4d48"), tone: 'ok' };
}

export const REASON_LABELS: Record<string, string> = {
  invalid_supervisor_options: uiText("lib.status.ungultige_app_optionen_0faff6"),
  persistence_unavailable: uiText("lib.status.persistenz_nicht_erreichbar_fd7b31"),
  no_active_registry: uiText("lib.status.keine_aktive_registry_f699ee"),
  first_bridge_snapshot_pending: uiText("lib.status.erster_bridge_snapshot_steht_aus_9a084a"),
};

export function connectionLabel(state: string): string {
  return codeLabel(state);
}
