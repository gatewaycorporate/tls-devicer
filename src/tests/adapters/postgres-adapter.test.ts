// ────────────────────────────────────────────────────────────
//  postgres-adapter.test.ts — tests for createPostgresAdapter
//  Uses an in-process mock pg pool; no real database required.
// ────────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach } from 'vitest';
import { createPostgresAdapter } from '../../libs/adapters/postgres.js';
import type { AsyncTlsStorage, } from '../../libs/adapters/sqlite.js';
import type { PgPoolLike } from '../../libs/adapters/postgres.js';
import type { TlsProfile } from '../../types.js';

// ── In-memory pg pool mock ────────────────────────────────────

interface StoredRow {
  id: string;
  device_id: string;
  timestamp: string;
  profile: TlsProfile;
}

function createMockPool(): PgPoolLike {
  const rows: StoredRow[] = [];

  return {
    async query(
      text: string,
      values?: unknown[],
    ): Promise<{ rows: Record<string, unknown>[] }> {
      const sql = text.replace(/\s+/g, ' ').trim().toUpperCase();

      // CREATE TABLE / CREATE INDEX — no-ops
      if (sql.startsWith('CREATE TABLE') || sql.startsWith('CREATE INDEX')) {
        return { rows: [] };
      }

      // INSERT INTO tls_snapshots (id, device_id, timestamp, profile) VALUES ($1,$2,$3,$4)
      if (sql.startsWith('INSERT INTO TLS_SNAPSHOTS')) {
        const [id, device_id, timestamp, profile] = values as [string, string, string, string];
        rows.push({ id, device_id, timestamp, profile: JSON.parse(profile) as TlsProfile });
        return { rows: [] };
      }

      // DELETE FROM tls_snapshots WHERE device_id = $1
      if (
        sql.startsWith('DELETE FROM TLS_SNAPSHOTS WHERE DEVICE_ID') &&
        values?.length
      ) {
        const deviceId = values[0] as string;
        const before = rows.length;
        rows.splice(0, before, ...rows.filter((r) => r.device_id !== deviceId));
        return { rows: [] };
      }

      // DELETE FROM tls_snapshots  (all)
      if (sql.startsWith('DELETE FROM TLS_SNAPSHOTS')) {
        rows.splice(0, rows.length);
        return { rows: [] };
      }

      // SELECT * FROM tls_snapshots WHERE device_id = $1 ORDER BY timestamp DESC LIMIT $2
      if (sql.startsWith('SELECT') && values?.length) {
        const deviceId = values[0] as string;
        const limit    = values[1] as number | undefined;
        const filtered = rows
          .filter((r) => r.device_id === deviceId)
          .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
        const result = limit !== undefined ? filtered.slice(0, limit) : filtered;
        return {
          rows: result.map((r) => ({
            id: r.id,
            device_id: r.device_id,
            timestamp: r.timestamp,
            profile: r.profile, // JSONB — already an object
          })),
        };
      }

      return { rows: [] };
    },
  };
}

// ── Fixtures ──────────────────────────────────────────────────

const profileA: TlsProfile = {
  ja4: 't13d1516h2_8daaf6152771',
  ja3: 'b32309a26951912be7dba376398571b',
  cipherSuites: [4865, 4866, 4867],
  extensions: [0, 23],
};

const profileB: TlsProfile = {
  ja4: 't13d1516h2_different',
  cipherSuites: [49195, 49199],
};

// ── Suite ─────────────────────────────────────────────────────

describe('createPostgresAdapter', () => {
  let adapter: AsyncTlsStorage;

  beforeEach(async () => {
    adapter = createPostgresAdapter(createMockPool());
    await adapter.init();
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
  });

  it('getHistory() returns snapshots newest-first', async () => {
    const t1 = new Date('2025-01-01T00:00:00Z');
    const t2 = new Date('2025-06-01T00:00:00Z');
    await adapter.save({ deviceId: 'dev1', timestamp: t1, profile: profileA });
    await adapter.save({ deviceId: 'dev1', timestamp: t2, profile: profileB });
    const history = await adapter.getHistory('dev1');
    expect(history).toHaveLength(2);
    expect(history[0].profile.ja4).toBe(profileB.ja4);
  });

  it('getHistory() respects limit', async () => {
    for (let i = 0; i < 5; i++) {
      await adapter.save({ deviceId: 'dev1', timestamp: new Date(i * 1000), profile: {} });
    }
    const limited = await adapter.getHistory('dev1', 3);
    expect(limited).toHaveLength(3);
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

  it('getHistory() returns Date objects for timestamp', async () => {
    await adapter.save({ deviceId: 'dev1', timestamp: new Date(), profile: {} });
    const [snap] = await adapter.getHistory('dev1');
    expect(snap.timestamp).toBeInstanceOf(Date);
  });

  it('round-trips a TlsProfile that contains arrays and nested objects', async () => {
    const snap = await adapter.save({ deviceId: 'dev1', timestamp: new Date(), profile: profileA });
    const latest = await adapter.getLatest('dev1');
    // profile was stored as JSONB (already an object back from mock)
    expect(latest!.profile.cipherSuites).toEqual(profileA.cipherSuites);
    expect(latest!.id).toBe(snap.id);
  });
});
