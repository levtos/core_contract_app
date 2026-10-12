import { PageHeader, Notice } from '@/components/ui/layout';

/** Platzhalter bis zum jeweiligen Abschnitt – nicht als fertig melden. */
export default function AdminPage() {
  return (
    <>
      <PageHeader title="Administration" />
      <Notice tone="warn" title="Noch nicht implementiert" />
    </>
  );
}
