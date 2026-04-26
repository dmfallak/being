// src/lib/memoryTool.ts
import { tool } from 'ai';
import { z } from 'zod';
import { embed } from './embed.js';
import { searchDescriptors, describeEntity } from './graph.js';

const DEFAULT_USER_ID = 'default';

export const memoryTool = tool({
  description: `Query the Being's long-term graph memory. Use this to recall what you know about a person, project, or concept, or to search by semantic similarity.

Pass args as an array of strings:
- ["search", "query text"] — semantic similarity search over all active descriptors
- ["about", "entity name"] — describe an entity: its descriptors and relations to other entities`,
  inputSchema: z.object({
    args: z.array(z.string()).describe('Command and arguments'),
    userId: z.string().default(DEFAULT_USER_ID),
  }),
  execute: async ({ args, userId }) => {
    const [command, ...rest] = args;

    if (command === 'search') {
      const query = rest.join(' ');
      if (!query) return { error: 'search requires a query string' };
      const embedding = await embed(query);
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

    return { error: `unknown command "${command}". Valid commands: search, about` };
  },
});
