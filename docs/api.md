# HTTP/WS API, protocol 1

Consumer: Port 8787, `Authorization: Bearer <consumer_token>`; Admin-Token erlaubt
zusätzlich Administration. Ingress: Port 8099, ausschließlich Supervisor-Peer.
Health-Endpunkte auf 8787 benötigen kein Token. JSON-Zeiten sind RFC3339 UTC.
Der Client installiert sich aus `client/` und importiert keinen Plattformcode.

| Methode | `/api/v1/`-Pfad | Ergebnis |
|---|---|---|
| GET | info, types | Installation/Versionen; registrierte Schemas und Parameter |
| GET | contracts, contracts/{id} | Envelopes; disabled ergibt 409 `contract_disabled` |
| GET | snapshot?contracts=id1,id2 | konsistenter Stand einer Publication |
| GET | diagnostics/problems | Service-Zustand und Feldprobleme |
| POST / GET | commands / commands/{id} | persistiertes Command-Ergebnis |
| GET | diagnostics | Admin: Komponenten, Queues, Epoche, Gaps |
| GET | sources, bindings, evidence/{source_id}, history/{contract_id} | Admin-Diagnose |
| GET | registry/active, registry/active/export | Revision bzw. reine Konfiguration |
| GET | registry/revisions, registry/revisions/{n} | unveränderliche Historie |
| GET / POST | registry/drafts | auflisten / JSON-Konfiguration als Draft importieren |
| GET / PUT | registry/drafts/{id} | lesen / `{config, draft_version}` mit OCC speichern |
| POST | registry/drafts/{id}/validate | Validierung und Diff zur aktiven Revision |
| POST | registry/drafts/{id}/activate | `{draft_version, expected_active_revision}` |
| POST | registry/rollback | `{revision, expected_active_revision}`; neue Revisionsnummer |
| GET / POST | tokens / tokens/rotate | Rollen / `{role}` → einmaliger neuer Token |

Commands: `command_id`, `contract_id`, `command`, `args`, `origin {kind,actor,client_name}`,
`issued_at`, `valid_until` (Pflicht), optional `expected_registry_revision`.
In Alpha 1 fordert nur `request_b` an `test.state_machine` eine Transition an.
Der Guard entscheidet. Ergebnisse: accepted, rejected mit Reason, expired,
not_supported, command_id_conflict. Gleiche ID/Inhalt liefert das gespeicherte
Ergebnis; bei DB-Ausfall kein Ack. Beliebige Wertmutation ist nicht vorgesehen.

## WebSocket

`GET /api/v1/ws` mit Bearer-Header. Zuerst
`{type:"hello", protocol_version:1, expected_installation_id:"..."}`.
Antwort `welcome` oder `installation_mismatch`. Anschließend
`{type:"subscribe", id:"...", contracts:["fixture.echo"]}`; `contracts:null`
abonniert alle aktiven Instanzen. `snapshot` liefert Epoche, Sequenz und Envelopes.
`delta` enthält `prev_seq`, `publication_seq`, Epoche und den konsistenten neuen
Stand. Gelöschte/deaktivierte Instanzen fehlen im neuen Stand.

Lücken, Epochenwechsel und langsame Subscriber ergeben `resync_required`.
Es gibt kein Replay; neu subscriben liefert einen atomaren Snapshot. `service_state`
zeigt Readiness und `publication_confirmed`; alte Quality wird bei DB-Ausfall
nicht umgeschrieben. Ping/Pong und `going_away` sind Transportereignisse.

`CoreContractsClient(base_url, token, expected_installation_id)` wird als async
Context Manager verwendet. Methoden: info, snapshot, contract, subscribe
(Async-Iterator), command. Der Client prüft die Installations-ID, resynchronisiert
automatisch und fragt nach verlorener Command-Antwort die stabile ID ab.
Er verändert weder Status noch Quality.
