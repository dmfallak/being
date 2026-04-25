// src/lib/neo4j.ts
import neo4j from 'neo4j-driver';
import { config } from './config.js';

const driver = neo4j.driver(config.NEO4J_URI);

export function getSession() {
  return driver.session();
}

export async function closeDriver(): Promise<void> {
  await driver.close();
}
