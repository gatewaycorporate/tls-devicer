import type { TlsProfile, TlsSnapshot, TlsConsistency } from '../types.js';
/**
 * Compute a TLSH-based similarity score between two serialised TLS profiles.
 *
 * @returns 0–100 where 100 = identical, 0 = maximally different.
 *          `null` when TLSH is unavailable or input is too short.
 */
export declare function computeTlshScore(profileA: TlsProfile, profileB: TlsProfile): number | null;
/**
 * Compute Jaccard similarity between two number arrays treated as sets.
 * Returns 1 when both are empty, 0.5 when one side is missing/empty.
 */
export declare function jaccardSimilarity(a: number[] | undefined, b: number[] | undefined): number;
/**
 * Compare an incoming TLS profile against historical snapshots and produce
 * a `TlsConsistency` report.
 *
 * - When no history exists yet (`history` is empty) all match fields are
 *   `null` / neutral and `isNewDevice` is `true`.
 * - When history is present the most-recent snapshot is used as the reference.
 *
 * @param incoming  - Profile collected from the current request.
 * @param history   - Device history (newest-first). May be empty.
 * @param enableJa4 - Whether JA4 is included in scoring.
 * @param enableJa3 - Whether JA3 is included in scoring.
 * @param enableHttp2 - Whether HTTP/2 settings are included.
 * @param enableHeaderConsistency - Whether header signals are included.
 */
export declare function computeConsistencyScore(incoming: TlsProfile, history: TlsSnapshot[], enableJa4?: boolean, enableJa3?: boolean, enableHttp2?: boolean, enableHeaderConsistency?: boolean): TlsConsistency;
/**
 * Convert a `TlsConsistency` report into a confidence delta (−15 to +15 points).
 *
 * Strong past-match boosts confidence; profile mismatch reduces it.
 *
 * @param consistency - Result of `computeConsistencyScore`.
 * @param weight      - Scale factor (0–1) applied to the raw delta. Default: 0.15.
 */
export declare function computeConfidenceBoost(consistency: TlsConsistency, weight?: number): number;
//# sourceMappingURL=scoring.d.ts.map