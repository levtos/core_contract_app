/** Display-only helpers. Timestamps are shown as the server delivered them (UTC instants). */

const dateTime = new Intl.DateTimeFormat('de-DE', {
  dateStyle: 'medium',
  timeStyle: 'medium',
});

export function formatTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : dateTime.format(date);
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
  if (seconds < 60) return `${seconds} s`;
  if (seconds < 3600) return `${+(seconds / 60).toFixed(2)} min`;
  if (seconds < 86400) return `${+(seconds / 3600).toFixed(2)} h`;
  return `${+(seconds / 86400).toFixed(2)} d`;
}
