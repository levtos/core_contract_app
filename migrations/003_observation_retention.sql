CREATE TABLE cc_observation_index (
  reference text PRIMARY KEY REFERENCES source_observation_history(key) ON DELETE CASCADE,
  source_id text NOT NULL,
  received_at timestamptz NOT NULL
);
CREATE INDEX cc_observation_time ON cc_observation_index(received_at DESC, reference DESC);
CREATE INDEX cc_observation_source_time ON cc_observation_index(source_id, received_at DESC, reference DESC);
CREATE FUNCTION cc_index_observation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO cc_observation_index VALUES (NEW.key, NEW.payload->>'source_id', (NEW.payload->>'received_at')::timestamptz);
  RETURN NEW;
END $$;
CREATE TRIGGER cc_observation_insert AFTER INSERT ON source_observation_history
  FOR EACH ROW EXECUTE FUNCTION cc_index_observation();
INSERT INTO cc_observation_index
  SELECT key, payload->>'source_id', (payload->>'received_at')::timestamptz FROM source_observation_history;

CREATE TABLE cc_observation_rollup (
  source_id text NOT NULL, binding_id text NOT NULL, registry_revision bigint NOT NULL,
  hour timestamptz NOT NULL, count bigint NOT NULL, numeric_count bigint NOT NULL,
  minimum double precision, maximum double precision, total numeric NOT NULL,
  first_at timestamptz NOT NULL, last_at timestamptz NOT NULL,
  rollup_key text GENERATED ALWAYS AS (source_id || ':' || binding_id || ':' || registry_revision::text) STORED,
  PRIMARY KEY(source_id, binding_id, registry_revision, hour)
);
CREATE INDEX cc_rollup_time ON cc_observation_rollup(hour DESC, rollup_key DESC);
CREATE INDEX cc_rollup_source_time ON cc_observation_rollup(source_id, hour DESC, rollup_key DESC);
CREATE TABLE cc_evidence_watermark (
  scope text PRIMARY KEY, max_sequence bigint NOT NULL, retained_after timestamptz NOT NULL
);
