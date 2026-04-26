// src/lib/webSearchTool.ts
import { tool } from 'ai';
import { z } from 'zod';
import { config } from './config.js';

const BRAVE_SEARCH_URL = 'https://api.search.brave.com/res/v1/web/search';

export const webSearchTool = tool({
  description: `Search the web for current information. Use this when you need to look up recent events, facts you are uncertain about, or anything likely to have changed since your training cutoff (early 2024). Returns titles, URLs, and snippets — evaluate them yourself rather than treating them as authoritative.`,
  inputSchema: z.object({
    query: z.string().describe('Search query'),
    count: z.number().int().min(1).max(10).default(5).describe('Number of results to return'),
  }),
  execute: async ({ query, count }) => {
    const apiKey = config.BRAVE_SEARCH_API_KEY;
    if (!apiKey) return { error: 'BRAVE_SEARCH_API_KEY not configured' };

    const url = new URL(BRAVE_SEARCH_URL);
    url.searchParams.set('q', query);
    url.searchParams.set('count', String(count));

    const response = await fetch(url.toString(), {
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': apiKey,
      },
    });

    if (!response.ok) {
      return { error: `Brave Search API error: ${response.status} ${response.statusText}` };
    }

    const data = await response.json() as {
      web?: { results?: Array<{ title: string; url: string; description?: string }> };
    };

    const results = data.web?.results ?? [];
    return {
      results: results.map(r => ({
        title: r.title,
        url: r.url,
        snippet: r.description ?? '',
      })),
    };
  },
});
