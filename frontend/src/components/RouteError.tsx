import { t as uiText } from '@/i18n';
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
      <Notice tone="bad" title={stale ? uiText("components.RouteError.die_oberflache_wurde_aktualisiert_121896") : uiText("components.RouteError.dieser_bereich_konnte_nicht_angezeigt_werden_c3b50c")}>
        <p>{stale ? uiText("components.RouteError.die_geoffnete_seite_stammt_aus_einer_alteren_ver_5380c5") : uiText("components.RouteError.ein_unerwarteter_fehler_ist_aufgetreten_die_date_95b04b")}</p>

        <div className="mt-3 flex gap-2">
          <Button variant="primary" onClick={() => location.reload()}>{uiText("components.RouteError.seite_neu_laden_61e2c2")}</Button>
          <Button onClick={() => (location.hash = '#/')}>{uiText("components.RouteError.zur_ubersicht_22bfde")}</Button>
        </div>
      </Notice>
    </div>
  );
}
