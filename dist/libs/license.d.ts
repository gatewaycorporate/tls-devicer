/**
 * Subscription tier resolved from a Polar license key.
 *
 * | Tier         | Price        | Device limit | Servers    |
 * |--------------|-------------|--------------|------------|
 * | `free`       | $0/mo        | 10,000       | —          |
 * | `pro`        | $49/mo       | Unlimited    | 1 server   |
 * | `enterprise` | $299/mo      | Unlimited    | Unlimited  |
 */
export type LicenseTier = 'free' | 'pro' | 'enterprise';
/** Result returned by {@link validateLicense}. */
export interface LicenseInfo {
    /** `true` when Polar confirmed the key is active and granted. */
    valid: boolean;
    /** Resolved tier — always `'free'` when `valid` is `false`. */
    tier: LicenseTier;
    /**
     * Maximum number of unique device IDs the store is allowed to hold.
     * `undefined` means unlimited (pro / enterprise).
     */
    maxDevices?: number;
}
/** Maximum unique devices stored on the free tier. */
export declare const FREE_TIER_MAX_DEVICES = 10000;
/**
 * Maximum snapshot history depth per device on the free tier.
 * Pro/Enterprise default to 50 (configurable via `maxHistoryPerDevice`).
 */
export declare const FREE_TIER_MAX_HISTORY = 10;
/** Your Polar organisation ID (Settings → Organisation in the dashboard). */
export declare const POLAR_ORGANIZATION_ID = "ef7f48cb-2477-467e-862f-a31d4bfd74e0";
/**
 * Polar benefit IDs that identify each paid tier.
 * Both `ip-devicer` and `tls-devicer` share the same organisation and
 * products — paste the benefit IDs once and both libraries use them.
 */
export declare const POLAR_BENEFIT_IDS: {
    /** Benefit ID for the "Pro" license-key benefit ($49/month, 1 activation). */
    readonly pro: "7ff9dd18-eca0-4ebb-a608-cfde8327f622";
    /**
     * Benefit ID for the "Enterprise" license-key benefit
     * ($299/month, unlimited activations).
     */
    readonly enterprise: "ef7f48cb-2477-467e-862f-a31d4bfd74e0";
};
/**
 * Validate a Polar license key and return the resolved {@link LicenseInfo}.
 *
 * - Results are cached in-process for one hour.
 * - If Polar is unreachable or the key is invalid the function returns
 *   `{ valid: false, tier: 'free', maxDevices: FREE_TIER_MAX_DEVICES }`
 *   without throwing — validation failures are non-fatal.
 * - The `benefit_id` in the Polar response is compared against
 *   {@link POLAR_BENEFIT_IDS} to decide the tier.
 *
 * @param key - The raw license key string provided by the user.
 */
export declare function validateLicense(key: string): Promise<LicenseInfo>;
/**
 * Evict a cached validation result, forcing a fresh Polar request next time.
 * Useful in tests or after a subscription change.
 */
export declare function evictLicenseCache(key: string): void;
//# sourceMappingURL=license.d.ts.map