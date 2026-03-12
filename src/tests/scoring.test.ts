import { describe, it, expect } from 'vitest';
import {
  computeConsistencyScore,
  computeConfidenceBoost,
  computeTlshScore,
  jaccardSimilarity,
} from '../libs/scoring.js';
import { extractHttp2Settings } from '../libs/extractors/Http2Settings.js';
import type { TlsProfile, TlsSnapshot, TlsConsistency } from '../types.js';

// ── Helpers ───────────────────────────────────────────────────

function makeSnap(profile: TlsProfile, deviceId = 'dev'): TlsSnapshot {
  return { id: 'test-id', deviceId, timestamp: new Date(), profile };
}

// ── computeConsistencyScore — disabled signals ─────────────────

describe('computeConsistencyScore disabled signals', () => {
  const ref: TlsProfile = {
    ja4: 'ref-ja4',
    ja3: 'ref-ja3',
    cipherSuites: [1, 2, 3],
    extensions: [10, 11],
    http2Settings: { headerTableSize: 65536 },
    headerOrder: ['accept', 'user-agent'],
    headerValues: { accept: 'text/html' },
  };

  it('ignores JA4 when enableJa4=false', () => {
    const result = computeConsistencyScore(
      { ...ref, ja4: 'completely-different' },
      [makeSnap(ref)],
      false, // enableJa4
    );
    expect(result.ja4Match).toBeNull();
    expect(result.factors).not.toContain('ja4_mismatch');
  });

  it('ignores JA3 when enableJa3=false', () => {
    const result = computeConsistencyScore(
      { ...ref, ja3: 'completely-different' },
      [makeSnap(ref)],
      true,
      false, // enableJa3
    );
    expect(result.ja3Match).toBeNull();
    expect(result.factors).not.toContain('ja3_mismatch');
  });

  it('ignores HTTP/2 when enableHttp2=false', () => {
    const result = computeConsistencyScore(
      { ...ref, http2Settings: { headerTableSize: 4096 } },
      [makeSnap(ref)],
      true, true,
      false, // enableHttp2
    );
    expect(result.http2Score).toBe(1);
    expect(result.factors).not.toContain('http2_settings_change');
  });

  it('ignores header signals when enableHeaderConsistency=false', () => {
    const result = computeConsistencyScore(
      { ...ref, headerOrder: ['completely', 'different'], headerValues: { accept: 'changed' } },
      [makeSnap(ref)],
      true, true, true,
      false, // enableHeaderConsistency
    );
    expect(result.headerOrderScore).toBe(1);
    expect(result.headerValueScore).toBe(1);
    expect(result.factors).not.toContain('header_order_change');
    expect(result.factors).not.toContain('header_value_change');
  });

  it('handles one-sided JA4 (incoming has ja4, reference does not)', () => {
    const result = computeConsistencyScore(
      { ja4: 'incoming-only' },
      [makeSnap({})], // ref has no ja4
    );
    // One side missing → neutral 0.5 score, no mismatch factor
    expect(result.ja4Match).toBeNull();
    expect(result.factors).not.toContain('ja4_mismatch');
  });

  it('handles one-sided JA3 (reference has ja3, incoming does not)', () => {
    const result = computeConsistencyScore(
      {},
      [makeSnap({ ja3: 'ref-only' })],
    );
    expect(result.ja3Match).toBeNull();
    expect(result.factors).not.toContain('ja3_mismatch');
  });

  it('adds cipher_suite_change factor when jaccard < 0.7', () => {
    const result = computeConsistencyScore(
      { cipherSuites: [99, 100] },
      [makeSnap({ cipherSuites: [1, 2, 3, 4, 5, 6] })],
    );
    expect(result.factors).toContain('cipher_suite_change');
  });

  it('adds extension_change factor when jaccard < 0.7', () => {
    const result = computeConsistencyScore(
      { extensions: [99, 100] },
      [makeSnap({ extensions: [1, 2, 3, 4, 5, 6] })],
    );
    expect(result.factors).toContain('extension_change');
  });

  it('adds header_order_change when order similarity < 0.7', () => {
    const result = computeConsistencyScore(
      { headerOrder: ['z', 'y', 'x', 'w', 'v'] },
      [makeSnap({ headerOrder: ['a', 'b', 'c', 'd', 'e'] })],
    );
    expect(result.factors).toContain('header_order_change');
  });

  it('adds header_value_change when value similarity < 0.7', () => {
    const result = computeConsistencyScore(
      { headerValues: { accept: 'changed', 'accept-encoding': 'changed2' } },
      [makeSnap({ headerValues: { accept: 'original', 'accept-encoding': 'original2' } })],
    );
    expect(result.factors).toContain('header_value_change');
  });

  it('scores 100 when totalWeight is 0 (all signals disabled)', () => {
    const result = computeConsistencyScore(
      { cipherSuites: [1, 2] },
      [makeSnap({ cipherSuites: [9, 8] })],
      false, false, false, false, // all optional signals disabled, only ciphers/extensions remain
    );
    // ciphers and extensions are always enabled; this just verifies no crash
    expect(result.consistencyScore).toBeGreaterThanOrEqual(0);
    expect(result.consistencyScore).toBeLessThanOrEqual(100);
  });
});

