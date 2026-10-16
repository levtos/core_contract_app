import { t } from '@/i18n';

export function defaultDraftName(date = new Date()): string {
  return t('alpha7.draft.defaultName', { date: date.toLocaleString('de-DE', { timeZone: 'Europe/Berlin' }) });
}
