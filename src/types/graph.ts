// src/types/graph.ts
export type EntityNode = {
  id: string;
  name: string;
  userId: string;
  createdAt: string;
};

export type DescriptorNode = {
  id: string;
  content: string;
  userId: string;
  category: 'user' | 'world' | 'being';
  salience: number;
  supersededAt: string | null;
  embedding: number[] | null;
  createdAt: string;
  updatedAt: string;
  lastReinforcedAt: string;
};

export type RelationRecord = {
  toName: string;
  type: string;
};

export type EntityDescription = {
  entity: EntityNode;
  descriptors: DescriptorNode[];
  relations: RelationRecord[];
};
