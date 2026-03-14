import { describe, it, expect, vi } from 'vitest';
import { TlsManager } from '../core/TlsManager.js';
import type { TlsProfile, IdentifyResult, EnrichedIdentifyResult } from '../types.js';

const emptyEnrichmentInfo = {
  plugins: [],
  details: {},
  failures: [],
};

// ── Fixtures ──────────────────────────────────────────────────

const PROFILE_A: TlsProfile = {
  ja4: 't13d1516h2_8daaf6152771_b0da82dd1658',
  ja3: 'aabbccddeeff00112233445566778899',
  cipherSuites: [0x1301, 0x1302, 0x1303, 0xc02b, 0xc02f],
  extensions: [0, 5, 10, 11, 13, 16, 23, 43, 45, 51],
  ellipticCurves: [0x001d, 0x0017, 0x0018],
  http2Settings: { headerTableSize: 65536, initialWindowSize: 131072, maxFrameSize: 16384 },
  headerOrder: ['accept', 'accept-encoding', 'accept-language', 'user-agent'],
  headerValues: { 'accept': 'text/html,application/xhtml+xml', 'accept-encoding': 'gzip, deflate, br' },
};

/** Identical to A — should produce consistency ~100 */
const PROFILE_A_COPY: TlsProfile = JSON.parse(JSON.stringify(PROFILE_A));

