// ────────────────────────────────────────────────────────────
//  TlsManager — core orchestrator for TLS intelligence
// ────────────────────────────────────────────────────────────
import { createTlsStorage } from '../libs/adapters/inmemory.js';
import { computeConsistencyScore, computeConfidenceBoost, } from '../libs/scoring.js';
const FREE_TIER_MAX_HISTORY = 10;
const LICENSE_WARN = '[tls-devicer] No license key — history capped at 10 snapshots per device.';
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
    storage;
    options;
    hasLicense;
    constructor(opts = {}) {
        this.hasLicense = Boolean(opts.licenseKey?.trim());
        if (!this.hasLicense) {
            console.warn(LICENSE_WARN);
        }
        const maxHistory = this.hasLicense
            ? (opts.maxHistoryPerDevice ?? 50)
            : FREE_TIER_MAX_HISTORY;
        this.options = {
            enableJa4: opts.enableJa4 ?? true,
            enableJa3: opts.enableJa3 ?? true,
            enableHttp2: opts.enableHttp2 ?? true,
            enableHeaderConsistency: opts.enableHeaderConsistency ?? true,
            confidenceBoostWeight: opts.confidenceBoostWeight ?? 0.15,
            maxHistoryPerDevice: maxHistory,
        };
        this.storage = createTlsStorage(maxHistory);
    }
    // ── Core analysis ──────────────────────────────────────────
    /**
     * Score an incoming `TlsProfile` against historical snapshots for `deviceId`,
     * persist the snapshot, and return a `TlsConsistency` report.
     *
     * @param profile  - TLS signals collected for the current request.
     * @param deviceId - The resolved device identifier from DeviceManager.
     */
    analyze(profile, deviceId) {
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
        const original = deviceManager.identify.bind(deviceManager);
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const self = this;
        deviceManager.identify = async function patchedIdentify(data, context) {
            const result = await original(data, context);
            const ctx = (context ?? {});
            const profile = ctx.tlsProfile;
            if (!profile)
                return result;
            try {
                const consistency = self.analyze(profile, result.deviceId);
                const boost = computeConfidenceBoost(consistency, self.options.confidenceBoostWeight);
                const boostedConfidence = Math.max(0, Math.min(100, result.confidence + boost));
                return {
                    ...result,
                    confidence: boostedConfidence,
                    matchConfidence: boostedConfidence,
                    tlsConsistency: consistency,
                    tlsConfidenceBoost: boost,
                };
            }
            catch {
                // TLS analysis failure is non-fatal
                return result;
            }
        };
    }
}
//# sourceMappingURL=TlsManager.js.map