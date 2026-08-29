import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL || '';

// If DATABASE_URL is set, connect via postgres.js client
// disable prefetch as it is not supported for "Transaction" pooler
const client = connectionString
  ? postgres(connectionString, { prepare: false })
  : (null as unknown as postgres.Sql);

export const db = client ? drizzle(client, { schema }) : null;
export { schema };
