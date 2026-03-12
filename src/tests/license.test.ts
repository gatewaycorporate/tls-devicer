// ────────────────────────────────────────────────────────────
//  Tests — Polar license validation (tls-devicer)
// ────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  validateLicense,
  evictLicenseCache,
  POLAR_BENEFIT_IDS,
  FREE_TIER_MAX_DEVICES,
  FREE_TIER_MAX_HISTORY,
} from '../libs/license.js';
import { TlsManager } from '../core/TlsManager.js';
import type { TlsProfile } from '../types.js';

// ── Fixtures ───────────────────────────────────────────────

const PROFILE: TlsProfile = {
  ja4: 't13d1516h2_8daaf6152771_b0da82dd1658',
  ja3: 'aabbccddeeff00112233445566778899',
  cipherSuites: [0x1301, 0x1302, 0x1303, 0xc02b, 0xc02f],
  extensions: [0, 5, 10, 11, 13, 16, 23, 43, 45, 51],
  ellipticCurves: [0x001d, 0x0017, 0x0018],
  http2Settings: { headerTableSize: 65536, initialWindowSize: 131072 },
  headerOrder: ['accept', 'accept-encoding', 'accept-language', 'user-agent'],
  headerValues: { accept: 'text/html', 'accept-encoding': 'gzip, deflate, br' },
};

// ── Helpers ────────────────────────────────────────────────

function mockFetch(body: unknown, status = 200): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    }),
  );
}

function mockFetchNetworkError(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
  );
}

function polarGranted(benefitId: string) {
  return { status: 'granted', benefit_id: benefitId };
}

const KEY_PRO        = 'TLS-PRO-TEST-1111';
const KEY_ENTERPRISE = 'TLS-ENT-TEST-2222';
const KEY_INVALID    = 'TLS-BAD-TEST-3333';

function clearKeys() {
  evictLicenseCache(KEY_PRO);
  evictLicenseCache(KEY_ENTERPRISE);
  evictLicenseCache(KEY_INVALID);
}

// ── validateLicense ────────────────────────────────────────
//  (shared module — test the subset of paths relevant to tls-devicer)

describe('validateLicense (tls-devicer)', () => {
  beforeEach(clearKeys);
  afterEach(() => { vi.unstubAllGlobals(); clearKeys(); });

  it('resolves to free tier on non-ok HTTP response', async () => {
    mockFetch(null, 401);
    const info = await validateLicense(KEY_INVALID);
    expect(info.valid).toBe(false);
    expect(info.tier).toBe('free');
    expect(info.maxDevices).toBe(FREE_TIER_MAX_DEVICES);
  });

  it('resolves to free tier when status field is not granted', async () => {
    mockFetch({ status: 'expired', benefit_id: POLAR_BENEFIT_IDS.enterprise });
    const info = await validateLicense(KEY_INVALID);
    expect(info).toMatchObject({ valid: false, tier: 'free' });
  });

  it('resolves to free tier on network error without throwing', async () => {
    mockFetchNetworkError();
    await expect(validateLicense(KEY_INVALID)).resolves.toMatchObject({
      valid: false,
      tier: 'free',
      maxDevices: FREE_TIER_MAX_DEVICES,
    });
  });

  it('resolves to pro tier when benefit_id matches POLAR_BENEFIT_IDS.pro', async () => {
    mockFetch(polarGranted(POLAR_BENEFIT_IDS.pro));
    const info = await validateLicense(KEY_PRO);
    expect(info).toMatchObject({ valid: true, tier: 'pro' });
    expect(info.maxDevices).toBeUndefined();
  });

  it('resolves to enterprise tier when benefit_id matches POLAR_BENEFIT_IDS.enterprise', async () => {
    mockFetch(polarGranted(POLAR_BENEFIT_IDS.enterprise));
    const info = await validateLicense(KEY_ENTERPRISE);
    expect(info).toMatchObject({ valid: true, tier: 'enterprise' });
    expect(info.maxDevices).toBeUndefined();
  });

  it('defaults to free when benefit_id is granted but unrecognised', async () => {
    mockFetch({ status: 'granted', benefit_id: 'unrecognised-benefit-9999' });
    const info = await validateLicense(KEY_PRO);
    expect(info).toMatchObject({ valid: false, tier: 'free' });
  });

  it('returns cached result on repeated calls without re-fetching', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => polarGranted(POLAR_BENEFIT_IDS.pro),
    });
    vi.stubGlobal('fetch', fetchMock);

    await validateLicense(KEY_PRO);
    await validateLicense(KEY_PRO);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('re-fetches after evictLicenseCache', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => polarGranted(POLAR_BENEFIT_IDS.enterprise),
    });
    vi.stubGlobal('fetch', fetchMock);

    await validateLicense(KEY_ENTERPRISE);
    evictLicenseCache(KEY_ENTERPRISE);
    await validateLicense(KEY_ENTERPRISE);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('trims whitespace from the key before caching', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => polarGranted(POLAR_BENEFIT_IDS.pro),
    });
    vi.stubGlobal('fetch', fetchMock);

    const a = await validateLicense('  ' + KEY_PRO + '  ');
    const b = await validateLicense(KEY_PRO); // should hit cache

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a.tier).toBe('pro');
    expect(b.tier).toBe('pro');
  });
});

