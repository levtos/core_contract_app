import { t as uiText } from '@/i18n';
import { Link } from 'react-router';
import { ConditionRow } from '@/components/ReadinessBadge';
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
    return <p className="text-sm text-muted">{uiText("components.status-parts.keine_offenen_bedingungen_4c615b")}</p>;
  }
  return (
    <ul className="space-y-2">
      {conditions.map(condition => <ConditionRow key={condition.kind} condition={condition} />)}
    </ul>
  );
}

export function ContractLink({ id }: { id: string }) {
  return (
    <Link className="mono text-accent underline-offset-2 hover:underline" to={`/contracts/view/${encodeURIComponent(id)}`}>
      {id}
    </Link>
  );
}
