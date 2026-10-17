import { t } from '@/i18n';
import { Field, Input, Select } from '@/components/ui/form';
import { str } from '@/features/authoring/model';
import type { JsonObject } from '@/lib/json';
import { FRESHNESS_MODES } from './devicePlan';
import { formatNumber } from '@/lib/format';

export function FreshnessSettings({ value, onChange, livenessSources = [] }: { value: JsonObject; onChange: (value: JsonObject) => void; livenessSources?: { id: string; name: string }[] }) {
  const mode = str(value.mode);
  return <div className="space-y-3">
    <Field label={t('alpha7.freshness.mode')}>{props => <Select {...props} value={mode} onChange={event => { const next = event.target.value; onChange({ ...value, mode: next, ...(next !== 'event_stateful' ? { interval_s: value.interval_s ?? 3600 } : {}), ...(next === 'liveness_source' ? { liveness_source: value.liveness_source ?? '' } : {}) }); }}>{FRESHNESS_MODES.map(item => <option key={item} value={item}>{t(`alpha7.freshness.${item}`)}</option>)}</Select>}</Field>
    <p className="text-xs text-muted">{t(`alpha7.freshness.${mode}Help`)}</p>
    {mode !== 'event_stateful' && <Field label={t('alpha7.freshness.interval')} hint={typeof value.interval_s === 'number' && value.interval_s > 0 ? t(value.interval_s === 60 ? 'alpha7.freshness.oneMinute' : 'alpha7.freshness.minutes', { minutes: formatNumber(value.interval_s / 60) }) : undefined}>{props => <Input {...props} type="number" min={1} value={typeof value.interval_s === 'number' ? value.interval_s : ''} onChange={event => onChange({ ...value, interval_s: event.target.value === '' ? 0 : Number(event.target.value) })} />}</Field>}
    {mode === 'liveness_source' && <Field label={t('alpha7.freshness.liveness')}>{props => <Select {...props} value={str(value.liveness_source)} onChange={event => onChange({ ...value, liveness_source: event.target.value })}><option value="">{t('alpha7.device.choose')}</option>{livenessSources.map(source => <option key={source.id} value={source.id}>{source.name}</option>)}</Select>}</Field>}
  </div>;
}
