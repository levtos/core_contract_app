import { t as uiText } from '@/i18n';
import { ArrowLeft, GitBranchPlus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { LayoutPanel, PanelLayout } from '@/components/PanelLayout';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/controls';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { Empty, Notice, PageHeader } from '@/components/ui/layout';
import { DefinitionEditor, LockBadge } from '@/editors/DefinitionEditor';
import { ReadOnlyNotice } from '@/features/authoring/DraftBar';
import { asArray, definitionKey, nextVersionOf, str } from '@/features/authoring/model';
import { contractsUsingDefinition } from '@/features/authoring/usage';
import { useAuthoringSource } from '@/features/authoring/useAuthoringSource';
import { useWorkingDocument } from '@/features/authoring/WorkingDocument';
import { isObject, setAt } from '@/lib/json';
import { useCapabilities } from '@/lib/queries';
import { ContractsTabs } from './ContractsPage';

export default function DefinitionDetailPage() {
  const { typeId = '', version = '' } = useParams();
  const src = useAuthoringSource();
  const doc = useWorkingDocument();
  const caps = useCapabilities();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [versioning, setVersioning] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [migrate, setMigrate] = useState<Set<string>>(new Set());

  const definitions = asArray(src.config?.definitions).filter(isObject);
  const index = definitions.findIndex((d) => str(d.type_id) === typeId && String(d.type_version) === version);
  const definition = index >= 0 ? definitions[index]! : null;

  if (!definition) {
    return (
      <>
        <Back />
        <Empty title={uiText("features.contracts.DefinitionDetailPage.definition_v0_v1_nicht_gefunden_d09de5", { v0: (typeId), v1: (version) })}>{src.source === 'draft' ? uiText("features.contracts.DefinitionDetailPage.sie_existiert_im_geoffneten_draft_nicht_0632aa") : uiText("features.contracts.DefinitionDetailPage.sie_existiert_in_der_aktiven_registry_nicht_8e5152")}</Empty>
      </>
    );
  }

  const key = definitionKey(definition);
  const lockedSince = src.activatedVersions.get(key) ?? null;
  const locked = lockedSince !== null || !src.editable;
  const pointer = `/definitions/${index}`;
  const users = contractsUsingDefinition(src.config, typeId, Number(version));
  const nextVersion = nextVersionOf(definition, definitions);

  const createVersion = () => {
    doc.edit((c) => {
      const withDefinition = setAt(c, '/definitions', [...asArray(c.definitions), nextVersion]);
      return setAt(
        withDefinition,
        '/contracts',
        asArray(withDefinition.contracts).map((contract) =>
          isObject(contract) && migrate.has(str(contract.contract_id)) ? { ...contract, type_version: Number(nextVersion.type_version) } : contract,
        ),
      );
    });
    setVersioning(false);
    navigate(`/definitions/${encodeURIComponent(typeId)}/${String(nextVersion.type_version)}`);
  };

  return (
    <>
      <Back />
      <PageHeader
        title={<span className="font-mono">{typeId}</span>}
        description={uiText("features.contracts.DefinitionDetailPage.v0_version_v1_1d1973", { v0: (str(definition.display_name) || uiText("features.contracts.DefinitionDetailPage.deklarative_definition_07f53d")), v1: (version) })}
        actions={
          <>
            <Badge>{uiText("features.contracts.DefinitionDetailPage.v_4c9448")}{version}</Badge>
            {lockedSince !== null ? <LockBadge /> : <Badge tone="warn">{uiText("features.contracts.DefinitionDetailPage.entwurf_2ba46e")}</Badge>}
            {src.editable && (
              <>
                <Button size="sm" onClick={() => { setMigrate(new Set(users)); setVersioning(true); }}><GitBranchPlus size={14} /> {uiText("features.contracts.DefinitionDetailPage.neue_version_e81cfe")}</Button>
                <Button size="sm" variant="danger" onClick={() => setRemoving(true)}><Trash2 size={14} /> {uiText("features.contracts.DefinitionDetailPage.entfernen_382837")}</Button>
              </>
            )}
          </>
        }
      />
      <ReadOnlyNotice what={uiText("features.contracts.DefinitionDetailPage.definition_9813fa")} />
      <PanelLayout view="definition.detail"><LayoutPanel id="editor" title={uiText("features.contracts.DefinitionDetailPage.definitionseditor_c9b1ee")}><fieldset disabled={!src.editable} className="min-w-0">
        <DefinitionEditor
          value={definition}
          pointer={pointer}
          caps={caps.data}
          initialTab={params.get('tab') ?? undefined}
          locked={locked}
          lockReason={lockedSince !== null ? uiText("features.contracts.DefinitionDetailPage.diese_version_war_in_revision_v0_aktiv_7f3ad4", { v0: (lockedSince) }) : src.editable ? undefined : uiText("features.contracts.DefinitionDetailPage.schreibgeschutzte_ansicht_der_aktiven_registry_10e355")}
          onChange={(next) => doc.edit((c) => setAt(c, pointer, next))}
        />
      </fieldset>
      </LayoutPanel><LayoutPanel id="usage" title={uiText("features.contracts.DefinitionDetailPage.verwendung_947c0a")}><section className="text-sm text-muted">
        {uiText("features.contracts.DefinitionDetailPage.verwendet_von_f83bfe")}{users.length === 0 ? uiText("features.contracts.DefinitionDetailPage.keiner_instanz_86ff43") : users.map((id) => <Link key={id} to={`/contracts/${encodeURIComponent(id)}`} className="mr-2 font-mono text-xs text-accent hover:underline">{id}</Link>)}
      </section>
      </LayoutPanel></PanelLayout>

      <Dialog
        open={versioning}
        onOpenChange={setVersioning}
        title={uiText("features.contracts.DefinitionDetailPage.neue_version_von_v0_8ee68e", { v0: (typeId) })}
        description={uiText("features.contracts.DefinitionDetailPage.es_wird_v_v0_als_kopie_von_v_v1_angelegt_die_bis_cdd655", { v0: (String(nextVersion.type_version)), v1: (version) })}
        footer={<><Button onClick={() => setVersioning(false)}>{uiText("features.contracts.DefinitionDetailPage.abbrechen_f7ff11")}</Button><Button variant="primary" onClick={createVersion}>{uiText("features.contracts.DefinitionDetailPage.version_anlegen_3d33f7")}</Button></>}
      >
        {users.length > 0 ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted">{uiText("features.contracts.DefinitionDetailPage.instanzen_gleich_auf_die_neue_version_umstellen__a98ead")}</p>
            {users.map((id) => (
              <Checkbox key={id} checked={migrate.has(id)} onCheckedChange={(on) => setMigrate((s) => { const next = new Set(s); if (on) next.add(id); else next.delete(id); return next; })} label={<code>{id}</code>} />
            ))}
          </div>
        ) : (
          <Notice tone="info">{uiText("features.contracts.DefinitionDetailPage.keine_instanz_verwendet_diese_version_2f0d3f")}</Notice>
        )}
      </Dialog>
      <ConfirmDialog
        open={removing}
        onOpenChange={setRemoving}
        title={uiText("features.contracts.DefinitionDetailPage.definition_entfernen_2fb8aa")}
        description={<>{key} {uiText("features.contracts.DefinitionDetailPage.wird_aus_dem_draft_entfernt_2fe205")}{users.length > 0 && <> {uiText("features.contracts.DefinitionDetailPage.noch_verwendet_von_cd365f")}{users.join(', ')}.</>}{lockedSince !== null && <> {uiText("features.contracts.DefinitionDetailPage.diese_version_war_bereits_aktiv_sie_kann_spater__eb414d")}</>}</>}
        confirmLabel={uiText("features.contracts.DefinitionDetailPage.entfernen_382837")}
        tone="danger"
        onConfirm={() => {
          doc.edit((c) => setAt(c, pointer, undefined));
          setRemoving(false);
          navigate('/definitions');
        }}
      />
    </>
  );
}

function Back() {
  return (
    <>
      <Link to="/definitions" className="mb-3 inline-flex items-center gap-1 text-xs text-muted hover:text-fg">
        <ArrowLeft size={13} /> {uiText("features.contracts.DefinitionDetailPage.alle_definitionen_bd3333")}</Link>
      <ContractsTabs />
    </>
  );
}
