import type { TlsSnapshot, TlsProfile } from '../../types.js';
export interface TlsStorage {
    save(snapshot: Omit<TlsSnapshot, 'id'>): TlsSnapshot;
    getHistory(deviceId: string, limit?: number): TlsSnapshot[];
    getLatest(deviceId: string): TlsSnapshot | null;
    clear(deviceId?: string): void;
    /** Number of unique device IDs currently stored. */
    size(): number;
}
/**
 * Create an in-memory TLS snapshot store.
 *
 * Stores at most `maxPerDevice` snapshots per deviceId, dropping the oldest
 * entries once the cap is reached. Snapshots are maintained newest-first.
 *
 * @param maxPerDevice - Maximum snapshots to retain per device. Default: 50.
 */
export declare function createTlsStorage(maxPerDevice?: number): TlsStorage;
/**
 * Produce a deterministic, canonicalised string from a `TlsProfile`.
 *
 * Keys are sorted alphabetically at every nesting level so that two
 * semantically identical profiles always produce the same output regardless
 * of insertion order.
 */
export declare function serializeProfile(profile: TlsProfile): string;
//# sourceMappingURL=inmemory.d.ts.map