// src/types/db.ts
export type ConversationRow = {
  id: string;
  user_id: string;
  created_at: Date;
  emotional_intensity: number | null;
  prediction_error: number | null;
  last_dream_at: Date | null;
};

export type MessageRow = {
  id: string;
  conversation_id: string;
  user_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: Date;
};

export type EntityFactRow = {
  id: string;
  user_id: string;
  content: string;
  salience: number;
  created_at: Date;
  updated_at: Date;
};
