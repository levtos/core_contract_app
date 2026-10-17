import { t } from '@/i18n';

/** Display-only helpers. Preserve instants and show them in German/Berlin time. */

const dateTime = new Intl.DateTimeFormat('de-DE', {
  day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  timeZone: 'Europe/Berlin',
});

export function formatTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? t('alpha7.time.unknown') : dateTime.format(date);
}

export function shortId(value: string, length = 8): string {
  return value.length > length ? `${value.slice(0, length)}…` : value;
}

export function pluralize(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** Local datetime-input value (no zone) → RFC 3339 UTC for the history filters. */
export function localInputToUtc(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return t('duration.seconds', { value: formatNumber(seconds, 1) });
  if (seconds < 3600) return t('duration.minutes', { value: formatNumber(seconds / 60, 1) });
  if (seconds < 86400) return t('duration.hours', { value: formatNumber(seconds / 3600, 1) });
  return t('duration.days', { value: formatNumber(seconds / 86400, 1) });
}

export function formatNumber(value: number, maximumFractionDigits = 6): string {
  return new Intl.NumberFormat('de-DE', { maximumFractionDigits }).format(Object.is(value, -0) ? 0 : value);
}

/** Display precision only; the stored measurement and engine values stay intact. */
export function formatMeasurement(value: number, unit?: string): string {
  const precision: Record<string, number> = { '°C': 1, '°F': 1, min: 1, h: 1, d: 1, '%': 1, W: 1, kW: 2, kWh: 2 };
  return `${formatNumber(value, unit ? precision[unit] ?? 3 : 6)}${unit ? ` ${unit}` : ''}`;
}

export function relativeTime(value: string, now = Date.now()): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return t('alpha7.time.unknown');
  const seconds = Math.floor((now - timestamp) / 1000);
  if (seconds < -60) return formatTime(value);
  if (seconds < 60) return t('alpha7.time.now');
  if (seconds < 3600) return t('alpha7.time.minutes', { count: Math.floor(seconds / 60) });
  if (seconds < 86400) return t('alpha7.time.hours', { count: Math.floor(seconds / 3600) });
  return t('alpha7.time.days', { count: Math.floor(seconds / 86400) });
}
