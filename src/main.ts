// ── Core ──────────────────────────────────────────────────────
export { TlsManager } from './core/TlsManager.js';

// ── Licensing ─────────────────────────────────────────────────
export {
  validateLicense,
  evictLicenseCache,
  POLAR_ORGANIZATION_ID,
  POLAR_BENEFIT_IDS,
  FREE_TIER_MAX_DEVICES,
  FREE_TIER_MAX_HISTORY,
} from './libs/license.js';
export type { LicenseTier, LicenseInfo } from './libs/license.js';

// ── Types ─────────────────────────────────────────────────────
export type {
  TlsManagerOptions,
  Http2SettingsMap,
  TlsProfile,
  TlsSnapshot,
  TlsConsistency,
  TlsIdentifyContext,
  IdentifyResult,
  EnrichedIdentifyResult,
} from './types.js';

// ── Middleware ────────────────────────────────────────────────
export { createTlsMiddleware, buildTlsProfile, extractProfileFromSocket } from './libs/middleware.js';
export type { NextFunction, TlsRequest } from './libs/middleware.js';

// ── Extractors ────────────────────────────────────────────────
export {
  extractTlsFromHeaders,
  parseJa4,
  parseCodeList,
} from './libs/extractors/Ja4Extractor.js';

export {
  extractHttp2Settings,
  http2SettingsSimilarity,
} from './libs/extractors/Http2Settings.js';

export {
  extractHeaderSignals,
  headerOrderSimilarity,
  headerValueSimilarity,
} from './libs/extractors/headers.js';

// ── Scoring ───────────────────────────────────────────────────
export {
  computeConsistencyScore,
  computeConfidenceBoost,
  computeTlshScore,
  jaccardSimilarity,
} from './libs/scoring.js';

// ── Storage ───────────────────────────────────────────────────
export { createTlsStorage, serializeProfile } from './libs/adapters/inmemory.js';
export type { TlsStorage } from './libs/adapters/inmemory.js';
export { createSqliteAdapter } from './libs/adapters/sqlite.js';
export type { AsyncTlsStorage } from './libs/adapters/sqlite.js';
export { createPostgresAdapter } from './libs/adapters/postgres.js';
export type { PgPoolLike } from './libs/adapters/postgres.js';
export { createRedisAdapter } from './libs/adapters/redis.js';
export type { RedisLike } from './libs/adapters/redis.js';
