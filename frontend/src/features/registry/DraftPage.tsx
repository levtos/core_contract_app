import { PageHeader, Notice } from '@/components/ui/layout';

/** Platzhalter bis zum jeweiligen Abschnitt – nicht als fertig melden. */
export default function DraftPage() {
  return (
    <>
      <PageHeader title="Draft" />
      <Notice tone="warn" title="Noch nicht implementiert" />
    </>
  );
}
