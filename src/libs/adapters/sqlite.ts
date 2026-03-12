// ────────────────────────────────────────────────────────────
//  sqlite adapter — persistent TLS snapshot store
//  Requires peer dependency: better-sqlite3
// ────────────────────────────────────────────────────────────

import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import type { TlsSnapshot, TlsProfile } from '../../types.js';

const _require = createRequire(import.meta.url);

/**
 * Async variant of {@link TlsStorage} for adapters backed by external
 * persistent stores (SQLite, PostgreSQL, Redis).
 */
export interface AsyncTlsStorage {
  /** One-time initialisation — creates the table/schema if it does not exist. */
  init(): Promise<void>;
  save(snapshot: Omit<TlsSnapshot, 'id'>): Promise<TlsSnapshot>;
  getHistory(deviceId: string, limit?: number): Promise<TlsSnapshot[]>;
  getLatest(deviceId: string): Promise<TlsSnapshot | null>;
  clear(deviceId?: string): Promise<void>;
}

interface BetterSqlite3Database {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...args: unknown[]): unknown;
    get(...args: unknown[]): unknown;
    all(...args: unknown[]): unknown[];
  };
  close(): void;
}

type DatabaseFactory = (path: string) => BetterSqlite3Database;

/**
 * Create a {@link AsyncTlsStorage} backed by a SQLite file via
 * `better-sqlite3`.
 *
 * The adapter creates the `tls_snapshots` table automatically on the first
 * call to `init()`.
 *
 * @param dbPath - Path to the SQLite database file, e.g. `"./tls.db"`.
 *   Use `":memory:"` for tests.
 * @returns An `AsyncTlsStorage` instance. Call `init()` before any other method.
 *
 * @example
 * ```ts
 * const adapter = createSqliteAdapter('./tls.db');
 * await adapter.init();
 * await adapter.save({ deviceId: 'dev1', timestamp: new Date(), profile: {} });
 * ```
 */
export function createSqliteAdapter(dbPath: string): AsyncTlsStorage {
  const Database = _require('better-sqlite3') as DatabaseFactory;
  const db = Database(dbPath);

  return {
    async init(): Promise<void> {
      db.exec(`
        CREATE TABLE IF NOT EXISTS tls_snapshots (
          id         TEXT PRIMARY KEY,
          device_id  TEXT NOT NULL,
          timestamp  TEXT NOT NULL,
          profile    TEXT NOT NULL
        )
      `);
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_tls_device_ts
          ON tls_snapshots (device_id, timestamp DESC)
      `);
    },

    async save(partial): Promise<TlsSnapshot> {
      const snapshot: TlsSnapshot = { ...partial, id: randomUUID() };
      db.prepare(
        `INSERT INTO tls_snapshots (id, device_id, timestamp, profile)
         VALUES (?, ?, ?, ?)`,
      ).run(
        snapshot.id,
        snapshot.deviceId,
        snapshot.timestamp.toISOString(),
        JSON.stringify(snapshot.profile),
      );
      return snapshot;
    },

    async getHistory(deviceId, limit): Promise<TlsSnapshot[]> {
      const rows =
        limit !== undefined
          ? (db
              .prepare(
                `SELECT * FROM tls_snapshots
                 WHERE device_id = ?
                 ORDER BY timestamp DESC
                 LIMIT ?`,
              )
              .all(deviceId, limit) as RawRow[])
          : (db
              .prepare(
                `SELECT * FROM tls_snapshots
                 WHERE device_id = ?
                 ORDER BY timestamp DESC`,
              )
              .all(deviceId) as RawRow[]);
      return rows.map(rowToSnapshot);
    },

    async getLatest(deviceId): Promise<TlsSnapshot | null> {
      const row = db
        .prepare(
          `SELECT * FROM tls_snapshots
           WHERE device_id = ?
           ORDER BY timestamp DESC
           LIMIT 1`,
        )
        .get(deviceId) as RawRow | undefined;
      return row ? rowToSnapshot(row) : null;
    },

    async clear(deviceId?: string): Promise<void> {
      if (deviceId !== undefined) {
        db.prepare(`DELETE FROM tls_snapshots WHERE device_id = ?`).run(deviceId);
      } else {
        db.exec(`DELETE FROM tls_snapshots`);
      }
    },
  };
}

// ── Internal helpers ─────────────────────────────────────────

interface RawRow {
  id: string;
  device_id: string;
  timestamp: string;
  profile: string;
}

function rowToSnapshot(row: RawRow): TlsSnapshot {
  return {
    id: row.id,
    deviceId: row.device_id,
    timestamp: new Date(row.timestamp),
    profile: JSON.parse(row.profile) as TlsProfile,
  };
}
