// ────────────────────────────────────────────────────────────
//  sqlite adapter — persistent TLS snapshot store
//  Requires peer dependency: better-sqlite3
// ────────────────────────────────────────────────────────────
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
const _require = createRequire(import.meta.url);
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
export function createSqliteAdapter(dbPath) {
    const Database = _require('better-sqlite3');
    const db = Database(dbPath);
    return {
        async init() {
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
        async save(partial) {
            const snapshot = { ...partial, id: randomUUID() };
            db.prepare(`INSERT INTO tls_snapshots (id, device_id, timestamp, profile)
         VALUES (?, ?, ?, ?)`).run(snapshot.id, snapshot.deviceId, snapshot.timestamp.toISOString(), JSON.stringify(snapshot.profile));
            return snapshot;
        },
        async getHistory(deviceId, limit) {
            const rows = limit !== undefined
                ? db
                    .prepare(`SELECT * FROM tls_snapshots
                 WHERE device_id = ?
                 ORDER BY timestamp DESC
                 LIMIT ?`)
                    .all(deviceId, limit)
                : db
                    .prepare(`SELECT * FROM tls_snapshots
                 WHERE device_id = ?
                 ORDER BY timestamp DESC`)
                    .all(deviceId);
            return rows.map(rowToSnapshot);
        },
        async getLatest(deviceId) {
            const row = db
                .prepare(`SELECT * FROM tls_snapshots
           WHERE device_id = ?
           ORDER BY timestamp DESC
           LIMIT 1`)
                .get(deviceId);
            return row ? rowToSnapshot(row) : null;
        },
        async clear(deviceId) {
            if (deviceId !== undefined) {
                db.prepare(`DELETE FROM tls_snapshots WHERE device_id = ?`).run(deviceId);
            }
            else {
                db.exec(`DELETE FROM tls_snapshots`);
            }
        },
    };
}
function rowToSnapshot(row) {
    return {
        id: row.id,
        deviceId: row.device_id,
        timestamp: new Date(row.timestamp),
        profile: JSON.parse(row.profile),
    };
}
//# sourceMappingURL=sqlite.js.map