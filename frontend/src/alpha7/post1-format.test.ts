import { expect, it } from 'vitest';
import { displayValue } from '@/lib/status';
import { formatDuration, formatMeasurement } from '@/lib/format';
import type { FieldValue } from '@/lib/types';

it('rounds display measurements by unit without changing values or missing-state semantics', () => {
  const field: FieldValue = { status: 'valid', value: 856.6989, quality: 'healthy', reasons: [], evidence: [] };
  expect(displayValue(field, 's')).toBe('14,3 min');
  expect(displayValue({ ...field, value: 21.278315 }, '°C')).toBe('21,3 °C');
  expect(formatMeasurement(14.278315, 'min')).toBe('14,3 min');
  expect(formatDuration(59.123)).toBe('59,1 s');
  expect(field.value).toBe(856.6989);
  expect(displayValue({ ...field, status: 'unknown', value: null }, '°C')).toBe('unbekannt');
  expect(displayValue({ ...field, value: false }, 'min')).toBe('Nein');
});
