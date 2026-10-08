-- Bounded latest-history reads must not sort the complete append-only history.
CREATE INDEX contract_history_latest ON contract_state_history
    ((payload->>'contract_id'), ((payload->>'publication_seq')::bigint) DESC, key DESC);
CREATE INDEX registry_revision_latest ON registry_revision
    (((payload->>'revision')::bigint) DESC);
