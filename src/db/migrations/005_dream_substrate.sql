-- No explicit BEGIN/COMMIT: src/db/migrate.ts wraps each file in a transaction.

CREATE TABLE IF NOT EXISTS dream_runs (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  text NOT NULL,
  started_at               timestamptz NOT NULL,
  completed_at             timestamptz,
  conversations_processed  int NOT NULL DEFAULT 0,
  facts_created            int NOT NULL DEFAULT 0,
  facts_reinforced         int NOT NULL DEFAULT 0,
  cap_hit                  boolean NOT NULL DEFAULT false,
  error                    text
);
CREATE INDEX IF NOT EXISTS dream_runs_user_started_idx
  ON dream_runs (user_id, started_at DESC);

CREATE TABLE IF NOT EXISTS dream_residues (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dream_run_id  uuid NOT NULL REFERENCES dream_runs(id) ON DELETE CASCADE,
  user_id       text NOT NULL,
  prose         text NOT NULL,
  embedding     vector(768),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dream_residues_user_created_idx
  ON dream_residues (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS conversations_user_undreamed_idx
  ON conversations (user_id) WHERE last_dream_at IS NULL;

ALTER TABLE entity_facts
  ADD COLUMN IF NOT EXISTS last_reinforced_at timestamptz NOT NULL DEFAULT now();
