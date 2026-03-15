// ────────────────────────────────────────────────────────────
//  postgres adapter — persistent TLS snapshot store
//  Requires peer dependency: pg
// ────────────────────────────────────────────────────────────
import { randomUUID } from 'node:crypto';
/**
 * Create a {@link AsyncTlsStorage} backed by a PostgreSQL database via
 * the `pg` package.
 *
 * The adapter creates the `tls_snapshots` table automatically on the first
 * call to `init()`. Pass a `pg.Pool` or `pg.Client` as the first argument.
 *
 * @param pool - An initialised `pg.Pool` or `pg.Client` (or any compatible
 *   object exposing a `query(text, values?)` method).
 * @returns An `AsyncTlsStorage` instance. Call `init()` before any other method.
 *
 * @example
 * ```ts
 * import { Pool } from 'pg';
 * const pool = new Pool({ connectionString: process.env.DATABASE_URL });
 * const adapter = createPostgresAdapter(pool);
 * await adapter.init();
 * ```
 */
export function createPostgresAdapter(pool) {
    return {
        async init() {
            await pool.query(`
        CREATE TABLE IF NOT EXISTS tls_snapshots (
          id         TEXT PRIMARY KEY,
          device_id  TEXT NOT NULL,
          timestamp  TEXT NOT NULL,
          profile    JSONB NOT NULL
        )
      `);
            await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_tls_device_ts
          ON tls_snapshots (device_id, timestamp DESC)
      `);
        },
        async save(partial) {
            const snapshot = { ...partial, id: randomUUID() };
            await pool.query(`INSERT INTO tls_snapshots (id, device_id, timestamp, profile)
         VALUES ($1, $2, $3, $4)`, [
                snapshot.id,
                snapshot.deviceId,
                snapshot.timestamp.toISOString(),
                JSON.stringify(snapshot.profile),
            ]);
            return snapshot;
        },
        async getHistory(deviceId, limit = 50) {
            const { rows } = await pool.query(`SELECT * FROM tls_snapshots
         WHERE device_id = $1
         ORDER BY timestamp DESC
         LIMIT $2`, [deviceId, limit]);
            return rows.map(rowToSnapshot);
        },
        async getLatest(deviceId) {
            const { rows } = await pool.query(`SELECT * FROM tls_snapshots
         WHERE device_id = $1
         ORDER BY timestamp DESC
         LIMIT 1`, [deviceId]);
            return rows.length > 0 ? rowToSnapshot(rows[0]) : null;
        },
        async clear(deviceId) {
            if (deviceId !== undefined) {
                await pool.query(`DELETE FROM tls_snapshots WHERE device_id = $1`, [deviceId]);
            }
            else {
                await pool.query(`DELETE FROM tls_snapshots`);
            }
        },
        async size() {
            const { rows } = await pool.query(`SELECT COUNT(DISTINCT device_id) as count FROM tls_snapshots`);
            const row = rows[0];
            return row ? row.count : 0;
        }
    };
}
// ── Internal helpers ─────────────────────────────────────────
function rowToSnapshot(row) {
    const profileRaw = row['profile'];
    return {
        id: row['id'],
        deviceId: row['device_id'],
        timestamp: new Date(row['timestamp']),
        profile: (typeof profileRaw === 'string'
            ? JSON.parse(profileRaw)
            : profileRaw),
    };
}
//# sourceMappingURL=postgres.js.map