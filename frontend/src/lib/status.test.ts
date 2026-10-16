import { describe, expect, it } from 'vitest';
import { classifySystem, connectionLabel, displayValue, overallState } from './status';
import type { FieldValue, ServiceState } from './types';

const healthy: ServiceState = { ready: true, publication_confirmed: true, persistence: 'available', ha: 'connected', bridge: 'connected', mqtt: 'disabled', reasons: [] };
const kinds = (input: Parameters<typeof classifySystem>[0]) => classifySystem(input).map((c) => c.kind);

describe('system conditions are named separately', () => {
  it('does not warn about an unneeded HA connection', () => {
    const service = { ...healthy, ha: 'not_needed', bridge: 'not_needed' };
    expect(kinds({ service, connection: 'open', hasActiveRegistry: true })).toEqual([]);
    expect(connectionLabel(service.ha)).toBe('wird nicht gebraucht');
  });
  it('empty configuration is informational, not a fault', () => {
    const result = classifySystem({ service: { ...healthy, ready: false, reasons: ['no_active_registry'] }, connection: 'open', hasActiveRegistry: false });
    expect(result.map((c) => c.kind)).toEqual(['empty_configuration']);
    expect(result[0]!.tone).toBe('info');
    expect(overallState(result, { ...healthy, ready: false }).label).toBe('Nicht bereit');
  });

  it('incomplete setup, limited source, lost connection, persistence and system fault are distinct', () => {
    expect(kinds({ service: { ...healthy, reasons: ['invalid_supervisor_options'] }, connection: 'open', hasActiveRegistry: true })).toEqual(['setup_incomplete']);
    expect(kinds({ service: { ...healthy, ha: 'disconnected' }, connection: 'open', hasActiveRegistry: true })).toEqual(['limited_source']);
    expect(kinds({ service: healthy, connection: 'reconnecting', hasActiveRegistry: true })).toEqual(['connection_lost']);
    expect(kinds({ service: { ...healthy, persistence: 'persistence_unavailable', reasons: ['persistence_unavailable'] }, connection: 'open', hasActiveRegistry: true })).toEqual(['persistence_failure']);
    expect(kinds({ service: null, connection: 'open', hasActiveRegistry: true, apiFailure: 'unavailable' })).toEqual(['system_fault']);
  });

  it('unconfirmed publication and pending first snapshot are readiness facts', () => {
    expect(kinds({ service: { ...healthy, publication_confirmed: false, reasons: ['first_bridge_snapshot_pending'] }, connection: 'open', hasActiveRegistry: true })).toEqual(['readiness_pending', 'publication_unconfirmed']);
  });

  it('a healthy system has no conditions and reads "Bereit"', () => {
    const none = classifySystem({ service: healthy, connection: 'open', hasActiveRegistry: true });
    expect(none).toEqual([]);
    expect(overallState(none, healthy)).toEqual({ label: 'Bereit', tone: 'ok' });
  });
});

describe('field presentation', () => {
  const base: FieldValue = { status: 'valid', value: false, quality: 'healthy', reasons: [], evidence: [] };
  it('shows a real false as Nein', () => expect(displayValue(base)).toBe('Nein'));
  it('uses German booleans and decimals inside structured values without a raw JSON dump', () => {
    expect(displayValue({ ...base, value: { Fenster: true, Messungen: [21.5, false] } })).toBe('Fenster: Ja; Messungen: 21,5 · Nein');
  });
  it('never renders unknown as false/off', () => {
    expect(displayValue({ ...base, status: 'unknown', value: null, quality: 'degraded' })).toBe('unbekannt');
    expect(displayValue({ ...base, status: 'unresolved', value: null, quality: 'degraded' })).toBe('ungelöst');
    expect(displayValue({ ...base, status: 'not_applicable', value: null })).toBe('nicht anwendbar');
  });
});
