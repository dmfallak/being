-- Note: schema_migrations table is created by migrate.ts before running these files
CREATE TABLE IF NOT EXISTS conversations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  emotional_intensity  float,
  prediction_error     float,
  actual_embedding     vector(768),
  last_dream_at        timestamptz
);

CREATE TABLE IF NOT EXISTS messages (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  uuid NOT NULL REFERENCES conversations(id),
  user_id          text NOT NULL,
  role             text NOT NULL CHECK (role IN ('user', 'assistant')),
  content          text NOT NULL,
  embedding        vector(768),
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS messages_embedding_idx
  ON messages USING hnsw (embedding vector_cosine_ops);
