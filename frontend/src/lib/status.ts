import type { Tone } from '@/components/ui/badge';
import type { Connection } from './live';
import type { FieldStatus, FieldValue, ServiceState } from './types';

/**
 * Honest status vocabulary. "unknown" is a status, never `false`/`off`, and
 * readiness (can the service evaluate?) is kept apart from quality (how good is
 * a value?). Nothing here computes freshness: the server's labels are shown.
 */

export const FIELD_STATUS: Record<FieldStatus, { label: string; tone: Tone; hint: string }> = {
  valid: { label: 'gültig', tone: 'ok', hint: 'Wert ist aktuell und belegt.' },
  held: { label: 'gehalten', tone: 'info', hint: 'Letzter gültiger Wert wird bis zum Ende der Grace-Frist gehalten.' },
  unknown: { label: 'unbekannt', tone: 'warn', hint: 'Kein verwendbarer Wert. Das ist weder „aus“ noch „falsch“.' },
  unresolved: { label: 'ungelöst', tone: 'warn', hint: 'Der Wert konnte nicht eindeutig bestimmt werden.' },
  not_applicable: { label: 'nicht anwendbar', tone: 'neutral', hint: 'Positiv festgestellt: trifft in dieser Lage nicht zu.' },
};

export const QUALITY: Record<'healthy' | 'degraded', { label: string; tone: Tone }> = {
  healthy: { label: 'gesund', tone: 'ok' },
  degraded: { label: 'eingeschränkt', tone: 'warn' },
};

/** Value text that never turns a missing value into a plausible-looking one. */
export function displayValue(field: FieldValue): string {
  if (field.status === 'unknown') return 'unbekannt';
  if (field.status === 'unresolved') return 'ungelöst';
  if (field.status === 'not_applicable') return 'nicht anwendbar';
  const value = field.value;
  if (value === null || value === undefined) return '—';
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
      title: 'Einrichtung unvollständig',
      detail: 'Die App-Optionen sind ungültig. Im Supervisor korrigieren; der Einrichtungsassistent ändert sie nicht.',
    });
  }
  if (apiFailure === 'persistence' || service?.persistence === 'persistence_unavailable' || reasons.includes('persistence_unavailable')) {
    result.push({
      kind: 'persistence_failure',
      tone: 'bad',
      title: 'Persistenzfehler',
      detail: 'Die Datenbank ist nicht erreichbar. Zustände werden nicht bestätigt; Änderungen sind abgelehnt.',
    });
  }
  if (hasActiveRegistry === false || reasons.includes('no_active_registry')) {
    result.push({
      kind: 'empty_configuration',
      tone: 'info',
      title: 'Leere Konfiguration',
      detail: 'Es ist noch keine Registry aktiv. Das ist ein gültiger Anfangszustand, keine Störung.',
    });
  }
  if (reasons.includes('first_bridge_snapshot_pending')) {
    result.push({
      kind: 'readiness_pending',
      tone: 'warn',
      title: 'Bereitschaft ausstehend',
      detail: 'Der erste Snapshot der Home-Assistant-Bridge steht noch aus.',
    });
  }
  if (service && (service.ha !== 'connected' || service.bridge !== 'connected')) {
    const parts = [service.ha !== 'connected' ? `HA: ${service.ha}` : '', service.bridge !== 'connected' ? `Bridge: ${service.bridge}` : '']
      .filter(Boolean)
      .join(' · ');
    result.push({
      kind: 'limited_source',
      tone: 'warn',
      title: 'Eingeschränkte Quelle',
      detail: `${parts}. Contracts können unbekannt oder eingeschränkt sein; das System selbst läuft.`,
    });
  }
  if (service && !service.publication_confirmed) {
    result.push({
      kind: 'publication_unconfirmed',
      tone: 'warn',
      title: 'Letzter Stand unbestätigt',
      detail: 'Die letzte Veröffentlichung wurde nicht bestätigt; angezeigte Werte können vom persistierten Stand abweichen.',
    });
  }
  if (connection === 'offline' || connection === 'reconnecting' || apiFailure === 'network') {
    result.push({
      kind: 'connection_lost',
      tone: 'warn',
      title: connection === 'offline' ? 'Offline' : 'Verbindungsabbruch',
      detail: 'Die Live-Verbindung ist unterbrochen. Gezeigt wird der letzte bekannte Stand; er kann veraltet sein.',
    });
  }
  if (apiFailure === 'unavailable' || apiFailure === 'other') {
    result.push({
      kind: 'system_fault',
      tone: 'bad',
      title: 'Systemstörung',
      detail: 'Der Dienst antwortet fehlerhaft. Details in Diagnose & Historie bzw. im App-Log.',
    });
  }
  return result;
}

/** Overall verdict for the status chip; readiness, not value quality. */
export function overallState(conditions: Condition[], service: ServiceState | null): { label: string; tone: Tone } {
  if (conditions.some((c) => c.tone === 'bad')) return { label: 'Störung', tone: 'bad' };
  if (service && !service.ready) return { label: 'Nicht bereit', tone: 'warn' };
  if (conditions.some((c) => c.tone === 'warn')) return { label: 'Eingeschränkt', tone: 'warn' };
  if (!service) return { label: 'Lädt', tone: 'neutral' };
  if (conditions.some((c) => c.kind === 'empty_configuration')) return { label: 'Leer', tone: 'info' };
  return { label: 'Bereit', tone: 'ok' };
}

export const REASON_LABELS: Record<string, string> = {
  invalid_supervisor_options: 'Ungültige App-Optionen',
  persistence_unavailable: 'Persistenz nicht erreichbar',
  no_active_registry: 'Keine aktive Registry',
  first_bridge_snapshot_pending: 'Erster Bridge-Snapshot steht aus',
};
