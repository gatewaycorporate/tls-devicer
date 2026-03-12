import type { TlsSnapshot } from '../../types.js';
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
export declare function createSqliteAdapter(dbPath: string): AsyncTlsStorage;
//# sourceMappingURL=sqlite.d.ts.map