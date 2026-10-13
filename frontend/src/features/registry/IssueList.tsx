import { Link } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { explain } from '@/features/authoring/issues';
import { locateIssue } from '@/features/authoring/locate';
import type { Issue } from '@/lib/api';
import type { JsonObject } from '@/lib/json';

/** Server findings with a jump to the editor that owns the addressed object. */
export function IssueList({ issues, config }: { issues: Issue[]; config: JsonObject | null }) {
  if (issues.length === 0) return null;
  return (
    <ul className="divide-y divide-line rounded-[var(--radius-md)] border border-bad/30" aria-label="Validierungsfehler">
      {issues.map((issue, i) => {
        const where = locateIssue(issue.path, config);
        return (
          <li key={`${issue.path}-${issue.code}-${i}`} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-3 py-2 text-sm">
            <Badge tone="bad">{issue.code}</Badge>
            <span className="min-w-0 flex-1">
              <span className="block">{explain(issue)}</span>
              <span className="mono block break-all text-[11px] text-faint">{issue.path || '/'}{issue.object_id ? ` · ${issue.object_id}` : ''}</span>
            </span>
            <Link to={where.to} className="shrink-0 text-xs text-accent hover:underline">{where.label} →</Link>
          </li>
        );
      })}
    </ul>
  );
}
