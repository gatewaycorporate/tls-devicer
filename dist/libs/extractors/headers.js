// ────────────────────────────────────────────────────────────
//  headers — extract HTTP header order and stable values for
//  consistency fingerprinting
// ────────────────────────────────────────────────────────────
/**
 * Headers whose *values* are stable across requests from the same client
 * and therefore useful as fingerprint signals.
 */
const STABLE_VALUE_HEADERS = [
    'accept',
    'accept-encoding',
    'accept-language',
    'sec-ch-ua',
    'sec-ch-ua-mobile',
    'sec-ch-ua-platform',
    'upgrade-insecure-requests',
    'dnt',
];
/**
 * Headers that are request-specific and should be excluded from order/value
 * fingerprinting to avoid false-positive inconsistency signals.
 */
const EXCLUDED_HEADERS = new Set([
    'host',
    'content-length',
    'content-type',
    'authorization',
    'cookie',
    'set-cookie',
    'x-request-id',
    'x-correlation-id',
    'x-forwarded-for',
    'x-real-ip',
    'x-ja4',
    'x-ja3',
    'x-tls-extensions',
    'x-tls-ciphers',
    'x-http2-settings',
    'cf-ray',
    'cf-connecting-ip',
    'cf-ipcountry',
    'cf-ja4',
]);
// ── Public API ────────────────────────────────────────────────
/**
 * Extract the HTTP header order and stable header values from request headers.
 *
 * - `headerOrder` contains the ordered list of header names after stripping
 *   request-specific and proxy-injected headers.
 * - `headerValues` contains normalised stable header values (lower-cased name,
 *   trimmed value) that characterise the client implementation.
 *
 * @param headers - Raw request headers (`IncomingMessage.headers`).
 * @returns Partial `TlsProfile` with `headerOrder` and `headerValues`.
 */
export function extractHeaderSignals(headers) {
    const allNames = Object.keys(headers).map((k) => k.toLowerCase());
    const headerOrder = allNames.filter((name) => !EXCLUDED_HEADERS.has(name));
    const headerValues = {};
    for (const name of STABLE_VALUE_HEADERS) {
        const raw = headers[name];
        if (raw === undefined)
            continue;
        const value = Array.isArray(raw) ? raw.join(', ') : raw;
        headerValues[name] = value.trim();
    }
    return { headerOrder, headerValues };
}
/**
 * Compute a Jaccard-based order similarity between two header-name sequences.
 *
 * This combines:
 * 1. **Set similarity** (Jaccard): are the same headers present?
 * 2. **Order similarity**: is the relative order of common headers preserved?
 *
 * @param a - Reference header order.
 * @param b - Incoming header order.
 * @returns Blended score in `[0, 1]`.
 */
export function headerOrderSimilarity(a, b) {
    if (a.length === 0 && b.length === 0)
        return 1;
    const setA = new Set(a);
    const setB = new Set(b);
    // Jaccard on sets
    const union = new Set([...setA, ...setB]);
    let intersection = 0;
    for (const h of setA) {
        if (setB.has(h))
            intersection++;
    }
    const jaccard = union.size === 0 ? 1 : intersection / union.size;
    // Relative-order score on common headers
    const common = a.filter((h) => setB.has(h));
    let orderScore = 1;
    if (common.length >= 2) {
        const posInB = new Map(b.map((h, i) => [h, i]));
        let inversions = 0;
        const pairs = (common.length * (common.length - 1)) / 2;
        for (let i = 0; i < common.length - 1; i++) {
            for (let j = i + 1; j < common.length; j++) {
                const pi = posInB.get(common[i]) ?? Infinity;
                const pj = posInB.get(common[j]) ?? Infinity;
                if (pi > pj)
                    inversions++;
            }
        }
        orderScore = pairs > 0 ? 1 - inversions / pairs : 1;
    }
    return 0.6 * jaccard + 0.4 * orderScore;
}
/**
 * Compute a similarity score (0–1) for stable header values between two
 * `headerValues` maps.
 *
 * Exact matches score 1; missing-on-one-side scores 0.5 (neutral);
 * value mismatches score 0.
 */
export function headerValueSimilarity(a, b) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    if (keys.size === 0)
        return 1;
    let total = 0;
    for (const key of keys) {
        const va = a[key];
        const vb = b[key];
        if (va === undefined || vb === undefined) {
            total += 0.5;
        }
        else {
            total += va === vb ? 1 : 0;
        }
    }
    return total / keys.size;
}
//# sourceMappingURL=headers.js.map