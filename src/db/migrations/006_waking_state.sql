-- Add category and supersession tracking to entity_facts
ALTER TABLE entity_facts
  ADD COLUMN category text NOT NULL DEFAULT 'user',
  ADD COLUMN superseded_at timestamptz;

-- New dream_artifacts table (replaces dream_residues)
CREATE TABLE dream_artifacts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dream_run_id uuid NOT NULL REFERENCES dream_runs(id) ON DELETE CASCADE,
  user_id      text NOT NULL,
  type         text NOT NULL,
  prose        text NOT NULL,
  embedding    vector(768),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX dream_artifacts_user_type_created_idx
  ON dream_artifacts(user_id, type, created_at DESC);

-- Migrate existing dream_residues rows into dream_artifacts
INSERT INTO dream_artifacts (id, dream_run_id, user_id, type, prose, embedding, created_at)
SELECT id, dream_run_id, user_id, 'residue', prose, embedding, created_at
FROM dream_residues;

DROP TABLE dream_residues;
