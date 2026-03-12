import type { AsyncTlsStorage } from './sqlite.js';
/**
 * Minimal subset of the `pg` Pool/Client API used by this adapter.
 * Pass a `pg.Pool` or `pg.Client` instance — both satisfy this interface.
 */
export interface PgPoolLike {
    query(text: string, values?: unknown[]): Promise<{
        rows: Record<string, unknown>[];
    }>;
}
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
export declare function createPostgresAdapter(pool: PgPoolLike): AsyncTlsStorage;
//# sourceMappingURL=postgres.d.ts.map