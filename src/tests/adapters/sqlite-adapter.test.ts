// ────────────────────────────────────────────────────────────
//  sqlite-adapter.test.ts — tests for createSqliteAdapter
//  Uses a real :memory: SQLite database via better-sqlite3.
// ────────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach } from 'vitest';
import { createSqliteAdapter } from '../../libs/adapters/sqlite.js';
import type { AsyncTlsStorage } from '../../libs/adapters/sqlite.js';
import type { TlsProfile } from '../../types.js';

// ── Fixtures ──────────────────────────────────────────────────

const profileA: TlsProfile = {
  ja4: 't13d1516h2_8daaf6152771',
  ja3: 'b32309a26951912be7dba376398571b',
  cipherSuites: [4865, 4866, 4867, 49195, 49199],
  extensions: [0, 23, 65281, 10, 11, 35, 16, 5, 13],
  http2Settings: { headerTableSize: 65536, enablePush: 0 },
  headerOrder: ['host', 'user-agent', 'accept'],
};

const profileB: TlsProfile = {
  ja4: 't13d1516h2_different',
  ja3: 'aabbccddeeff00112233445566778899',
  cipherSuites: [49195, 49199, 49196],
};

// ── Suite ─────────────────────────────────────────────────────

describe('createSqliteAdapter', () => {
  let adapter: AsyncTlsStorage;

  beforeEach(async () => {
    // Fresh in-memory database per test.
    adapter = createSqliteAdapter(':memory:');
    await adapter.init();
  });

  it('init() is idempotent — calling twice does not throw', async () => {
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
    const limited = await adapter.getHistory('dev1', 3);
    expect(limited).toHaveLength(3);
  });

  it('getHistory() returns all when no limit given', async () => {
    for (let i = 0; i < 4; i++) {
      await adapter.save({ deviceId: 'dev1', timestamp: new Date(i * 1000), profile: {} });
    }
    const all = await adapter.getHistory('dev1');
    expect(all).toHaveLength(4);
  });

  it('getHistory() returns [] for an unknown device', async () => {
    expect(await adapter.getHistory('no-such-device')).toEqual([]);
  });

  it('getHistory() isolates results per device', async () => {
    await adapter.save({ deviceId: 'dev1', timestamp: new Date(), profile: profileA });
    await adapter.save({ deviceId: 'dev2', timestamp: new Date(), profile: profileB });
    const h1 = await adapter.getHistory('dev1');
    const h2 = await adapter.getHistory('dev2');
    expect(h1).toHaveLength(1);
    expect(h2).toHaveLength(1);
    expect(h1[0].deviceId).toBe('dev1');
    expect(h2[0].deviceId).toBe('dev2');
  });

  it('getLatest() returns the most-recent snapshot', async () => {
    const old = new Date('2024-01-01');
    const recent = new Date('2025-01-01');
    await adapter.save({ deviceId: 'dev1', timestamp: old, profile: profileA });
    await adapter.save({ deviceId: 'dev1', timestamp: recent, profile: profileB });
    const latest = await adapter.getLatest('dev1');
    expect(latest).not.toBeNull();
    expect(latest!.timestamp.toISOString()).toBe(recent.toISOString());
    expect(latest!.profile.ja4).toBe(profileB.ja4);
  });

  it('getLatest() returns null for an unknown device', async () => {
    expect(await adapter.getLatest('ghost-device')).toBeNull();
  });

  it('clear(deviceId) removes only that device', async () => {
    await adapter.save({ deviceId: 'dev1', timestamp: new Date(), profile: profileA });
    await adapter.save({ deviceId: 'dev2', timestamp: new Date(), profile: profileB });
    await adapter.clear('dev1');
    expect(await adapter.getHistory('dev1')).toHaveLength(0);
    expect(await adapter.getHistory('dev2')).toHaveLength(1);
  });

  it('clear() with no argument removes all devices', async () => {
    await adapter.save({ deviceId: 'dev1', timestamp: new Date(), profile: profileA });
    await adapter.save({ deviceId: 'dev2', timestamp: new Date(), profile: profileB });
    await adapter.clear();
    expect(await adapter.getHistory('dev1')).toHaveLength(0);
    expect(await adapter.getHistory('dev2')).toHaveLength(0);
  });

  it('round-trips complex TlsProfile without data loss', async () => {
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
