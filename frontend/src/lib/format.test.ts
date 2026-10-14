import { expect, it } from 'vitest';
import { formatDuration, formatNumber } from './format';
import { displayValue } from './status';
import { validIdentifier } from './identifiers';

it('formats numbers, units, booleans and durations in German', () => {
  expect(formatNumber(0.6000000000000014)).toBe('0,6');
  expect(formatDuration(90)).toBe('1,5 min');
  expect(displayValue({ status: 'valid', value: 20.6, quality: 'healthy', evidence: [], reasons: [] }, '°C')).toBe('20,6 °C');
  expect(displayValue({ status: 'valid', value: true, quality: 'healthy', evidence: [], reasons: [] })).toBe('Ja');
});
it('accepts only bounded canonical IDs', () => {
  expect(validIdentifier('wohnzimmer.temperatur')).toBe(true);
  expect(validIdentifier('a'.repeat(128))).toBe(true);
  for (const id of ['a'.repeat(129), 'ende.', 'küche.wärme', 'a..b']) expect(validIdentifier(id)).toBe(false);
});
