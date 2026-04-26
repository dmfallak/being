// src/types/db.ts
export type ConversationRow = {
  id: string;
  user_id: string;
  created_at: Date;
  emotional_intensity: number | null;
  prediction_error: number | null;
  last_dream_at: Date | null;
  redream_count: number;
  last_redream_at: Date | null;
};

export type MessageRow = {
  id: string;
  conversation_id: string;
  user_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: Date;
};

export type DreamRunRow = {
  id: string;
  user_id: string;
  started_at: Date;
  completed_at: Date | null;
  conversations_processed: number;
  facts_created: number;
  facts_reinforced: number;
  cap_hit: boolean;
  parse_failures: number;
  error: string | null;
};

export type DreamArtifactRow = {
  id: string;
  dream_run_id: string;
  user_id: string;
  type: 'relational_portrait' | 'self_model' | 'world_model' | 'residue';
  prose: string;
  embedding: number[] | null;
  created_at: Date;
};
