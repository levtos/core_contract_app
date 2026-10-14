import { t as uiText } from '@/i18n';
import { Link } from 'react-router';
import { Notice } from '@/components/ui/layout';
import { Badge } from '@/components/ui/badge';
import { Tip } from '@/components/ui/controls';
import { FIELD_STATUS, QUALITY, type Condition } from '@/lib/status';
import type { FieldValue } from '@/lib/types';

export function FieldStatusBadge({ field }: { field: FieldValue }) {
  const status = FIELD_STATUS[field.status];
  return (
    <Tip label={status.hint}>
      <span tabIndex={0}>
        <Badge tone={status.tone}>{status.label}</Badge>
      </span>
    </Tip>
  );
}

export function QualityBadge({ quality }: { quality: 'healthy' | 'degraded' }) {
  return <Badge tone={QUALITY[quality].tone}>{QUALITY[quality].label}</Badge>;
}

export function ConditionList({ conditions }: { conditions: Condition[] }) {
  if (conditions.length === 0) {
    return <Notice tone="ok" title={uiText("components.status-parts.keine_offenen_bedingungen_4c615b")}>{uiText("components.status-parts.bereitschaft_verbindungen_und_veroffentlichung_s_c38872")}</Notice>;
  }
  return (
    <ul className="space-y-2">
      {conditions.map((c) => (
        <li key={c.kind}>
          <Notice tone={c.tone === 'neutral' || c.tone === 'accent' ? 'info' : c.tone} title={c.title}>
            {c.detail}
          </Notice>
        </li>
      ))}
    </ul>
  );
}

export function ContractLink({ id }: { id: string }) {
  return (
    <Link className="mono text-accent underline-offset-2 hover:underline" to={`/contracts/${encodeURIComponent(id)}`}>
      {id}
    </Link>
  );
}
