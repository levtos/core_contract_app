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
        <Empty title={`Definition „${typeId}@${version}“ nicht gefunden`}>{src.source === 'draft' ? 'Sie existiert im geöffneten Draft nicht.' : 'Sie existiert in der aktiven Registry nicht.'}</Empty>
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
        description={`${str(definition.display_name) || 'Deklarative Definition'} · Version ${version}`}
        actions={
          <>
            <Badge>v{version}</Badge>
            {lockedSince !== null ? <LockBadge /> : <Badge tone="warn">Entwurf</Badge>}
            {src.editable && (
              <>
                <Button size="sm" onClick={() => { setMigrate(new Set(users)); setVersioning(true); }}><GitBranchPlus size={14} /> Neue Version</Button>
                <Button size="sm" variant="danger" onClick={() => setRemoving(true)}><Trash2 size={14} /> Entfernen</Button>
              </>
            )}
          </>
        }
      />
      <ReadOnlyNotice what="Definition" />
      <PanelLayout view="definition.detail"><LayoutPanel id="editor" title="Definitionseditor"><fieldset disabled={!src.editable} className="min-w-0">
        <DefinitionEditor
          value={definition}
          pointer={pointer}
          caps={caps.data}
          initialTab={params.get('tab') ?? undefined}
          locked={locked}
          lockReason={lockedSince !== null ? `Diese Version war in Revision ${lockedSince} aktiv.` : src.editable ? undefined : 'Schreibgeschützte Ansicht der aktiven Registry.'}
          onChange={(next) => doc.edit((c) => setAt(c, pointer, next))}
        />
      </fieldset>
      </LayoutPanel><LayoutPanel id="usage" title="Verwendung"><section className="text-sm text-muted">
        Verwendet von {users.length === 0 ? 'keiner Instanz' : users.map((id) => <Link key={id} to={`/contracts/${encodeURIComponent(id)}`} className="mr-2 font-mono text-xs text-accent hover:underline">{id}</Link>)}
      </section>
      </LayoutPanel></PanelLayout>

      <Dialog
        open={versioning}
        onOpenChange={setVersioning}
        title={`Neue Version von ${typeId}`}
        description={`Es wird v${String(nextVersion.type_version)} als Kopie von v${version} angelegt. Die bisherige Version bleibt unverändert; Instanzen verweisen weiter auf sie, bis sie umgestellt werden.`}
        footer={<><Button onClick={() => setVersioning(false)}>Abbrechen</Button><Button variant="primary" onClick={createVersion}>Version anlegen</Button></>}
      >
        {users.length > 0 ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted">Instanzen gleich auf die neue Version umstellen? Das ändert ihren semantischen Fingerprint; gehaltene Zeitkontexte können dadurch neu initialisiert werden (die Validierung zeigt die Auswirkungen).</p>
            {users.map((id) => (
              <Checkbox key={id} checked={migrate.has(id)} onCheckedChange={(on) => setMigrate((s) => { const next = new Set(s); if (on) next.add(id); else next.delete(id); return next; })} label={<code>{id}</code>} />
            ))}
          </div>
        ) : (
          <Notice tone="info">Keine Instanz verwendet diese Version.</Notice>
        )}
      </Dialog>
      <ConfirmDialog
        open={removing}
        onOpenChange={setRemoving}
        title="Definition entfernen?"
        description={<>{key} wird aus dem Draft entfernt.{users.length > 0 && <> Noch verwendet von: {users.join(', ')}.</>}{lockedSince !== null && <> Diese Version war bereits aktiv; sie kann später nicht mit anderer Semantik neu definiert werden.</>}</>}
        confirmLabel="Entfernen"
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
        <ArrowLeft size={13} /> Alle Definitionen
      </Link>
      <ContractsTabs />
    </>
  );
}
