// ────────────────────────────────────────────────────────────
//  scoring — TLS profile similarity & consistency scoring
// ────────────────────────────────────────────────────────────

import type { TlsProfile, TlsSnapshot, TlsConsistency } from '../types.js';
import { serializeProfile } from './adapters/inmemory.js';
import { http2SettingsSimilarity } from './extractors/Http2Settings.js';
import { headerOrderSimilarity, headerValueSimilarity } from './extractors/headers.js';

// ── TLSH wrappers (optional dep: tlsh) ───────────────────────

let _hash: ((data: string) => string) | null = null;
let _builder: ((hash: string) => { calculateDifference: (other: unknown, normalize?: boolean) => number }) | null = null;

/**
 * Lazily load the `tlsh` package. Falls back silently when not installed
 * so tls-devicer can run without it (tlshScore will be null).
 */
async function loadTlsh(): Promise<void> {
  if (_hash !== null) return;
  try {
    const mod = await import('tlsh');
    _hash = (mod.default ?? mod) as (data: string) => string;
    const builder = await import('tlsh/lib/digests/digest-hash-builder.js');
    const DigestHashBuilder: () => {
      withHash: (h: string) => { build: () => { calculateDifference: (o: unknown, n?: boolean) => number } };
    } = (builder.default ?? builder) as typeof DigestHashBuilder;
    _builder = (hash: string) =>
      DigestHashBuilder().withHash(hash).build();
  } catch {
    // tlsh not installed — TLSH scoring disabled
  }
}

// Fire-and-forget on module load
void loadTlsh();

/**
 * Compute a TLSH-based similarity score between two serialised TLS profiles.
 *
 * @returns 0–100 where 100 = identical, 0 = maximally different.
 *          `null` when TLSH is unavailable or input is too short.
 */
export function computeTlshScore(
  profileA: TlsProfile,
  profileB: TlsProfile,
): number | null {
  if (!_hash || !_builder) return null;
  try {
    const sa = serializeProfile(profileA);
    const sb = serializeProfile(profileB);
    if (sa.length < 50 || sb.length < 50) return null; // TLSH needs ≥ 50 bytes

    const ha = _hash(sa);
    const hb = _hash(sb);
    if (!ha || !hb) return null;

    const distance = _builder(ha).calculateDifference(
      _builder(hb),
      true, // normalise length difference
    );
    // Distance 0 = identical, higher = more different; cap at 300 for scaling
    return Math.max(0, Math.round(100 - (distance / 300) * 100));
  } catch {
    return null;
  }
}

// ── Jaccard similarity ────────────────────────────────────────

/**
 * Compute Jaccard similarity between two number arrays treated as sets.
 * Returns 1 when both are empty, 0.5 when one side is missing/empty.
 */
export function jaccardSimilarity(a: number[] | undefined, b: number[] | undefined): number {
  if (a === undefined && b === undefined) return 1;
  if (!a?.length && !b?.length) return 1;
  if (!a?.length || !b?.length) return 0.5;

  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 1 : intersection / union;
}

// ── Consistency scoring ───────────────────────────────────────

