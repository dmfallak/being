CREATE TABLE IF NOT EXISTS entity_facts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     text NOT NULL,
  content     text NOT NULL,
  embedding   vector(768),
  salience    float NOT NULL DEFAULT 1.0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS entity_episodes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          text NOT NULL,
  conversation_id  uuid REFERENCES conversations(id),
  content          text NOT NULL,
  embedding        vector(768),
  salience         float NOT NULL,
  decay_factor     float NOT NULL DEFAULT 0.95,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS entity_traces (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          text NOT NULL,
  conversation_id  uuid REFERENCES conversations(id),
  content          text NOT NULL,
  embedding        vector(768),
  salience         float NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS predictions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            text NOT NULL,
  expected_embedding vector(768) NOT NULL,
  confidence         float NOT NULL DEFAULT 1.0,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS entity_facts_embedding_idx
  ON entity_facts USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE INDEX IF NOT EXISTS entity_episodes_embedding_idx
  ON entity_episodes USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE INDEX IF NOT EXISTS entity_traces_embedding_idx
  ON entity_traces USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE INDEX IF NOT EXISTS predictions_embedding_idx
  ON predictions USING ivfflat (expected_embedding vector_cosine_ops)
  WITH (lists = 100);
