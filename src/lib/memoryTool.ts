// src/lib/memoryTool.ts
import { tool } from 'ai';
import { z } from 'zod';
import { embed } from './embed.js';
import {
  searchDescriptors,
  describeEntity,
  upsertDescriptor,
  upsertEntity,
  linkDescriptorToEntity,
  upsertEntityRelation,
} from './graph.js';

const DEFAULT_USER_ID = 'default';
const REMEMBER_SIMILARITY_THRESHOLD = 0.85;

export const memoryTool = tool({
  description: `Query and write to the Being's long-term graph memory.

Pass args as an array of strings:
- ["search", "query text"] — semantic similarity search over all active descriptors
- ["about", "entity name"] — describe an entity: its descriptors and relations
- ["remember", "entity name", "descriptor text"] — write a new fact about an entity (category defaults to "user"; pass "world" or "being" as a fourth arg to override)
- ["link", "entity A", "relation type", "entity B"] — assert a relation between two entities (e.g. ["link", "Devin", "works_on", "Being Project"])`,
  inputSchema: z.object({
    args: z.array(z.string()).describe('Command and arguments'),
    userId: z.string().default(DEFAULT_USER_ID),
  }),
  execute: async ({ args, userId }) => {
    const [command, ...rest] = args;

    if (command === 'search') {
      const query = rest.join(' ');
      if (!query) return { error: 'search requires a query string' };
      const embedding = await Promise.race([
        embed(query),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('embed timeout')), 10000)),
      ]);
      const results = await searchDescriptors(userId, embedding, 10);
      return {
        results: results.map(r => ({
          content: r.content,
          category: r.category,
          salience: r.salience,
          similarity: r.similarity,
        })),
      };
    }

    if (command === 'about') {
      const name = rest.join(' ');
      if (!name) return { error: 'about requires an entity name' };
      const description = await describeEntity(userId, name);
      if (!description) return { found: false, name };
      return {
        found: true,
        entity: { name: description.entity.name },
        descriptors: description.descriptors.map(d => ({
          content: d.content,
          category: d.category,
          salience: d.salience,
        })),
        relations: description.relations,
      };
    }

    if (command === 'remember') {
      const [entityName, content, rawCategory] = rest;
      if (!entityName || !content) return { error: 'remember requires entity and content' };
      const category =
        rawCategory === 'world' || rawCategory === 'being' ? rawCategory : 'user';

      const embedding = await embed(content).catch(() => undefined);
      if (embedding) {
        const similar = await searchDescriptors(userId, embedding, 3).catch(() => []);
        const match = similar.find(s => s.similarity >= REMEMBER_SIMILARITY_THRESHOLD);
        if (match) {
          return { alreadyKnown: true, similar: { content: match.content, similarity: match.similarity } };
        }
      }

      const descriptorId = await upsertDescriptor(userId, content, category, 0.8, embedding);
      const entityId = await upsertEntity(userId, entityName);
      await linkDescriptorToEntity(userId, entityId, descriptorId);
      return { remembered: true, entity: entityName, descriptorId };
    }

    if (command === 'link') {
      const [fromName, type, toName] = rest;
      if (!fromName || !type || !toName) return { error: 'link requires fromName, type, toName' };
      await upsertEntityRelation(userId, fromName, toName, type);
      return { linked: true, from: fromName, type, to: toName };
    }

    return { error: `unknown command "${command}". Valid commands: search, about, remember, link` };
  },
});
