// src/lib/graph.ts
import { getSession } from './neo4j.js';
import type { EntityNode, DescriptorNode, EntityDescription } from '../types/graph.js';

function toDescriptorNode(props: Record<string, unknown>): DescriptorNode {
  return {
    id: props.id as string,
    content: props.content as string,
    userId: props.userId as string,
    category: props.category as 'user' | 'world' | 'being',
    salience: Number(props.salience),
    supersededAt: props.supersededAt ? String(props.supersededAt) : null,
    embedding: props.embedding ? Array.from(props.embedding as number[]) : null,
    createdAt: String(props.createdAt),
    updatedAt: String(props.updatedAt ?? props.createdAt),
    lastReinforcedAt: String(props.lastReinforcedAt ?? props.createdAt),
  };
}

export async function upsertEntity(userId: string, name: string): Promise<string> {
  const session = getSession();
  try {
    const result = await session.run(
      `MERGE (e:Entity {userId: $userId, name: $name})
       ON CREATE SET e.id = randomUUID(), e.createdAt = $now
       RETURN e.id AS id`,
      { userId, name, now: new Date().toISOString() },
    );
    return result.records[0]!.get('id') as string;
  } finally {
    await session.close();
  }
}

export async function upsertDescriptor(
  userId: string,
  content: string,
  category: 'user' | 'world' | 'being',
  salience: number,
  embedding?: number[],
): Promise<string> {
  const session = getSession();
  const now = new Date().toISOString();
  try {
    const result = await session.run(
      `MERGE (d:Descriptor {userId: $userId, content: $content})
       ON CREATE SET d.id = randomUUID(), d.createdAt = $now, d.updatedAt = $now,
                    d.lastReinforcedAt = $now, d.salience = $salience,
                    d.category = $category, d.supersededAt = null,
                    d.embedding = $embedding
       ON MATCH SET d.salience = $salience, d.category = $category,
                   d.updatedAt = $now,
                   d.embedding = CASE WHEN $embedding IS NOT NULL THEN $embedding ELSE d.embedding END
       RETURN d.id AS id`,
      { userId, content, salience, category, embedding: embedding ?? null, now },
    );
    return result.records[0]!.get('id') as string;
  } finally {
    await session.close();
  }
}

export async function linkDescriptorToEntity(
  userId: string,
  entityId: string,
  descriptorId: string,
): Promise<void> {
  const session = getSession();
  try {
    await session.run(
      `MATCH (e:Entity {id: $entityId, userId: $userId})
       MATCH (d:Descriptor {id: $descriptorId, userId: $userId})
       MERGE (e)-[:HAS_DESCRIPTOR]->(d)`,
      { userId, entityId, descriptorId },
    );
  } finally {
    await session.close();
  }
}

export async function upsertEntityRelation(
  userId: string,
  fromName: string,
  toName: string,
  type: string,
): Promise<void> {
  const session = getSession();
  try {
    await session.run(
      `MERGE (from:Entity {userId: $userId, name: $fromName})
       ON CREATE SET from.id = randomUUID(), from.createdAt = $now
       MERGE (to:Entity {userId: $userId, name: $toName})
       ON CREATE SET to.id = randomUUID(), to.createdAt = $now
       MERGE (from)-[:RELATES_TO {type: $type, userId: $userId}]->(to)`,
      { userId, fromName, toName, type, now: new Date().toISOString() },
    );
  } finally {
    await session.close();
  }
}

export async function supersedeDescriptor(descriptorId: string, userId: string): Promise<void> {
  const session = getSession();
  try {
    await session.run(
      `MATCH (d:Descriptor {id: $id, userId: $userId})
       SET d.supersededAt = $now`,
      { id: descriptorId, userId, now: new Date().toISOString() },
    );
  } finally {
    await session.close();
  }
}

export async function reinforceDescriptor(descriptorId: string, userId: string): Promise<void> {
  const session = getSession();
  try {
    await session.run(
      `MATCH (d:Descriptor {id: $id, userId: $userId})
       SET d.salience = CASE WHEN d.salience + 0.1 > 1.0 THEN 1.0 ELSE d.salience + 0.1 END,
           d.lastReinforcedAt = $now`,
      { id: descriptorId, userId, now: new Date().toISOString() },
    );
  } finally {
    await session.close();
  }
}

