import type { Issue } from '@/lib/api';
import { hasTranslation, t } from './index';

/** Only platform-owned enums are translated; user identifiers and values stay intact. */
export function codeLabel(code: unknown): string {
  const key = `codes.${String(code)}`;
  return hasTranslation(key) ? t(key) : t('common.unknownCode');
}
export const reasonLabel = codeLabel;

export function fieldLabel(name: string): string {
  const key = `fields.${name}`;
  const normalized = `fields.${name.replace(/([a-z])([A-Z])/g, '$1_$2').replace(/\s+/g, '_').toLowerCase()}`;
  return hasTranslation(key) ? t(key) : hasTranslation(normalized) ? t(normalized) : name;
}

export function validationLabel(issue: Issue): string {
  const key = `validation.${issue.code}`;
  if (issue.code === 'contract_cycle') return t(key, { cycle: issue.message.split(': ').slice(1).join(': ') });
  if (hasTranslation(key)) return t(key, { source: issue.object_id ?? '—', ...issue.parameters,
    actual: codeLabel(issue.parameters?.actual), expected: codeLabel(issue.parameters?.expected),
    actualUnit: issue.parameters?.actualUnit || t('common.noUnit'), expectedUnit: issue.parameters?.expectedUnit || t('common.noUnit'),
  });
  return t('validation.unknown');
}
