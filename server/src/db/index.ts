/**
 * Database adapter.
 *  - DATABASE_URL set  -> real PostgreSQL / Supabase via `pg`
 *  - DATABASE_URL empty -> embedded PostgreSQL (PGlite) on disk: zero setup for demos
 * Both speak the same SQL with $1-style parameters.
 */
import fs from 'node:fs';
import { config } from '../config';
import { SCHEMA_SQL } from './schema';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;

interface Driver {
  kind: 'postgres' | 'pglite';
  query: (sql: string, params?: unknown[]) => Promise<Row[]>;
  exec: (sql: string) => Promise<void>;
}

let driver: Driver | null = null;

/** Return DATE columns as plain 'YYYY-MM-DD' strings (no time-zone shifting). */
const DATE_OID = 1082;

export async function initDb(): Promise<Driver['kind']> {
  if (driver) return driver.kind;
  if (config.databaseUrl) {
    const pg = (await import('pg')).default;
    pg.types.setTypeParser(DATE_OID, (v: string) => v);
    const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 });
    driver = {
      kind: 'postgres',
      query: async (sql, params) => (await pool.query(sql, params as unknown[])).rows,
      exec: async (sql) => {
        await pool.query(sql);
      },
    };
  } else {
    const { PGlite } = await import('@electric-sql/pglite');
    fs.mkdirSync(config.pgliteDir, { recursive: true });
    const lite = new PGlite(config.pgliteDir, { parsers: { [DATE_OID]: (v: string) => v } });
    driver = {
      kind: 'pglite',
      query: async (sql, params) => (await lite.query<Row>(sql, params as unknown[])).rows,
      exec: async (sql) => {
        await lite.exec(sql);
      },
    };
  }
  await driver.exec(SCHEMA_SQL);
  return driver.kind;
}

function db(): Driver {
  if (!driver) throw new Error('Database not initialised — call initDb() first');
  return driver;
}

export const q = <T extends Row = Row>(sql: string, params: unknown[] = []) => db().query(sql, params) as Promise<T[]>;

export async function one<T extends Row = Row>(sql: string, params: unknown[] = []): Promise<T | undefined> {
  return (await q<T>(sql, params))[0];
}

export const json = (v: unknown) => JSON.stringify(v ?? null);
