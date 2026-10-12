import { useRouteError } from 'react-router';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/layout';

/** Shown for a failed route, typically a stale chunk after the app was updated while the page stayed open. */
export function RouteError() {
  const error = useRouteError();
  const message = error instanceof Error ? error.message : String(error);
  const stale = /dynamically imported module|Importing a module script failed|Loading chunk/i.test(message);
  return (
    <div className="mx-auto max-w-xl p-8">
      <Notice tone="bad" title={stale ? 'Die Oberfläche wurde aktualisiert' : 'Dieser Bereich konnte nicht angezeigt werden'}>
        <p>{stale ? 'Die geöffnete Seite stammt aus einer älteren Version. Bitte neu laden; ungespeicherte Draft-Änderungen gehen dabei verloren.' : 'Ein unerwarteter Fehler ist aufgetreten. Die Daten auf dem Server sind nicht betroffen.'}</p>
        {!stale && <pre className="mt-2 max-h-40 overflow-auto text-xs">{message}</pre>}
        <div className="mt-3 flex gap-2">
          <Button variant="primary" onClick={() => location.reload()}>Seite neu laden</Button>
          <Button onClick={() => (location.hash = '#/')}>Zur Übersicht</Button>
        </div>
      </Notice>
    </div>
  );
}
