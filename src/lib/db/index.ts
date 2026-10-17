import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL || '';

// Cache client across hot-reloads & serverless warm invocations
declare global {
  var _globalPostgresClient: postgres.Sql | undefined;
}

const maxConnections = process.env.DB_MAX_CONNECTIONS
  ? parseInt(process.env.DB_MAX_CONNECTIONS, 10)
  : (process.env.NODE_ENV === 'production' ? 5 : 10);

const client = connectionString
  ? (global._globalPostgresClient ??= postgres(connectionString, {
      prepare: false,
      max: maxConnections,
      idle_timeout: 15,
      connect_timeout: 10,
      ssl: 'require',
    }))
  : (null as unknown as postgres.Sql);

export const sqlClient = client;
export const db = client ? drizzle(client, { schema }) : null;
export { schema };

