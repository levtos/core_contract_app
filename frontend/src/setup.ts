export interface Connection {
  host: string; port: number; database: string; user: string; password?: string;
  sslmode: 'verify-full' | 'require' | 'disable'; ca: string;
}
export interface SetupStatus {
  phase: 'welcome' | 'connecting' | 'completed'; authority: string;
  database_configured: boolean; database: Connection | null; csrf_token: string;
  installation_id: string | null; error: string; restart_required: boolean;
}
const errors: Record<string, string> = {
  database_connection_failed: 'PostgreSQL nicht erreichbar oder Anmeldung/TLS fehlgeschlagen. Host, Zugangsdaten und Zertifikat prüfen.',
  postgres_version_unsupported: 'PostgreSQL 14 oder neuer ist erforderlich.',
  application_role_too_privileged: 'Die Anwendungsrolle besitzt Administratorrechte.',
  foreign_database: 'Die Datenbank enthält fremde Daten. Eine eigene leere Datenbank verwenden.',
  installation_mismatch: 'Installations-ID passt nicht zu dieser App. Keine Änderung übernommen.',
  adopt_installation_id_required: 'Vorhandene Datenbank nur mit ihrer ausdrücklich bestätigten Installations-ID übernehmen.',
  initialize_empty_database_required: 'Initialisierung der eigenen leeren Datenbank ausdrücklich bestätigen.',
  insecure_tls_confirmation_required: 'Den eingeschränkten TLS-Schutz ausdrücklich bestätigen.',
  confirmation_required: 'Übernahme der Verbindung ausdrücklich bestätigen.',
  provision_request_mismatch: 'Der Importcode gehört nicht zu diesem Einrichtungsskript.',
  invalid_setup_request: 'Eingaben oder Importcode ungültig. Bitte prüfen.',
};
export async function setupRequest<T>(path: string, body?: unknown, csrf = ''): Promise<T> {
  const response = await fetch(`./api/v1/setup/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json', 'X-Setup-CSRF': csrf },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const value = await response.json().catch(() => ({ error: 'invalid_response' }));
  if (!response.ok) throw new Error(errors[value.error] ?? 'Einrichtung nicht verfügbar. Ingress-Sitzung erneuern und erneut prüfen.');
  return value as T;
}
export function validConnection(value: Connection, existing: boolean): boolean {
  return /^[a-zA-Z0-9_.:\-]+$/.test(value.host) && value.port >= 1 && value.port <= 65535
    && (existing ? value.database.length > 0 && value.database.length <= 63 && value.user.length > 0 && value.user.length <= 63 : /^[a-z][a-z0-9_]{0,62}$/.test(value.database) && /^[a-z][a-z0-9_]{0,62}$/.test(value.user))
    && !['postgres', 'template0', 'template1'].includes(value.database)
    && (!existing || !!value.password) && (!value.ca || (value.ca.startsWith('/ssl/') && !value.ca.split('/').includes('..')));
}
