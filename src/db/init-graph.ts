import { getSession } from '../lib/neo4j.js';

export async function initGraph(): Promise<void> {
  const session = getSession();
  try {
    await session.run(
      'CREATE CONSTRAINT entity_unique IF NOT EXISTS FOR (e:Entity) REQUIRE (e.userId, e.name) IS UNIQUE',
    );
    await session.run(
      'CREATE CONSTRAINT descriptor_unique IF NOT EXISTS FOR (d:Descriptor) REQUIRE (d.userId, d.content) IS UNIQUE',
    );
    await session.run(
      `CREATE VECTOR INDEX entity_embedding IF NOT EXISTS
       FOR (e:Entity) ON (e.embedding)
       OPTIONS {indexConfig: {
         \`vector.dimensions\`: 768,
         \`vector.similarity_function\`: 'cosine'
       }}`,
    );
    await session.run(
      `CREATE VECTOR INDEX descriptor_embedding IF NOT EXISTS
       FOR (d:Descriptor) ON (d.embedding)
       OPTIONS {indexConfig: {
         \`vector.dimensions\`: 768,
         \`vector.similarity_function\`: 'cosine'
       }}`,
    );
  } finally {
    await session.close();
  }
}
