import { describe, it, expect } from 'vitest';
import { parseJa4, parseCodeList, extractTlsFromHeaders } from '../libs/extractors/Ja4Extractor.js';
import { extractHttp2Settings, http2SettingsSimilarity } from '../libs/extractors/Http2Settings.js';
import { extractHeaderSignals, headerOrderSimilarity, headerValueSimilarity } from '../libs/extractors/headers.js';
import { jaccardSimilarity, computeConsistencyScore } from '../libs/scoring.js';
import { buildTlsProfile } from '../libs/middleware.js';
import type { TlsProfile } from '../types.js';

// ── parseJa4 ──────────────────────────────────────────────────

describe('parseJa4', () => {
  it('accepts a well-formed JA4 string', () => {
    const { ja4, valid } = parseJa4('t13d1516h2_8daaf6152771_b0da82dd1658');
    expect(valid).toBe(true);
    expect(ja4).toBe('t13d1516h2_8daaf6152771_b0da82dd1658');
  });

  it('flags an invalid JA4 string as invalid', () => {
    const { valid } = parseJa4('not_a_valid_ja4');
    expect(valid).toBe(false);
  });
});

// ── parseCodeList ─────────────────────────────────────────────

describe('parseCodeList', () => {
  it('parses comma-separated decimals', () => {
    expect(parseCodeList('4865,4866,4867')).toEqual([4865, 4866, 4867]);
  });

  it('parses 0x hex codes', () => {
    expect(parseCodeList('0x1301,0x1302')).toEqual([0x1301, 0x1302]);
  });

  it('strips GREASE values', () => {
    // 0x0a0a is a GREASE value
    expect(parseCodeList('0x0a0a,4865')).toEqual([4865]);
  });

  it('returns empty array for empty string', () => {
    expect(parseCodeList('')).toEqual([]);
  });
});

// ── extractTlsFromHeaders ─────────────────────────────────────

describe('extractTlsFromHeaders', () => {
  it('reads JA4 from x-ja4 header', () => {
    const profile = extractTlsFromHeaders({ 'x-ja4': 't13d1516h2_8daaf6152771_b0da82dd1658' });
    expect(profile.ja4).toBe('t13d1516h2_8daaf6152771_b0da82dd1658');
  });

  it('reads JA3 from x-ja3 header', () => {
    const profile = extractTlsFromHeaders({ 'x-ja3': 'aabbccddeeff00112233445566778899' });
    expect(profile.ja3).toBe('aabbccddeeff00112233445566778899');
  });

  it('reads ciphers from x-tls-ciphers header', () => {
    const profile = extractTlsFromHeaders({ 'x-tls-ciphers': '4865,4866,4867' });
    expect(profile.cipherSuites).toEqual([4865, 4866, 4867]);
  });

  it('reads extensions from x-tls-extensions header', () => {
    const profile = extractTlsFromHeaders({ 'x-tls-extensions': '0,5,10,11' });
    expect(profile.extensions).toEqual([0, 5, 10, 11]);
  });

  it('returns empty partial profile when no relevant headers', () => {
    const profile = extractTlsFromHeaders({ 'host': 'example.com' });
    expect(Object.keys(profile)).toHaveLength(0);
  });
});

// ── extractHttp2Settings ──────────────────────────────────────

describe('extractHttp2Settings', () => {
  it('parses k=v CSV format', () => {
    const settings = extractHttp2Settings({
      'x-http2-settings': 'header_table_size=65536,initial_window_size=131072',
    });
    expect(settings.headerTableSize).toBe(65536);
    expect(settings.initialWindowSize).toBe(131072);
  });

  it('parses numeric id=value format', () => {
    const settings = extractHttp2Settings({
      'x-http2-settings': '1=65536,4=131072',
    });
    expect(settings.headerTableSize).toBe(65536);
    expect(settings.initialWindowSize).toBe(131072);
  });

  it('returns empty object with no h2 header', () => {
    expect(extractHttp2Settings({ 'host': 'example.com' })).toEqual({});
  });
});

describe('http2SettingsSimilarity', () => {
  it('returns 1 for identical settings', () => {
    const s = { headerTableSize: 65536 };
    expect(http2SettingsSimilarity(s, s)).toBe(1);
  });

  it('returns < 1 for differing settings', () => {
    const a = { headerTableSize: 65536 };
    const b = { headerTableSize: 4096 };
    expect(http2SettingsSimilarity(a, b)).toBeLessThan(1);
  });

  it('returns 1 for two empty settings', () => {
    expect(http2SettingsSimilarity({}, {})).toBe(1);
  });
});

// ── header extraction ─────────────────────────────────────────