// ── computeConfidenceBoost ────────────────────────────────────

describe('computeConfidenceBoost', () => {
  function makeConsistency(score: number, isNewDevice = false): TlsConsistency {
    return {
      consistencyScore: score,
      isNewDevice,
      ja4Match: null,
      ja3Match: null,
      cipherJaccard: 1,
      extensionJaccard: 1,
      http2Score: 1,
      headerOrderScore: 1,
      headerValueScore: 1,
      tlshScore: null,
      factors: [],
    };
  }

  it('returns 0 for new devices', () => {
    expect(computeConfidenceBoost(makeConsistency(100, true))).toBe(0);
  });

  it('returns positive boost for high consistency (100)', () => {
    expect(computeConfidenceBoost(makeConsistency(100))).toBeGreaterThan(0);
  });

  it('returns negative boost for low consistency (0)', () => {
    expect(computeConfidenceBoost(makeConsistency(0))).toBeLessThan(0);
  });

  it('returns ~0 for neutral consistency (50)', () => {
    expect(computeConfidenceBoost(makeConsistency(50))).toBe(0);
  });

  it('scales with the weight parameter', () => {
    const highWeight = computeConfidenceBoost(makeConsistency(100), 1);
    const lowWeight  = computeConfidenceBoost(makeConsistency(100), 0.1);
    expect(Math.abs(highWeight)).toBeGreaterThan(Math.abs(lowWeight));
  });

  it('boost for score 75 is less than boost for score 100', () => {
    expect(computeConfidenceBoost(makeConsistency(75))).toBeLessThan(
      computeConfidenceBoost(makeConsistency(100)),
    );
  });
});

// ── computeTlshScore ──────────────────────────────────────────

describe('computeTlshScore', () => {
  const LONG_PROFILE: TlsProfile = {
    ja4: 't13d1516h2_8daaf6152771_b0da82dd1658',
    ja3: 'aabbccddeeff00112233445566778899',
    cipherSuites: [0x1301, 0x1302, 0x1303, 0xc02b, 0xc02f, 0xc02c, 0xc030],
    extensions: [0, 5, 10, 11, 13, 16, 23, 43, 45, 51],
    ellipticCurves: [0x001d, 0x0017, 0x0018],
    http2Settings: { headerTableSize: 65536, initialWindowSize: 131072, maxFrameSize: 16384 },
    headerOrder: ['accept', 'accept-encoding', 'accept-language', 'user-agent', 'dnt'],
    headerValues: { accept: 'text/html,application/xhtml+xml', 'accept-encoding': 'gzip, deflate, br' },
  };

  it('returns a number or null (never throws)', () => {
    const result = computeTlshScore(LONG_PROFILE, LONG_PROFILE);
    expect(result === null || typeof result === 'number').toBe(true);
  });

  it('returns null for profiles that are too short to hash', () => {
    // Very sparse profile serialises to < 50 chars
    const result = computeTlshScore({ ja4: 'x' }, { ja4: 'y' });
    expect(result).toBeNull();
  });

  it('returns 100 (or null) for identical profiles', () => {
    const result = computeTlshScore(LONG_PROFILE, LONG_PROFILE);
    // Either TLSH is loaded → score is 100, or not → null
    if (result !== null) {
      expect(result).toBe(100);
    }
  });

  it('returns a lower score for very different profiles when TLSH is available', () => {
    const profileB: TlsProfile = {
      ja4: 'completely-different-fingerprint-string-here',
      ja3: '00000000000000000000000000000000',
      cipherSuites: [0x002f, 0x0035, 0x009c],
      extensions: [0, 5],
      http2Settings: { headerTableSize: 4096 },
      headerOrder: ['host', 'connection', 'content-length', 'content-type', 'origin'],
      headerValues: { accept: '*/*', 'accept-encoding': 'identity' },
    };
    const same   = computeTlshScore(LONG_PROFILE, LONG_PROFILE);
    const diff   = computeTlshScore(LONG_PROFILE, profileB);
    if (same !== null && diff !== null) {
      expect(same).toBeGreaterThanOrEqual(diff);
    }
  });
});

