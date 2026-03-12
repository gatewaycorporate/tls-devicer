// ────────────────────────────────────────────────────────────
//  storage — in-memory TLS snapshot store (mirrors ip-devicer)
// ────────────────────────────────────────────────────────────

import { randomUUID } from 'node:crypto';
import type { TlsSnapshot, TlsProfile } from '../../types.js';

export interface TlsStorage {
  save(snapshot: Omit<TlsSnapshot, 'id'>): TlsSnapshot;
  getHistory(deviceId: string, limit?: number): TlsSnapshot[];
  getLatest(deviceId: string): TlsSnapshot | null;
  clear(deviceId?: string): void;
}

/**
 * Create an in-memory TLS snapshot store.
 *
 * Stores at most `maxPerDevice` snapshots per deviceId, dropping the oldest
 * entries once the cap is reached. Snapshots are maintained newest-first.
 *
 * @param maxPerDevice - Maximum snapshots to retain per device. Default: 50.
 */
export function createTlsStorage(maxPerDevice = 50): TlsStorage {
  const store = new Map<string, TlsSnapshot[]>();

  function getList(deviceId: string): TlsSnapshot[] {
    if (!store.has(deviceId)) store.set(deviceId, []);
    return store.get(deviceId)!;
  }

  return {
    save(partial): TlsSnapshot {
      const snapshot: TlsSnapshot = { ...partial, id: randomUUID() };
      const list = getList(snapshot.deviceId);
      // newest first
      list.unshift(snapshot);
      if (list.length > maxPerDevice) list.splice(maxPerDevice);
      return snapshot;
    },

    getHistory(deviceId, limit): TlsSnapshot[] {
      const list = getList(deviceId);
      return limit !== undefined ? list.slice(0, limit) : list.slice();
    },

    getLatest(deviceId): TlsSnapshot | null {
      return getList(deviceId)[0] ?? null;
    },

    clear(deviceId?: string): void {
      if (deviceId !== undefined) {
        store.delete(deviceId);
      } else {
        store.clear();
      }
    },
  };
}

// ── Profile serialiser (for TLSH input) ──────────────────────

/**
 * Produce a deterministic, canonicalised string from a `TlsProfile`.
 *
 * Keys are sorted alphabetically at every nesting level so that two
 * semantically identical profiles always produce the same output regardless
 * of insertion order.
 */
export function serializeProfile(profile: TlsProfile): string {
  function canonical(val: unknown): string {
    if (val === null || val === undefined) return '';
    if (typeof val !== 'object') return String(val);
    if (Array.isArray(val)) return `[${val.map(canonical).join(',')}]`;
    const obj = val as Record<string, unknown>;
    return `{${Object.keys(obj)
      .sort()
      .map((k) => `${k}:${canonical(obj[k])}`)
      .join(',')}}`;
  }
  return canonical(profile);
}
