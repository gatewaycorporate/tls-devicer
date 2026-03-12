import type { TlsProfile } from '../../types.js';
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
export declare function extractHeaderSignals(headers: Record<string, string | string[] | undefined>): Pick<TlsProfile, 'headerOrder' | 'headerValues'>;
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
export declare function headerOrderSimilarity(a: string[], b: string[]): number;
/**
 * Compute a similarity score (0–1) for stable header values between two
 * `headerValues` maps.
 *
 * Exact matches score 1; missing-on-one-side scores 0.5 (neutral);
 * value mismatches score 0.
 */
export declare function headerValueSimilarity(a: Record<string, string>, b: Record<string, string>): number;
//# sourceMappingURL=headers.d.ts.map