/** Weights for each signal in the overall consistency score (must sum to 100) */
const SCORE_WEIGHTS = {
  ja4:         30,
  ja3:         20,
  ciphers:     15,
  extensions:  15,
  http2:       10,
  headerOrder:  5,
  headerValues: 5,
} as const;

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
export function computeConsistencyScore(
  incoming: TlsProfile,
  history: TlsSnapshot[],
  enableJa4 = true,
  enableJa3 = true,
  enableHttp2 = true,
  enableHeaderConsistency = true,
): TlsConsistency {
  const factors: string[] = [];
  const isNewDevice = history.length === 0;

  if (isNewDevice) {
    return {
      consistencyScore: 100, // neutral — no history to compare against
      ja4Match: null,
      ja3Match: null,
      cipherJaccard: 1,
      extensionJaccard: 1,
      http2Score: 1,
      headerOrderScore: 1,
      headerValueScore: 1,
      tlshScore: null,
      isNewDevice: true,
      factors: [],
    };
  }

  const ref = history[0].profile;

  // ── JA4 ─────────────────────────────────────────────────────
  let ja4Match: boolean | null = null;
  let ja4Score = 1;
  if (enableJa4 && incoming.ja4 !== undefined && ref.ja4 !== undefined) {
    ja4Match = incoming.ja4 === ref.ja4;
    ja4Score = ja4Match ? 1 : 0;
    if (!ja4Match) factors.push('ja4_mismatch');
  } else if (enableJa4 && (incoming.ja4 !== undefined || ref.ja4 !== undefined)) {
    ja4Score = 0.5; // one side missing
  }

  // ── JA3 ─────────────────────────────────────────────────────
  let ja3Match: boolean | null = null;
  let ja3Score = 1;
  if (enableJa3 && incoming.ja3 !== undefined && ref.ja3 !== undefined) {
    ja3Match = incoming.ja3 === ref.ja3;
    ja3Score = ja3Match ? 1 : 0;
    if (!ja3Match) factors.push('ja3_mismatch');
  } else if (enableJa3 && (incoming.ja3 !== undefined || ref.ja3 !== undefined)) {
    ja3Score = 0.5;
  }

  // ── Cipher suites ────────────────────────────────────────────
  const cipherJaccard = jaccardSimilarity(incoming.cipherSuites, ref.cipherSuites);
  if (cipherJaccard < 0.7) factors.push('cipher_suite_change');

  // ── Extensions ───────────────────────────────────────────────
  const extensionJaccard = jaccardSimilarity(incoming.extensions, ref.extensions);
  if (extensionJaccard < 0.7) factors.push('extension_change');

  // ── HTTP/2 settings ──────────────────────────────────────────
  let http2Score = 1;
  if (enableHttp2) {
    http2Score = http2SettingsSimilarity(
      incoming.http2Settings ?? {},
      ref.http2Settings ?? {},
    );
    if (http2Score < 0.8) factors.push('http2_settings_change');
  }

  // ── Header order & values ────────────────────────────────────
  let headerOrderScore = 1;
  let headerValueScore = 1;
  if (enableHeaderConsistency) {
    headerOrderScore = headerOrderSimilarity(
      incoming.headerOrder ?? [],
      ref.headerOrder ?? [],
    );
    headerValueScore = headerValueSimilarity(
      incoming.headerValues ?? {},
      ref.headerValues ?? {},
    );
    if (headerOrderScore < 0.7) factors.push('header_order_change');
    if (headerValueScore < 0.7) factors.push('header_value_change');
  }

  // ── TLSH ─────────────────────────────────────────────────────
  const tlshScore = computeTlshScore(incoming, ref);
  if (tlshScore !== null && tlshScore < 50) factors.push('tlsh_distance_high');

  // ── Overall score ─────────────────────────────────────────────
  // Disable-aware weight normalisation
  let totalWeight = 0;
  let weightedSum = 0;

  function add(weight: number, score: number, enabled = true) {
    if (!enabled) return;
    totalWeight += weight;
    weightedSum += weight * score;
  }

  add(SCORE_WEIGHTS.ja4, ja4Score, enableJa4);
  add(SCORE_WEIGHTS.ja3, ja3Score, enableJa3);
  add(SCORE_WEIGHTS.ciphers, cipherJaccard);
  add(SCORE_WEIGHTS.extensions, extensionJaccard);
  add(SCORE_WEIGHTS.http2, http2Score, enableHttp2);
  add(SCORE_WEIGHTS.headerOrder, headerOrderScore, enableHeaderConsistency);
  add(SCORE_WEIGHTS.headerValues, headerValueScore, enableHeaderConsistency);

  const baseScore = totalWeight > 0 ? (weightedSum / totalWeight) * 100 : 100;

  // Blend TLSH if available (20 % weight)
  let consistencyScore: number;
  if (tlshScore !== null) {
    consistencyScore = 0.8 * baseScore + 0.2 * tlshScore;
  } else {
    consistencyScore = baseScore;
  }

  consistencyScore = Math.round(Math.max(0, Math.min(100, consistencyScore)));

  return {
    consistencyScore,
    ja4Match,
    ja3Match,
    cipherJaccard,
    extensionJaccard,
    http2Score,
    headerOrderScore,
    headerValueScore,
    tlshScore,
    isNewDevice: false,
    factors,
  };
}

/**
 * Convert a `TlsConsistency` report into a confidence delta (−15 to +15 points).
 *
 * Strong past-match boosts confidence; profile mismatch reduces it.
 *
 * @param consistency - Result of `computeConsistencyScore`.
 * @param weight      - Scale factor (0–1) applied to the raw delta. Default: 0.15.
 */
export function computeConfidenceBoost(
  consistency: TlsConsistency,
  weight = 0.15,
): number {
  if (consistency.isNewDevice) return 0;
  // Map 0–100 → −1 to +1, then scale to ±15 points
  const raw = ((consistency.consistencyScore - 50) / 50) * 15;
  return Math.round(raw * weight * (1 / 0.15)); // normalise back to full range
}
