import { type LicenseTier } from '../libs/license.js';
import type { TlsManagerOptions, TlsProfile, TlsSnapshot, TlsConsistency } from '../types.js';
import type { DeviceManagerPlugin, DeviceManagerLike } from 'devicer.js';
/**
 * TlsManager — passive TLS intelligence for the FP-Devicer Suite.
 *
 * Collects JA4/JA3 fingerprints, cipher suite order, TLS extensions,
 * HTTP/2 SETTINGS, and header consistency signals. Stores a snapshot per
 * `deviceId` and scores future requests against history using Jaccard
 * similarity and optional TLSH fuzzy hashing.
 *
 * ### Integration with DeviceManager
 * ```ts
 * const tlsManager = new TlsManager({ licenseKey: process.env.TLS_KEY });
 * tlsManager.registerWith(deviceManager);
 *
 * // From your route handler — middleware populates req.tlsProfile
 * const result = await deviceManager.identify(req.body, {
 *   tlsProfile: req.tlsProfile,
 * });
 * // result.tlsConsistency and result.tlsConfidenceBoost are now available
 * ```
 */
export declare class TlsManager implements DeviceManagerPlugin {
    private static readonly DEVICE_MANAGER_PLUGIN_NAME;
    private storage;
    private readonly options;
    /** Resolved license info — available after {@link init} completes. */
    private licenseInfo;
    private initPromise;
    constructor(opts?: TlsManagerOptions);
    private readonly _licenseKey;
    private readonly _customStorage;
    /** The active license tier. Resolves to `'free'` until {@link init} completes. */
    get tier(): LicenseTier;
    /**
     * Validate the Polar license key if one was supplied.
     *
     * Call this once at application startup before processing requests. Safe to
     * await multiple times — subsequent calls return the cached promise.
     */
    init(): Promise<void>;
    private _doInit;
    /**
     * Score an incoming `TlsProfile` against historical snapshots for `deviceId`,
     * persist the snapshot, and return a `TlsConsistency` report.
     *
     * Free-tier callers are limited to {@link FREE_TIER_MAX_DEVICES} unique
     * devices. When the cap is reached, the profile for new device IDs is not
     * persisted and a zero-signal `TlsConsistency` is returned.
     *
     * @param profile  - TLS signals collected for the current request.
     * @param deviceId - The resolved device identifier from DeviceManager.
     */
    analyze(profile: TlsProfile, deviceId: string): TlsConsistency;
    /**
     * Return the full TLS snapshot history for a device.
     *
     * @param deviceId - Device identifier.
     * @param limit    - Max entries to return. Returns all when omitted.
     */
    getHistory(deviceId: string, limit?: number): TlsSnapshot[];
    /**
     * Return the most-recent TLS snapshot for a device, or `null` if none.
     */
    getLatest(deviceId: string): TlsSnapshot | null;
    /**
     * Clear stored snapshots — all devices or a single device.
     */
    clear(deviceId?: string): void;
    /**
     * Patch `deviceManager.identify()` to automatically analyse TLS signals
     * on every call and attach `tlsConsistency` and `tlsConfidenceBoost` to
     * the result.
     *
     * The `tlsProfile` field on the `context` argument (second parameter of
     * `identify`) is consumed. All other context fields are forwarded unchanged.
     *
     * Confidence boosting:
     * - `consistencyScore >= 80` → up to +15 points
     * - `consistencyScore < 40`  → up to −15 points
     * - New device              → ±0 (no history to compare)
     *
     * Failures inside the TLS analysis are non-fatal — the original result
     * is returned as-is when analysis throws.
     */
    registerWith(deviceManager: DeviceManagerLike): (() => void) | void;
}
//# sourceMappingURL=TlsManager.d.ts.map