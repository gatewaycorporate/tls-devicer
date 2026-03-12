// ────────────────────────────────────────────────────────────
//  redis-adapter.test.ts — tests for createRedisAdapter
//  Uses an in-process mock Redis client; no real Redis required.
// ────────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach } from 'vitest';
import { createRedisAdapter } from '../../libs/adapters/redis.js';
import type { AsyncTlsStorage } from '../../libs/adapters/sqlite.js';
import type { RedisLike } from '../../libs/adapters/redis.js';
import type { TlsProfile } from '../../types.js';

// ── In-memory Redis mock ──────────────────────────────────────

function createMockRedis(): RedisLike {
  // Each device key maps to a hash: { [field]: serialisedJson }
  const store = new Map<string, Map<string, string>>();

  return {
    async hset(key: string, field: string, value: string): Promise<number> {
      if (!store.has(key)) store.set(key, new Map());
      store.get(key)!.set(field, value);
      return 1;
    },

    async hgetall(key: string): Promise<Record<string, string> | null> {
      const hash = store.get(key);
      if (!hash || hash.size === 0) return null;
      return Object.fromEntries(hash.entries());
    },

    async del(key: string): Promise<number> {
      return store.delete(key) ? 1 : 0;
    },

    async keys(pattern: string): Promise<string[]> {
      // Support simple glob `prefix*` patterns used by the adapter.
      const regExp = new RegExp(
        '^' + pattern.replace(/[-[\]{}()+?.,\\^$|#\s]/g, '\\$&').replace(/\*/g, '.*') + '$',
      );
      return [...store.keys()].filter((k) => regExp.test(k));
    },

    async expire(_key: string, _seconds: number): Promise<number> {
      return 1; // TTL not modelled
    },
  };
}

// ── Fixtures ──────────────────────────────────────────────────

const profileA: TlsProfile = {
  ja4: 't13d1516h2_8daaf6152771',
  ja3: 'b32309a26951912be7dba376398571b',
  cipherSuites: [4865, 4866, 4867],
  extensions: [0, 23],
  http2Settings: { headerTableSize: 65536 },
};

const profileB: TlsProfile = {
  ja4: 't13d1516h2_different',
  cipherSuites: [49195, 49199],
};

// ── Suite ─────────────────────────────────────────────────────

describe('createRedisAdapter', () => {
  let adapter: AsyncTlsStorage;

  beforeEach(async () => {
    adapter = createRedisAdapter(createMockRedis());
    await adapter.init(); // no-op
  });

  it('init() resolves without error', async () => {
    await expect(adapter.init()).resolves.toBeUndefined();
  });

  it('save() returns the snapshot with a generated id', async () => {
    const snap = await adapter.save({
      deviceId: 'dev1',
      timestamp: new Date(),
      profile: profileA,
    });
    expect(snap.id).toBeTruthy();
    expect(snap.deviceId).toBe('dev1');
    expect(snap.profile).toEqual(profileA);
    expect(snap.timestamp).toBeInstanceOf(Date);
  });

  it('getHistory() returns snapshots newest-first', async () => {
    const t1 = new Date('2025-01-01T00:00:00Z');
    const t2 = new Date('2025-06-01T00:00:00Z');
    await adapter.save({ deviceId: 'dev1', timestamp: t1, profile: profileA });
    await adapter.save({ deviceId: 'dev1', timestamp: t2, profile: profileB });
    const history = await adapter.getHistory('dev1');
    expect(history).toHaveLength(2);
    expect(history[0].timestamp.toISOString()).toBe(t2.toISOString());
    expect(history[1].timestamp.toISOString()).toBe(t1.toISOString());
  });

  it('getHistory() respects limit', async () => {
    for (let i = 0; i < 5; i++) {
      await adapter.save({ deviceId: 'dev1', timestamp: new Date(i * 1000), profile: {} });
    }
    expect(await adapter.getHistory('dev1', 3)).toHaveLength(3);
  });

  it('getHistory() returns all when no limit given', async () => {
    for (let i = 0; i < 4; i++) {
      await adapter.save({ deviceId: 'dev1', timestamp: new Date(i * 1000), profile: {} });
    }
    expect(await adapter.getHistory('dev1')).toHaveLength(4);
  });

  it('getHistory() returns [] for an unknown device', async () => {
    expect(await adapter.getHistory('ghost')).toEqual([]);
  });

  it('getHistory() isolates results per device', async () => {
    await adapter.save({ deviceId: 'dev1', timestamp: new Date(), profile: profileA });
    await adapter.save({ deviceId: 'dev2', timestamp: new Date(), profile: profileB });
    expect(await adapter.getHistory('dev1')).toHaveLength(1);
    expect(await adapter.getHistory('dev2')).toHaveLength(1);
  });

  it('getLatest() returns the most-recent snapshot', async () => {
    const old    = new Date('2024-01-01T00:00:00Z');
    const recent = new Date('2025-01-01T00:00:00Z');
    await adapter.save({ deviceId: 'dev1', timestamp: old,    profile: profileA });
    await adapter.save({ deviceId: 'dev1', timestamp: recent, profile: profileB });
    const latest = await adapter.getLatest('dev1');
    expect(latest).not.toBeNull();
    expect(latest!.profile.ja4).toBe(profileB.ja4);
  });

  it('getLatest() returns null for an unknown device', async () => {
    expect(await adapter.getLatest('ghost')).toBeNull();
  });

  it('clear(deviceId) removes only that device', async () => {
    await adapter.save({ deviceId: 'dev1', timestamp: new Date(), profile: profileA });
    await adapter.save({ deviceId: 'dev2', timestamp: new Date(), profile: profileB });
    await adapter.clear('dev1');
    expect(await adapter.getHistory('dev1')).toEqual([]);
    expect(await adapter.getHistory('dev2')).toHaveLength(1);
  });

  it('clear() with no argument removes all devices', async () => {
    await adapter.save({ deviceId: 'dev1', timestamp: new Date(), profile: profileA });
    await adapter.save({ deviceId: 'dev2', timestamp: new Date(), profile: profileB });
    await adapter.clear();
    expect(await adapter.getHistory('dev1')).toEqual([]);
    expect(await adapter.getHistory('dev2')).toEqual([]);
  });

  it('getLatest() returns null when device key exists but is empty (hgetall null)', async () => {
    // An empty hgetall response is treated as no snapshots.
    const emptyMock: RedisLike = {
      hset: async () => 0,
      hgetall: async () => null,
      del: async () => 0,
      keys: async () => [],
      expire: async () => 0,
    };
    const emptyAdapter = createRedisAdapter(emptyMock);
    expect(await emptyAdapter.getLatest('dev1')).toBeNull();
  });

  it('round-trips a TlsProfile with arrays and nested objects', async () => {
    const snap = await adapter.save({ deviceId: 'dev1', timestamp: new Date(), profile: profileA });
    const latest = await adapter.getLatest('dev1');
    expect(latest!.profile).toEqual(profileA);
    expect(latest!.id).toBe(snap.id);
  });

  it('getHistory() returns Date objects for timestamp', async () => {
    await adapter.save({ deviceId: 'dev1', timestamp: new Date(), profile: {} });
    const [snap] = await adapter.getHistory('dev1');
    expect(snap.timestamp).toBeInstanceOf(Date);
  });
});
