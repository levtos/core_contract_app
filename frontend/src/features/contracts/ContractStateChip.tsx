import { Badge } from '@/components/ui/badge';
import { Tip } from '@/components/ui/controls';
import type { Envelope } from '@/lib/types';
import { contractState } from './presentation';

export function ContractStateChip({ envelope, enabled, draftOnly, stale }: { envelope: Envelope | null; enabled: boolean; draftOnly?: boolean; stale?: boolean }) {
  const state = contractState(envelope, enabled, draftOnly, stale);
  return <Tip label={state.hint}><span tabIndex={0} title={state.hint}><Badge tone={state.tone}>{state.label}</Badge></span></Tip>;
}
