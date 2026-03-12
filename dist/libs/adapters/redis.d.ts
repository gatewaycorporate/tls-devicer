import type { AsyncTlsStorage } from './sqlite.js';
/**
 * Minimal subset of the ioredis / node-redis API used by this adapter.
 * Pass an `ioredis` `Redis` instance (or any compatible client) that
 * implements these methods.
 */
export interface RedisLike {
    hset(key: string, field: string, value: string): Promise<unknown>;
    hgetall(key: string): Promise<Record<string, string> | null>;
    del(key: string): Promise<unknown>;
    keys(pattern: string): Promise<string[]>;
    expire(key: string, seconds: number): Promise<unknown>;
}
/**
 * Create a {@link AsyncTlsStorage} backed by Redis.
 *
 * **Key schema**
 * - `tls:device:<deviceId>` — Hash mapping snapshot IDs → serialised
 *   {@link TlsSnapshot} JSON. Keys expire after 90 days.
 *
 * `init()` is a no-op; Redis requires no schema setup.
 *
 * @param redis - An initialised Redis client that satisfies {@link RedisLike}
 *   (e.g. an `ioredis` instance).
 * @returns An `AsyncTlsStorage` instance. Call `init()` before any other method.
 *
 * @example
 * ```ts
 * import Redis from 'ioredis';
 * const redis = new Redis(process.env.REDIS_URL);
 * const adapter = createRedisAdapter(redis);
 * await adapter.init(); // no-op
 * ```
 */
export declare function createRedisAdapter(redis: RedisLike): AsyncTlsStorage;
//# sourceMappingURL=redis.d.ts.map