export async function updateDescriptorSaliences(
  updates: Array<{ id: string; salience: number }>,
  userId: string,
): Promise<void> {
  if (updates.length === 0) return;
  const session = getSession();
  try {
    await session.run(
      `UNWIND $updates AS upd
       MATCH (d:Descriptor {id: upd.id, userId: $userId})
       SET d.salience = upd.salience`,
      { updates, userId },
    );
  } finally {
    await session.close();
  }
}

export async function getActiveDescriptors(
  userId: string,
  category?: 'user' | 'world' | 'being',
): Promise<DescriptorNode[]> {
  const session = getSession();
  try {
    const query = category
      ? `MATCH (d:Descriptor {userId: $userId, category: $category})
         WHERE d.supersededAt IS NULL
         RETURN d ORDER BY d.salience DESC`
      : `MATCH (d:Descriptor {userId: $userId})
         WHERE d.supersededAt IS NULL
         RETURN d ORDER BY d.salience DESC`;
    const result = await session.run(query, { userId, ...(category ? { category } : {}) });
    return result.records.map(r =>
      toDescriptorNode((r.get('d') as { properties: Record<string, unknown> }).properties),
    );
  } finally {
    await session.close();
  }
}

export async function searchDescriptors(
  userId: string,
  embedding: number[],
  limit = 10,
): Promise<Array<DescriptorNode & { similarity: number }>> {
  const session = getSession();
  try {
    const result = await session.run(
      `CALL db.index.vector.queryNodes('descriptor_embedding', $limit, $embedding)
       YIELD node AS d, score
       WHERE d.userId = $userId AND d.supersededAt IS NULL
       RETURN d, score`,
      { userId, embedding, limit },
    );
    return result.records.map(r => ({
      ...toDescriptorNode((r.get('d') as { properties: Record<string, unknown> }).properties),
      similarity: r.get('score') as number,
    }));
  } finally {
    await session.close();
  }
}

export async function getAllEntityNames(userId: string): Promise<string[]> {
  const session = getSession();
  try {
    const result = await session.run(
      `MATCH (e:Entity {userId: $userId}) RETURN e.name AS name`,
      { userId },
    );
    return result.records.map(r => r.get('name') as string);
  } finally {
    await session.close();
  }
}

export async function describeEntity(
  userId: string,
  name: string,
): Promise<EntityDescription | null> {
  const session = getSession();
  try {
    const result = await session.run(
      `MATCH (e:Entity {userId: $userId, name: $name})
       OPTIONAL MATCH (e)-[:HAS_DESCRIPTOR]->(d:Descriptor)
         WHERE d.supersededAt IS NULL
       OPTIONAL MATCH (e)-[r:RELATES_TO]->(other:Entity)
       RETURN e,
              collect(DISTINCT d) AS descriptors,
              collect(DISTINCT {toName: other.name, type: r.type}) AS relations`,
      { userId, name },
    );
    if (result.records.length === 0) return null;
    const rec = result.records[0]!;
    const eProps = (rec.get('e') as { properties: Record<string, unknown> }).properties;
    const entity: EntityNode = {
      id: eProps.id as string,
      name: eProps.name as string,
      userId: eProps.userId as string,
      createdAt: String(eProps.createdAt),
    };
    const rawDescs = rec.get('descriptors') as Array<{ properties: Record<string, unknown> } | null>;
    const descriptors = rawDescs
      .filter((d): d is { properties: Record<string, unknown> } => d !== null && d.properties !== undefined)
      .map(d => toDescriptorNode(d.properties));
    const rawRels = rec.get('relations') as Array<{ toName: string | null; type: string | null }>;
    const relations = rawRels
      .filter(r => r.toName !== null && r.type !== null)
      .map(r => ({ toName: r.toName as string, type: r.type as string }));
    return { entity, descriptors, relations };
  } finally {
    await session.close();
  }
}
