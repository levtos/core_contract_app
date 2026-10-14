import { t as uiText } from '@/i18n';
import { Notice } from '@/components/ui/layout';
import { useContractDiagnosis } from '@/lib/queries';
import type { ContractDiagnosis as Diagnosis } from '@/lib/types';

export function RecoveryDetail({ recovery }: { recovery: NonNullable<Diagnosis['machine']>['recovery'] }) {
  return <Notice tone="warn" title={uiText("components.MachineRecovery.ablauf_ohne_gultigen_zustand_831755")}>
    {uiText("components.MachineRecovery.der_bisherige_zustand_kann_nicht_sicher_wiederhe_687282")}{recovery && recovery.inputs.length > 0 ? <p>{uiText("components.MachineRecovery.benotigte_eingange_4a111b")}{recovery.inputs.map((input) => `${input.name}: ${input.status === 'valid' ? uiText("components.MachineRecovery.gultig_bedingung_noch_nicht_erfullt_a448de") : uiText("components.MachineRecovery.kein_gultiger_nachweis_7be0f3")}`).join(' · ')}.</p> : <p>{uiText("components.MachineRecovery.die_neustart_bedingung_muss_auf_gultige_eingange_9c2c15")}</p>}
  </Notice>;
}

export function MachineRecovery({ contractId }: { contractId: string }) {
  const diagnosis = useContractDiagnosis(contractId);
  return <RecoveryDetail recovery={diagnosis.data?.machine?.recovery} />;
}