/** Very different from A — should produce low consistency */
const PROFILE_B: TlsProfile = {
  ja4: 'q13x9999z1_000000000000_ffffffff1111',
  ja3: '00000000000000000000000000000000',
  cipherSuites: [0x002f, 0x0035],
  extensions: [0, 5],
  http2Settings: { headerTableSize: 4096 },
  headerOrder: ['host', 'connection'],
  headerValues: { 'accept': '*/*' },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ProcFn = (payload: { result: IdentifyResult; context?: Record<string, unknown> }) => any;

function makeDeviceManager(deviceId = 'device-1') {
  const processors = new Map<string, ProcFn>();
  return {
    identify: vi.fn(async (_data: unknown, ctx?: Record<string, unknown>): Promise<IdentifyResult> => {
      const base: IdentifyResult = {
        deviceId,
        confidence: 70,
        isNewDevice: false,
        matchConfidence: 70,
        enrichmentInfo: emptyEnrichmentInfo,
      };
      const merged: Record<string, unknown> = { ...base };
      for (const proc of processors.values()) {
        try {
          const outcome = await proc({ result: merged as IdentifyResult, context: ctx });
          if (outcome?.result) Object.assign(merged, outcome.result);
        } catch {
          // processor errors are non-fatal
        }
      }
      return merged as unknown as IdentifyResult;
    }),
    registerIdentifyPostProcessor: vi.fn((_name: string, fn: ProcFn) => {
      processors.set(_name, fn);
      return (): void => { processors.delete(_name); };
    }),
  };
}

// ── TlsManager.registerWith ───────────────────────────────────

describe('TlsManager.registerWith', () => {
  it('passes through result when no tlsProfile in context', async () => {
    const tlsManager = new TlsManager({ licenseKey: 'test-key' });
    const deviceManager = makeDeviceManager();
    tlsManager.registerWith(deviceManager);

    const result = await deviceManager.identify({ fp: 'data' }, { userId: 'u1' }) as EnrichedIdentifyResult;
    expect(result.tlsConsistency).toBeUndefined();
    expect(result.tlsConfidenceBoost).toBeUndefined();
    expect(result.confidence).toBe(70);
  });

  it('marks first request as new device with neutral confidence', async () => {
    const tlsManager = new TlsManager({ licenseKey: 'test-key' });
    const deviceManager = makeDeviceManager();
    tlsManager.registerWith(deviceManager);

    const result = await deviceManager.identify({}, { tlsProfile: PROFILE_A }) as EnrichedIdentifyResult;
    expect(result.tlsConsistency!.isNewDevice).toBe(true);
    expect(result.tlsConsistency!.consistencyScore).toBe(100);
    expect(result.tlsConfidenceBoost).toBe(0);
    expect(result.confidence).toBe(70); // no change on first request
  });

  it('boosts confidence on identical second profile', async () => {
    const tlsManager = new TlsManager({ licenseKey: 'test-key' });
    const deviceManager = makeDeviceManager();
    tlsManager.registerWith(deviceManager);

    // First call — seeds history
    await deviceManager.identify({}, { tlsProfile: PROFILE_A });
    // Second call — identical profile
    const result = await deviceManager.identify({}, { tlsProfile: PROFILE_A_COPY }) as EnrichedIdentifyResult;

    expect(result.tlsConsistency!.isNewDevice).toBe(false);
    expect(result.tlsConsistency!.consistencyScore).toBeGreaterThan(80);
    expect(result.tlsConfidenceBoost).toBeGreaterThan(0);
    expect(result.confidence).toBeGreaterThan(70);
  });

  it('does not exceed 100 confidence after boost', async () => {
    const tlsManager = new TlsManager({ licenseKey: 'test-key' });
    // Set very high confidence mock
    const deviceManager = {
      identify: vi.fn(async (_data: unknown, _ctx?: Record<string, unknown>): Promise<IdentifyResult> => ({
        deviceId: 'device-x',
        confidence: 99,
        isNewDevice: false,
        matchConfidence: 99,
        enrichmentInfo: emptyEnrichmentInfo,
      })),
    };
    tlsManager.registerWith(deviceManager);

    await deviceManager.identify({}, { tlsProfile: PROFILE_A });
    const result = await deviceManager.identify({}, { tlsProfile: PROFILE_A_COPY }) as EnrichedIdentifyResult;
    expect(result.confidence).toBeLessThanOrEqual(100);
  });

  it('detects profile mismatch and adds anomaly factors', async () => {
    const tlsManager = new TlsManager({ licenseKey: 'test-key' });
    const deviceManager = makeDeviceManager();
    tlsManager.registerWith(deviceManager);

    await deviceManager.identify({}, { tlsProfile: PROFILE_A });
    const result = await deviceManager.identify({}, { tlsProfile: PROFILE_B }) as EnrichedIdentifyResult;

    expect(result.tlsConsistency!.factors.length).toBeGreaterThan(0);
    expect(result.tlsConsistency!.consistencyScore).toBeLessThan(70);
  });
});

// ── TlsManager history ────────────────────────────────────────

describe('TlsManager history', () => {
  it('stores snapshots and caps at maxHistoryPerDevice', () => {
    const tlsManager = new TlsManager({ licenseKey: 'test-key', maxHistoryPerDevice: 3 });

    tlsManager.analyze(PROFILE_A, 'dev-1');
    tlsManager.analyze(PROFILE_A, 'dev-1');
    tlsManager.analyze(PROFILE_A, 'dev-1');
    tlsManager.analyze(PROFILE_A, 'dev-1'); // 4th → should drop oldest

    expect(tlsManager.getHistory('dev-1').length).toBe(3);
  });

  it('returns null for unknown device', () => {
    const tlsManager = new TlsManager({ licenseKey: 'test-key' });
    expect(tlsManager.getLatest('unknown-device')).toBeNull();
  });

  it('clears history for specific device', () => {
    const tlsManager = new TlsManager({ licenseKey: 'test-key' });
    tlsManager.analyze(PROFILE_A, 'dev-a');
    tlsManager.analyze(PROFILE_A, 'dev-b');
    tlsManager.clear('dev-a');
    expect(tlsManager.getHistory('dev-a').length).toBe(0);
    expect(tlsManager.getHistory('dev-b').length).toBe(1);
  });

  it('clears all history', () => {
    const tlsManager = new TlsManager({ licenseKey: 'test-key' });
    tlsManager.analyze(PROFILE_A, 'dev-a');
    tlsManager.analyze(PROFILE_A, 'dev-b');
    tlsManager.clear();
    expect(tlsManager.getHistory('dev-a').length).toBe(0);
    expect(tlsManager.getHistory('dev-b').length).toBe(0);
  });
});

// ── Free tier limits ──────────────────────────────────────────

describe('TlsManager free tier', () => {
  it('caps history at 10 without license key', () => {
    const tlsManager = new TlsManager(); // no key

    for (let i = 0; i < 15; i++) {
      tlsManager.analyze(PROFILE_A, 'free-dev');
    }
    expect(tlsManager.getHistory('free-dev').length).toBe(10);
  });
});

// ── Error resilience ──────────────────────────────────────────

describe('TlsManager error resilience', () => {
  it('returns the original result when analyze() throws', async () => {
    const tlsManager = new TlsManager({ licenseKey: 'test-key' });
    const deviceManager = makeDeviceManager();
    tlsManager.registerWith(deviceManager);

    // Force analyze to throw
    vi.spyOn(tlsManager, 'analyze').mockImplementation(() => {
      throw new Error('storage exploded');
    });

    const result = await deviceManager.identify({}, { tlsProfile: PROFILE_A }) as EnrichedIdentifyResult;

    // Should fall through to the catch block and return unmodified result
    expect(result.confidence).toBe(70);
    expect(result.tlsConsistency).toBeUndefined();
    expect(result.tlsConfidenceBoost).toBeUndefined();
  });

  it('registers a DeviceManager post-processor when the hook API is available', () => {
    const tlsManager = new TlsManager({ licenseKey: 'test-key' });
    let registeredProcessor:
      | ((payload: { result: IdentifyResult; context?: Record<string, unknown> }) => { result?: Record<string, unknown>; enrichmentInfo?: Record<string, unknown>; logMeta?: Record<string, unknown> } | void)
      | undefined;

    const deviceManager = {
      identify: vi.fn(async (): Promise<IdentifyResult> => ({
        deviceId: 'device-hook',
        confidence: 70,
        isNewDevice: false,
        matchConfidence: 70,
        enrichmentInfo: emptyEnrichmentInfo,
      })),
      registerIdentifyPostProcessor: vi.fn((name: string, processor: typeof registeredProcessor) => {
        expect(name).toBe('tls');
        registeredProcessor = processor;
        return () => {};
      }),
    };

    tlsManager.registerWith(deviceManager);

    const outcome = registeredProcessor!({
      result: {
        deviceId: 'device-hook',
        confidence: 70,
        isNewDevice: false,
        matchConfidence: 70,
        enrichmentInfo: emptyEnrichmentInfo,
      },
      context: { tlsProfile: PROFILE_A },
    });

    expect(deviceManager.registerIdentifyPostProcessor).toHaveBeenCalledTimes(1);
    expect(outcome?.result?.tlsConsistency).toBeDefined();
    expect(outcome?.enrichmentInfo).toMatchObject({ consistencyScore: 100, confidenceBoost: 0 });
    expect(outcome?.logMeta).toMatchObject({ consistencyScore: 100 });
  });
});