// ── TlsManager — tier getter ───────────────────────────────

describe('TlsManager tier getter', () => {
  afterEach(() => { vi.unstubAllGlobals(); clearKeys(); });

  it('returns free before init() is called (no key)', () => {
    const mgr = new TlsManager();
    expect(mgr.tier).toBe('free');
  });

  it('returns free before init() even with a key supplied', () => {
    const mgr = new TlsManager({ licenseKey: KEY_PRO });
    expect(mgr.tier).toBe('free');
  });

  it('returns pro after init() when Polar confirms a pro key', async () => {
    mockFetch(polarGranted(POLAR_BENEFIT_IDS.pro));
    const mgr = new TlsManager({ licenseKey: KEY_PRO });
    await mgr.init();
    expect(mgr.tier).toBe('pro');
  });

  it('returns enterprise after init() when Polar confirms an enterprise key', async () => {
    mockFetch(polarGranted(POLAR_BENEFIT_IDS.enterprise));
    const mgr = new TlsManager({ licenseKey: KEY_ENTERPRISE });
    await mgr.init();
    expect(mgr.tier).toBe('enterprise');
  });

  it('falls back to free after init() when Polar rejects the key', async () => {
    mockFetch(null, 403);
    const mgr = new TlsManager({ licenseKey: KEY_INVALID });
    await mgr.init();
    expect(mgr.tier).toBe('free');
  });

  it('falls back to free after init() on network error', async () => {
    mockFetchNetworkError();
    const mgr = new TlsManager({ licenseKey: KEY_INVALID });
    await mgr.init();
    expect(mgr.tier).toBe('free');
  });

  it('returns free when no key is supplied, init() is a no-op', async () => {
    const mgr = new TlsManager(); // no key
    await mgr.init(); // should not hit fetch
    expect(mgr.tier).toBe('free');
  });

  it('second call to init() returns same promise without re-validating', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => polarGranted(POLAR_BENEFIT_IDS.pro),
    });
    vi.stubGlobal('fetch', fetchMock);

    const mgr = new TlsManager({ licenseKey: KEY_PRO });
    await mgr.init();
    await mgr.init(); // second call
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

// ── TlsManager — history downgrade on key rejection ────────

describe('TlsManager history downgrade', () => {
  afterEach(() => { vi.unstubAllGlobals(); clearKeys(); });

  it('caps maxHistoryPerDevice at FREE_TIER_MAX_HISTORY when key is rejected', async () => {
    mockFetch(null, 403);
    const mgr = new TlsManager({ licenseKey: KEY_INVALID, maxHistoryPerDevice: 50 });
    await mgr.init();

    for (let i = 0; i < 12; i++) {
      mgr.analyze(PROFILE, 'dev-downgrade');
    }
    expect(mgr.getHistory('dev-downgrade').length).toBe(FREE_TIER_MAX_HISTORY);
  });

  it('retains full history when key is accepted (pro)', async () => {
    mockFetch(polarGranted(POLAR_BENEFIT_IDS.pro));
    const mgr = new TlsManager({ licenseKey: KEY_PRO, maxHistoryPerDevice: 20 });
    await mgr.init();

    for (let i = 0; i < 15; i++) {
      mgr.analyze(PROFILE, 'dev-pro');
    }
    expect(mgr.getHistory('dev-pro').length).toBe(15);
  });

  it('retains full history when key is accepted (enterprise)', async () => {
    mockFetch(polarGranted(POLAR_BENEFIT_IDS.enterprise));
    const mgr = new TlsManager({ licenseKey: KEY_ENTERPRISE, maxHistoryPerDevice: 20 });
    await mgr.init();

    for (let i = 0; i < 15; i++) {
      mgr.analyze(PROFILE, 'dev-ent');
    }
    expect(mgr.getHistory('dev-ent').length).toBe(15);
  });
});

// ── TlsManager — free-tier device cap ─────────────────────

describe('TlsManager free-tier device limit', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('allows analysis for a known device even when device cap is reached', () => {
    const mgr = new TlsManager(); // free tier

    // Seed one snapshot for the device
    mgr.analyze(PROFILE, 'known-dev');

    // Fake storage reporting FREE_TIER_MAX_DEVICES unique devices
    const storage = (mgr as unknown as { storage: { size: () => number } }).storage;
    vi.spyOn(storage, 'size').mockReturnValue(FREE_TIER_MAX_DEVICES);

    const result = mgr.analyze(PROFILE, 'known-dev');
    expect(result.isNewDevice).toBe(false);
    expect(result.factors).not.toContain('device-limit-exceeded');
  });

  it('blocks analysis for a new device when cap is reached and returns zero signal', () => {
    const mgr = new TlsManager(); // free tier

    // Fake storage reporting FREE_TIER_MAX_DEVICES
    const storage = (mgr as unknown as { storage: { size: () => number } }).storage;
    vi.spyOn(storage, 'size').mockReturnValue(FREE_TIER_MAX_DEVICES);

    const result = mgr.analyze(PROFILE, 'brand-new-dev');
    expect(result.consistencyScore).toBe(0);
    expect(result.isNewDevice).toBe(true);
    expect(result.factors).toContain('device-limit-exceeded');
  });

  it('does not block new devices for pro tier regardless of storage size', async () => {
    mockFetch(polarGranted(POLAR_BENEFIT_IDS.pro));
    const mgr = new TlsManager({ licenseKey: KEY_PRO });
    await mgr.init();

    // Fake storage size exceeding free limit
    const storage = (mgr as unknown as { storage: { size: () => number } }).storage;
    vi.spyOn(storage, 'size').mockReturnValue(FREE_TIER_MAX_DEVICES * 10);

    const result = mgr.analyze(PROFILE, 'unlimited-dev');
    expect(result.factors).not.toContain('device-limit-exceeded');
    expect(result.isNewDevice).toBe(true);
  });

  it('does not block new devices for enterprise tier regardless of storage size', async () => {
    mockFetch(polarGranted(POLAR_BENEFIT_IDS.enterprise));
    const mgr = new TlsManager({ licenseKey: KEY_ENTERPRISE });
    await mgr.init();

    const storage = (mgr as unknown as { storage: { size: () => number } }).storage;
    vi.spyOn(storage, 'size').mockReturnValue(FREE_TIER_MAX_DEVICES * 100);

    const result = mgr.analyze(PROFILE, 'unlimited-ent-dev');
    expect(result.factors).not.toContain('device-limit-exceeded');
  });
});
