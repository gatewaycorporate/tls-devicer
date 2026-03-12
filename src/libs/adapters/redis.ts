// ────────────────────────────────────────────────────────────
//  redis adapter — persistent TLS snapshot store
//  Requires peer dependency: ioredis (or any compatible Redis client)
// ────────────────────────────────────────────────────────────

import { randomUUID } from 'node:crypto';
import type { TlsSnapshot, TlsProfile } from '../../types.js';
import type { AsyncTlsStorage } from './sqlite.js';

const TTL_SECONDS = 90 * 24 * 60 * 60; // 90-day expiry per device key

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
export function createRedisAdapter(redis: RedisLike): AsyncTlsStorage {
  const deviceKey = (deviceId: string): string => `tls:device:${deviceId}`;

  return {
    async init(): Promise<void> {
      // Redis requires no schema setup.
    },

    async save(partial): Promise<TlsSnapshot> {
      const snapshot: TlsSnapshot = { ...partial, id: randomUUID() };
      const key = deviceKey(snapshot.deviceId);
      await redis.hset(key, snapshot.id, JSON.stringify(snapshot));
      await redis.expire(key, TTL_SECONDS);
      return snapshot;
    },

    async getHistory(deviceId, limit): Promise<TlsSnapshot[]> {
      const raw = await redis.hgetall(deviceKey(deviceId));
      if (!raw) return [];
      const all = Object.values(raw)
        .map((v) => {
          const s = JSON.parse(v) as { id: string; deviceId: string; timestamp: string | Date; profile: TlsProfile };
          return {
            id: s.id,
            deviceId: s.deviceId,
            timestamp: new Date(s.timestamp),
            profile: s.profile,
          } satisfies TlsSnapshot;
        })
        // newest-first
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      return limit !== undefined ? all.slice(0, limit) : all;
    },

    async getLatest(deviceId): Promise<TlsSnapshot | null> {
      const raw = await redis.hgetall(deviceKey(deviceId));
      if (!raw) return null;
      const values = Object.values(raw);
      if (values.length === 0) return null;
      return values
        .map((v) => {
          const s = JSON.parse(v) as { id: string; deviceId: string; timestamp: string | Date; profile: TlsProfile };
          return {
            id: s.id,
            deviceId: s.deviceId,
            timestamp: new Date(s.timestamp),
            profile: s.profile,
          } satisfies TlsSnapshot;
        })
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())[0]!;
    },

    async clear(deviceId?: string): Promise<void> {
      if (deviceId !== undefined) {
        await redis.del(deviceKey(deviceId));
      } else {
        const keys = await redis.keys('tls:device:*');
        await Promise.all(keys.map((k) => redis.del(k)));
      }
    },
  };
}