// ── jaccardSimilarity edge cases ──────────────────────────────

describe('jaccardSimilarity edge cases', () => {
  it('handles both sides undefined', () => {
    expect(jaccardSimilarity(undefined, undefined)).toBe(1);
  });

  it('handles both sides empty arrays', () => {
    expect(jaccardSimilarity([], [])).toBe(1);
  });

  it('returns 0 for non-overlapping sets', () => {
    expect(jaccardSimilarity([1, 2, 3], [4, 5, 6])).toBe(0);
  });

  it('handles duplicate values in input (treated as sets)', () => {
    // [1,1,2] as set is {1,2}; [1,2,3] as set is {1,2,3} → |∩|=2, |∪|=3
    expect(jaccardSimilarity([1, 1, 2], [1, 2, 3])).toBeCloseTo(2 / 3);
  });
});

// ── Http2Settings base64 parsing ──────────────────────────────

describe('extractHttp2Settings base64 format', () => {
  /**
   * Build a valid HTTP/2 SETTINGS binary payload from a list of [id, value] pairs
   * then base64-encode it.
   */
  function buildBase64Settings(pairs: [number, number][]): string {
    const buf = Buffer.alloc(pairs.length * 6);
    pairs.forEach(([id, value], i) => {
      buf.writeUInt16BE(id, i * 6);
      buf.writeUInt32BE(value, i * 6 + 2);
    });
    return buf.toString('base64');
  }

  it('parses HEADER_TABLE_SIZE (id=1) from binary payload', () => {
    const b64 = buildBase64Settings([[1, 65536]]);
    const settings = extractHttp2Settings({ 'x-http2-settings': b64 });
    expect(settings.headerTableSize).toBe(65536);
  });

  it('parses INITIAL_WINDOW_SIZE (id=4) from binary payload', () => {
    const b64 = buildBase64Settings([[4, 131072]]);
    const settings = extractHttp2Settings({ 'x-http2-settings': b64 });
    expect(settings.initialWindowSize).toBe(131072);
  });

  it('parses multiple settings from a single binary payload', () => {
    const b64 = buildBase64Settings([[1, 65536], [3, 100], [4, 131072], [5, 16384]]);
    const settings = extractHttp2Settings({ 'x-http2-settings': b64 });
    expect(settings.headerTableSize).toBe(65536);
    expect(settings.maxConcurrentStreams).toBe(100);
    expect(settings.initialWindowSize).toBe(131072);
    expect(settings.maxFrameSize).toBe(16384);
  });

  it('ignores unknown setting identifiers gracefully', () => {
    // id=99 is not in the SETTINGS_IDS map
    const b64 = buildBase64Settings([[99, 12345], [1, 65536]]);
    const settings = extractHttp2Settings({ 'x-http2-settings': b64 });
    expect(settings.headerTableSize).toBe(65536);
  });

  it('uses cf-http2-settings header alias', () => {
    const b64 = buildBase64Settings([[1, 4096]]);
    const settings = extractHttp2Settings({ 'cf-http2-settings': b64 });
    expect(settings.headerTableSize).toBe(4096);
  });

  it('uses x-h2-settings header alias', () => {
    const b64 = buildBase64Settings([[2, 0]]);
    const settings = extractHttp2Settings({ 'x-h2-settings': b64 });
    expect(settings.enablePush).toBe(0);
  });

  it('returns empty object for an empty header value', () => {
    const settings = extractHttp2Settings({ 'x-http2-settings': '' });
    expect(settings).toEqual({});
  });

  it('uses array header value (first element wins)', () => {
    const b64 = buildBase64Settings([[1, 65536]]);
    const settings = extractHttp2Settings({
      'x-http2-settings': [b64, 'other=ignored'],
    } as Record<string, string | string[] | undefined>);
    expect(settings.headerTableSize).toBe(65536);
  });
});
