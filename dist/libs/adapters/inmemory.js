// ────────────────────────────────────────────────────────────
//  storage — in-memory TLS snapshot store (mirrors ip-devicer)
// ────────────────────────────────────────────────────────────
import { randomUUID } from 'node:crypto';
/**
 * Create an in-memory TLS snapshot store.
 *
 * Stores at most `maxPerDevice` snapshots per deviceId, dropping the oldest
 * entries once the cap is reached. Snapshots are maintained newest-first.
 *
 * @param maxPerDevice - Maximum snapshots to retain per device. Default: 50.
 */
export function createTlsStorage(maxPerDevice = 50) {
    const store = new Map();
    function getList(deviceId) {
        if (!store.has(deviceId))
            store.set(deviceId, []);
        return store.get(deviceId);
    }
    return {
        init() {
            // No async initialisation needed for in-memory store, but method is required by interface
            return Promise.resolve();
        },
        save(partial) {
            const snapshot = { ...partial, id: randomUUID() };
            const list = getList(snapshot.deviceId);
            // newest first
            list.unshift(snapshot);
            if (list.length > maxPerDevice)
                list.splice(maxPerDevice);
            return snapshot;
        },
        getHistory(deviceId, limit) {
            const list = getList(deviceId);
            return limit !== undefined ? list.slice(0, limit) : list.slice();
        },
        getLatest(deviceId) {
            return getList(deviceId)[0] ?? null;
        },
        clear(deviceId) {
            if (deviceId !== undefined) {
                store.delete(deviceId);
            }
            else {
                store.clear();
            }
        },
        size() {
            return store.size;
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
export function serializeProfile(profile) {
    function canonical(val) {
        if (val === null || val === undefined)
            return '';
        if (typeof val !== 'object')
            return String(val);
        if (Array.isArray(val))
            return `[${val.map(canonical).join(',')}]`;
        const obj = val;
        return `{${Object.keys(obj)
            .sort()
            .map((k) => `${k}:${canonical(obj[k])}`)
            .join(',')}}`;
    }
    return canonical(profile);
}
//# sourceMappingURL=inmemory.js.map