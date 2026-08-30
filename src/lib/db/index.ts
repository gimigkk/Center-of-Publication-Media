import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL || '';

// Cache client across hot-reloads & serverless warm invocations
declare global {
  // eslint-disable-next-line no-var
  var _globalPostgresClient: postgres.Sql | undefined;
}

const client = connectionString
  ? (global._globalPostgresClient ??= postgres(connectionString, {
      prepare: false,
      max: 10,
      idle_timeout: 30,
      connect_timeout: 10,
      ssl: 'require',
    }))
  : (null as unknown as postgres.Sql);

export const db = client ? drizzle(client, { schema }) : null;
export { schema };

