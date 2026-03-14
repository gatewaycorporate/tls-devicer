// ────────────────────────────────────────────────────────────
//  TlsManager — core orchestrator for TLS intelligence
// ────────────────────────────────────────────────────────────
import { createTlsStorage } from '../libs/adapters/inmemory.js';
import { computeConsistencyScore, computeConfidenceBoost, } from '../libs/scoring.js';
import { validateLicense, FREE_TIER_MAX_DEVICES, FREE_TIER_MAX_HISTORY, } from '../libs/license.js';
const LICENSE_WARN = '[tls-devicer] No license key — running on the free tier ' +
    `(${FREE_TIER_MAX_HISTORY} history snapshots/device, ${FREE_TIER_MAX_DEVICES.toLocaleString()} device limit). ` +
    'Visit https://polar.sh to upgrade to Pro or Enterprise.';
const LICENSE_INVALID_WARN = '[tls-devicer] License key could not be validated — falling back to the free tier. ' +
    'Check your key or network connectivity.';
const DEVICE_LIMIT_WARN = `[tls-devicer] Free-tier device limit reached (${FREE_TIER_MAX_DEVICES.toLocaleString()} devices). ` +
    'New device will not be tracked. Upgrade to Pro or Enterprise to remove this limit.';
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
export class TlsManager {
    static DEVICE_MANAGER_PLUGIN_NAME = 'tls';
    storage;
    options;
    /** Resolved license info — available after {@link init} completes. */
    licenseInfo = {
        valid: false,
        tier: 'free',
        maxDevices: FREE_TIER_MAX_DEVICES,
    };
    initPromise = null;
    constructor(opts = {}) {
        const hasKey = Boolean(opts.licenseKey?.trim());
        if (!hasKey) {
            console.warn(LICENSE_WARN);
        }
        // Optimistic history depth when a key is supplied — init() will
        // downgrade to FREE_TIER_MAX_HISTORY if Polar rejects the key.
        const maxHistory = hasKey
            ? (opts.maxHistoryPerDevice ?? 50)
            : (opts.maxHistoryPerDevice ?? FREE_TIER_MAX_HISTORY);
        this.options = {
            enableJa4: opts.enableJa4 ?? true,
            enableJa3: opts.enableJa3 ?? true,
            enableHttp2: opts.enableHttp2 ?? true,
            enableHeaderConsistency: opts.enableHeaderConsistency ?? true,
            confidenceBoostWeight: opts.confidenceBoostWeight ?? 0.15,
            maxHistoryPerDevice: maxHistory,
        };
        this._licenseKey = opts.licenseKey?.trim();
        this.storage = createTlsStorage(maxHistory);
    }
    // Store licenseKey separately so constructor can reference it
    _licenseKey;
    // ── Accessors ────────────────────────────────────────────
    /** The active license tier. Resolves to `'free'` until {@link init} completes. */
    get tier() {
        return this.licenseInfo.tier;
    }
    // ── Lifecycle ─────────────────────────────────────────────
    /**
     * Validate the Polar license key if one was supplied.
     *
     * Call this once at application startup before processing requests. Safe to
     * await multiple times — subsequent calls return the cached promise.
     */
    async init() {
        if (this.initPromise)
            return this.initPromise;
        this.initPromise = this._doInit();
        return this.initPromise;
    }
    async _doInit() {
        if (!this._licenseKey)
            return;
        const info = await validateLicense(this._licenseKey);
        this.licenseInfo = info;
        if (!info.valid) {
            console.warn(LICENSE_INVALID_WARN);
            // If we over-provisioned history, recreate storage with free-tier cap.
            if (this.options.maxHistoryPerDevice > FREE_TIER_MAX_HISTORY) {
                this.storage = createTlsStorage(FREE_TIER_MAX_HISTORY);
                this.options.maxHistoryPerDevice =
                    FREE_TIER_MAX_HISTORY;
            }
        }
    }
    // ── Core analysis ──────────────────────────────────────────
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
    analyze(profile, deviceId) {
        // ── Free-tier device cap ───────────────────────────────────
        const isKnown = this.storage.getLatest(deviceId) !== null;
        if (!isKnown &&
            this.licenseInfo.tier === 'free' &&
            this.storage.size() >= FREE_TIER_MAX_DEVICES) {
            console.warn(DEVICE_LIMIT_WARN);
            return {
                consistencyScore: 0,
                ja4Match: null,
                ja3Match: null,
                cipherJaccard: 0,
                extensionJaccard: 0,
                http2Score: 0,
                headerOrderScore: 0,
                headerValueScore: 0,
                tlshScore: null,
                isNewDevice: true,
                factors: ['device-limit-exceeded'],
            };
        }
        const history = this.storage.getHistory(deviceId);
        const consistency = computeConsistencyScore(profile, history, this.options.enableJa4, this.options.enableJa3, this.options.enableHttp2, this.options.enableHeaderConsistency);
        // Persist snapshot after scoring (history excludes current request)
        this.storage.save({ deviceId, timestamp: new Date(), profile });
        return consistency;
    }
    /**
     * Return the full TLS snapshot history for a device.
     *
     * @param deviceId - Device identifier.
     * @param limit    - Max entries to return. Returns all when omitted.
     */
    getHistory(deviceId, limit) {
        return this.storage.getHistory(deviceId, limit);
    }
    /**
     * Return the most-recent TLS snapshot for a device, or `null` if none.
     */
    getLatest(deviceId) {
        return this.storage.getLatest(deviceId);
    }
    /**
     * Clear stored snapshots — all devices or a single device.
     */
    clear(deviceId) {
        this.storage.clear(deviceId);
    }
    // ── DeviceManager integration ──────────────────────────────
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
    registerWith(deviceManager) {
        return deviceManager.registerIdentifyPostProcessor?.(TlsManager.DEVICE_MANAGER_PLUGIN_NAME, ({ result, context }) => {
            const ctx = (context ?? {});
            const profile = ctx.tlsProfile;
            if (!profile) {
                return;
            }
            const consistency = this.analyze(profile, result.deviceId);
            const boost = computeConfidenceBoost(consistency, this.options.confidenceBoostWeight);
            const boostedConfidence = Math.max(0, Math.min(100, result.confidence + boost));
            return {
                result: {
                    confidence: boostedConfidence,
                    matchConfidence: boostedConfidence,
                    tlsConsistency: consistency,
                    tlsConfidenceBoost: boost,
                },
                enrichmentInfo: {
                    consistencyScore: consistency.consistencyScore,
                    confidenceBoost: boost,
                    isNewDevice: consistency.isNewDevice,
                    factors: consistency.factors,
                },
                logMeta: {
                    consistencyScore: consistency.consistencyScore,
                    confidenceBoost: boost,
                    ja4Match: consistency.ja4Match,
                    ja3Match: consistency.ja3Match,
                    factors: consistency.factors,
                },
            };
        });
    }
}
//# sourceMappingURL=TlsManager.js.map