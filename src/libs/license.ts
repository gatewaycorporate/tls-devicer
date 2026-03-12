// ────────────────────────────────────────────────────────────
//  Polar.js license validation for tls-devicer
//  https://polar.sh/docs/features/benefits/license-keys
// ────────────────────────────────────────────────────────────

// ── Tier definitions ───────────────────────────────────────

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

// ── Tier limits ────────────────────────────────────────────

/** Maximum unique devices stored on the free tier. */
export const FREE_TIER_MAX_DEVICES = 10_000;

/**
 * Maximum snapshot history depth per device on the free tier.
 * Pro/Enterprise default to 50 (configurable via `maxHistoryPerDevice`).
 */
export const FREE_TIER_MAX_HISTORY = 10;

// ── Polar configuration ────────────────────────────────────
//
//  Fill these in with the values from your Polar dashboard:
//    https://polar.sh/dashboard → Settings → Organisation ID
//    https://polar.sh/dashboard → Benefits → (copy benefit ID)
//
//  Products to create in Polar:
//
//  Name: "tls-devicer Pro"
//    Type: Subscription  — $49 / month
//    Benefit: License Keys  (activation limit: 1 — enforces single-server)
//
//  Name: "tls-devicer Enterprise"
//    Type: Subscription  — $299 / month
//    Benefit: License Keys  (activation limit: unlimited)
//
//  Note: ip-devicer and tls-devicer share the same Polar organisation.
//  You may reuse the same products and benefit IDs across both packages
//  by pasting the same values here.

/** Your Polar organisation ID (Settings → Organisation in the dashboard). */
export const POLAR_ORGANIZATION_ID = 'ef7f48cb-2477-467e-862f-a31d4bfd74e0';

/**
 * Polar benefit IDs that identify each paid tier.
 * Both `ip-devicer` and `tls-devicer` share the same organisation and
 * products — paste the benefit IDs once and both libraries use them.
 */
export const POLAR_BENEFIT_IDS = {
  /** Benefit ID for the "Pro" license-key benefit ($49/month, 1 activation). */
  pro: '7ff9dd18-eca0-4ebb-a608-cfde8327f622',
  /**
   * Benefit ID for the "Enterprise" license-key benefit
   * ($299/month, unlimited activations).
   */
  enterprise: 'ef7f48cb-2477-467e-862f-a31d4bfd74e0',
} as const;

// ── Internal ───────────────────────────────────────────────

const POLAR_VALIDATE_URL =
  'https://api.polar.sh/v1/customer-portal/license-keys/validate';

/** In-process cache to avoid validating the same key on every request. */
const _cache = new Map<string, { info: LicenseInfo; expiresAt: number }>();

/** Cache TTL — re-validates once per hour. */
const CACHE_TTL_MS = 60 * 60 * 1_000;

// ── Public API ─────────────────────────────────────────────

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
export async function validateLicense(key: string): Promise<LicenseInfo> {
  const trimmed = key.trim();

  const cached = _cache.get(trimmed);
  if (cached && cached.expiresAt > Date.now()) return cached.info;

  const FREE: LicenseInfo = {
    valid: false,
    tier: 'free',
    maxDevices: FREE_TIER_MAX_DEVICES,
  };

  let info: LicenseInfo;
  try {
    const res = await fetch(POLAR_VALIDATE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: trimmed,
        organization_id: POLAR_ORGANIZATION_ID,
      }),
    });

    if (!res.ok) {
      info = FREE;
    } else {
      const data = (await res.json()) as {
        status: string;
        benefit_id: string;
      };

      if (data.status !== 'granted') {
        info = FREE;
      } else if (data.benefit_id === POLAR_BENEFIT_IDS.enterprise) {
        info = { valid: true, tier: 'enterprise' };
      } else if (data.benefit_id === POLAR_BENEFIT_IDS.pro) {
        info = { valid: true, tier: 'pro' };
      } else {
        // Key is valid on Polar but doesn't match a known benefit — treat as free.
        info = FREE;
      }
    }
  } catch {
    // Network failure — fall back to free, do NOT throw.
    info = FREE;
  }

  _cache.set(trimmed, { info, expiresAt: Date.now() + CACHE_TTL_MS });
  return info;
}

/**
 * Evict a cached validation result, forcing a fresh Polar request next time.
 * Useful in tests or after a subscription change.
 */
export function evictLicenseCache(key: string): void {
  _cache.delete(key.trim());
}
