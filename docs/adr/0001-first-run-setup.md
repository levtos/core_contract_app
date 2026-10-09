# First-run setup (Issue #8)

Status: implementation decision, 2026-10-10. Scope: SELF-INSTALL-01,
DB-SETUP-01, FIRST-RUN-01. No runtime or registry semantic change.

## Trust boundary

The UI and `/api/v1/setup/*` exist before the database/installation identity.
Setup routes exist only on the Ingress listener, whose TCP peer must be the
Supervisor (172.30.32.2). Consumer bearer tokens never authorize setup.
Mutation additionally requires JSON and a per-process random CSRF token obtained
from same-origin setup status, with cross-site Fetch Metadata rejected. No CORS.
The token is never persisted in browser storage. Identity-less ordinary API and
WebSocket requests remain unavailable. Liveness and readiness retain their meaning.

## Configuration authority and interruption

Supervisor owns options.json; the app never rewrites it. A successful, explicitly
confirmed wizard connection becomes the sole database authority in the app-owned
`/data/setup/connection.json` (0600; directory 0700). Until then, nonempty existing
Supervisor DB options remain authoritative, including existing Alpha installations.
Status exposes authority, never credentials. Supervisor DB edits after wizard
handover have no effect and are explicitly documented. MQTT/log options stay with
Supervisor. Resume state and provisioning request are app-owned; secrets are not
Registry data. Connections cannot be replaced during runtime: diagnosis is allowed,
reconfiguration requires an explicit confirmation and next app start. No automatic
app or HA restart. Existing identity is reconciled by the existing contract.

Probe before migration: PostgreSQL >=14, non-superuser application role, database
contents and identity. Empty database requires an explicit initialize confirmation;
database-only identity requires explicit adoption of the exact UUID. Arbitrary
foreign schema is rejected. No app-side administrator credentials. Failed probe
does not persist a replacement connection. Interrupted identity initialization is
resumed through the private prepared identity, not a new UUID. One-time initialize
and adoption flags are consumed only after successful runtime initialization.

## Provisioning

Generate a reviewable Python/psql script for the prepared LXC. PostgreSQL admin
authentication remains local peer authentication. No password arguments or SQL in
shell history. Password generated locally with secrets; private atomic resume file
and ownership comments permit restart after role/database creation interruptions.
Existing objects without the matching request marker are rejected; no DROP or
ALTER of foreign objects. The app role owns only its dedicated database/schema
and has no SUPERUSER/CREATEDB/CREATEROLE/REPLICATION/BYPASSRLS. Output is an
explicitly secret import code, not encryption; no claim of a magic secure channel.
TLS verify-full is the default; require/disable need explicit acknowledgement.
No PostgreSQL version can be inferred reliably before authenticated connection.

## Bridge boundary / open release blocker

Keep homeassistant_api=true, hassio_api=false and ssl:ro; no /config mount,
Docker socket, host access, manager role or new Supervisor authority. HA REST/WS
has no supported custom-integration file installation operation. HACS is the
supported file-management route, with an explicit custom-repository install and
HA Core restart; the config entry can then be added through HA's normal config
flow link or, after explicit confirmation, the fixed Bridge-only HA config-flow API.
Existing entries remain untouched. The wizard checks loaded protocol and HA's discoverable integration
list; installed files not yet scanned after a restart cannot be proven via WS.
Report this as unknown/restart required, never infer file absence from unknown_command.
Automatic file installation is blocked under these permissions. The remaining
HACS/restart/config-entry interaction is a SELF-INSTALL-01 release blocker.
No legacy file, entry, state or database is accessed. No automatic registry activation.

## Verification

Tests cover boundary/CSRF/secret redaction, setup without DB, interrupted private
state, provisioning object conflicts/idempotence, TLS, explicit identity/foreign
database rejection, existing Alpha authority, real PG migrations, UI navigation,
Bridge states and no permission expansion. Separate real Supervisor acceptance on
a fresh second instance is required; no current live installation is changed.

Sources: [Ingress](https://developers.home-assistant.io/docs/apps/presentation/#ingress),
[communication](https://developers.home-assistant.io/docs/apps/communication/),
[HACS integration requirements](https://www.hacs.xyz/docs/publish/integration/),
[identity contract](../platform-alpha1/build-specification.md#11-installation-identity-und-isolation).
