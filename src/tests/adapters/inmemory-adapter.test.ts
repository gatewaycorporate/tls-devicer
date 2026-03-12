import { describe, it, expect } from 'vitest';
import { createTlsStorage, serializeProfile } from '../../libs/adapters/inmemory.js';
import type { TlsProfile } from '../../types.js';

// ── serializeProfile ──────────────────────────────────────────

describe('serializeProfile', () => {
  it('serialises a simple profile to a stable string', () => {
    const profile: TlsProfile = { ja4: 'abc', ja3: 'def' };
    const out = serializeProfile(profile);
    expect(typeof out).toBe('string');
    expect(out).toContain('abc');
    expect(out).toContain('def');
  });

  it('produces the same output regardless of property insertion order', () => {
    const a = serializeProfile({ ja4: 'x', ja3: 'y', cipherSuites: [1, 2] });
    const b = serializeProfile({ cipherSuites: [1, 2], ja3: 'y', ja4: 'x' });
    expect(a).toBe(b);
  });

  it('handles nested Http2SettingsMap', () => {
    const profile: TlsProfile = { http2Settings: { headerTableSize: 65536, enablePush: 0 } };
    const out = serializeProfile(profile);
    expect(out).toContain('65536');
    expect(out).toContain('0');
  });

  it('handles arrays in the profile', () => {
    const profile: TlsProfile = { cipherSuites: [1, 2, 3], extensions: [10, 11] };
    const out = serializeProfile(profile);
    expect(out).toContain('[1,2,3]');
    expect(out).toContain('[10,11]');
  });

  it('handles an empty profile without throwing', () => {
    expect(() => serializeProfile({})).not.toThrow();
    expect(serializeProfile({})).toBe('{}');
  });
});

// ── createTlsStorage ──────────────────────────────────────────

describe('createTlsStorage', () => {
  it('saves a snapshot and returns it with an id', () => {
    const store = createTlsStorage();
    const snap = store.save({ deviceId: 'd1', timestamp: new Date(), profile: { ja4: 'x' } });
    expect(snap.id).toBeTruthy();
    expect(snap.deviceId).toBe('d1');
  });

  it('getHistory returns newest-first', () => {
    const store = createTlsStorage();
    const t1 = new Date(1000);
    const t2 = new Date(2000);
    store.save({ deviceId: 'd1', timestamp: t1, profile: { ja4: 'first' } });
    store.save({ deviceId: 'd1', timestamp: t2, profile: { ja4: 'second' } });
    const history = store.getHistory('d1');
    expect(history[0].profile.ja4).toBe('second');
    expect(history[1].profile.ja4).toBe('first');
  });

  it('getHistory respects limit', () => {
    const store = createTlsStorage();
    for (let i = 0; i < 5; i++) {
      store.save({ deviceId: 'd1', timestamp: new Date(), profile: { ja4: String(i) } });
    }
    expect(store.getHistory('d1', 3)).toHaveLength(3);
  });

  it('getHistory returns all when no limit', () => {
    const store = createTlsStorage();
    for (let i = 0; i < 5; i++) {
      store.save({ deviceId: 'd1', timestamp: new Date(), profile: {} });
    }
    expect(store.getHistory('d1')).toHaveLength(5);
  });

  it('getLatest returns the most-recent snapshot', () => {
    const store = createTlsStorage();
    store.save({ deviceId: 'd1', timestamp: new Date(1000), profile: { ja4: 'old' } });
    store.save({ deviceId: 'd1', timestamp: new Date(2000), profile: { ja4: 'new' } });
    expect(store.getLatest('d1')!.profile.ja4).toBe('new');
  });

  it('getLatest returns null for an unknown device', () => {
    const store = createTlsStorage();
    expect(store.getLatest('no-such-device')).toBeNull();
  });

  it('enforces maxPerDevice cap', () => {
    const store = createTlsStorage(3);
    for (let i = 0; i < 5; i++) {
      store.save({ deviceId: 'd1', timestamp: new Date(), profile: {} });
    }
    expect(store.getHistory('d1')).toHaveLength(3);
  });

  it('clear(deviceId) removes only that device', () => {
    const store = createTlsStorage();
    store.save({ deviceId: 'a', timestamp: new Date(), profile: {} });
    store.save({ deviceId: 'b', timestamp: new Date(), profile: {} });
    store.clear('a');
    expect(store.getHistory('a')).toHaveLength(0);
    expect(store.getHistory('b')).toHaveLength(1);
  });

  it('clear() with no arg removes all devices', () => {
    const store = createTlsStorage();
    store.save({ deviceId: 'a', timestamp: new Date(), profile: {} });
    store.save({ deviceId: 'b', timestamp: new Date(), profile: {} });
    store.clear();
    expect(store.getHistory('a')).toHaveLength(0);
    expect(store.getHistory('b')).toHaveLength(0);
  });

  it('isolates history between devices', () => {
    const store = createTlsStorage();
    store.save({ deviceId: 'x', timestamp: new Date(), profile: { ja4: 'x' } });
    store.save({ deviceId: 'y', timestamp: new Date(), profile: { ja4: 'y' } });
    expect(store.getHistory('x')).toHaveLength(1);
    expect(store.getHistory('y')).toHaveLength(1);
  });
});