describe('extractHeaderSignals', () => {
  it('excludes proxy-injected headers from order', () => {
    const { headerOrder } = extractHeaderSignals({
      'accept': 'text/html',
      'x-ja4': 'fingerprint',
      'host': 'example.com',
    });
    expect(headerOrder).not.toContain('x-ja4');
    expect(headerOrder).not.toContain('host');
    expect(headerOrder).toContain('accept');
  });

  it('captures stable header values', () => {
    const { headerValues } = extractHeaderSignals({
      'accept': 'text/html',
      'accept-encoding': 'gzip',
    });
    expect(headerValues?.['accept']).toBe('text/html');
    expect(headerValues?.['accept-encoding']).toBe('gzip');
  });
});

describe('headerOrderSimilarity', () => {
  it('returns 1 for identical order', () => {
    const headers = ['accept', 'accept-encoding', 'user-agent'];
    expect(headerOrderSimilarity(headers, headers)).toBe(1);
  });

  it('returns < 1 for inverted order', () => {
    const a = ['accept', 'accept-encoding', 'user-agent'];
    const b = ['user-agent', 'accept-encoding', 'accept'];
    expect(headerOrderSimilarity(a, b)).toBeLessThan(1);
  });

  it('returns 1 for two empty arrays', () => {
    expect(headerOrderSimilarity([], [])).toBe(1);
  });
});

describe('headerValueSimilarity', () => {
  it('returns 1 for identical values', () => {
    const v = { accept: 'text/html' };
    expect(headerValueSimilarity(v, v)).toBe(1);
  });

  it('returns 0 for completely different values', () => {
    expect(headerValueSimilarity({ accept: 'text/html' }, { accept: '*/*' })).toBe(0);
  });

  it('returns 0.5 when one side is missing a key', () => {
    expect(headerValueSimilarity({ accept: 'text/html' }, {})).toBe(0.5);
  });
});

// ── jaccardSimilarity ─────────────────────────────────────────

describe('jaccardSimilarity', () => {
  it('returns 1 for identical arrays', () => {
    expect(jaccardSimilarity([1, 2, 3], [1, 2, 3])).toBe(1);
  });

  it('returns 0 for completely disjoint arrays', () => {
    expect(jaccardSimilarity([1, 2], [3, 4])).toBe(0);
  });

  it('returns 0.5 for partial overlap', () => {
    expect(jaccardSimilarity([1, 2], [2, 3])).toBeCloseTo(1 / 3);
  });

  it('returns 1 for two empty arrays', () => {
    expect(jaccardSimilarity([], [])).toBe(1);
  });

  it('returns 0.5 when one side is undefined', () => {
    expect(jaccardSimilarity([1, 2], undefined)).toBe(0.5);
  });
});

// ── computeConsistencyScore ───────────────────────────────────

describe('computeConsistencyScore', () => {
  it('returns isNewDevice=true with score 100 when no history', () => {
    const result = computeConsistencyScore({ ja4: 'test' }, []);
    expect(result.isNewDevice).toBe(true);
    expect(result.consistencyScore).toBe(100);
  });

  it('returns high score for identical profiles', () => {
    const snap = {
      id: '1',
      deviceId: 'dev',
      timestamp: new Date(),
      profile: { ja4: 'test', ja3: 'abc', cipherSuites: [1, 2, 3] },
    };
    const result = computeConsistencyScore(
      { ja4: 'test', ja3: 'abc', cipherSuites: [1, 2, 3] },
      [snap],
    );
    expect(result.isNewDevice).toBe(false);
    expect(result.consistencyScore).toBeGreaterThan(80);
    expect(result.ja4Match).toBe(true);
    expect(result.ja3Match).toBe(true);
  });

  it('detects JA4 mismatch and adds factor', () => {
    const snap = {
      id: '1',
      deviceId: 'dev',
      timestamp: new Date(),
      profile: { ja4: 'original-ja4' },
    };
    const result = computeConsistencyScore({ ja4: 'different-ja4' }, [snap]);
    expect(result.ja4Match).toBe(false);
    expect(result.factors).toContain('ja4_mismatch');
  });
});

// ── buildTlsProfile (middleware) ──────────────────────────────

describe('buildTlsProfile', () => {
  it('merges signals from all header extractors', () => {
    const profile = buildTlsProfile({
      'x-ja4': 't13d1516h2_8daaf6152771_b0da82dd1658',
      'x-tls-extensions': '0,5,10',
      'x-http2-settings': 'header_table_size=65536',
      'accept': 'text/html',
      'accept-encoding': 'gzip',
    });
    expect(profile.ja4).toBeDefined();
    expect(profile.extensions).toEqual([0, 5, 10]);
    expect(profile.http2Settings?.headerTableSize).toBe(65536);
    expect(profile.headerValues?.['accept']).toBe('text/html');
    expect(profile.headerOrder).toContain('accept');
  });
});
