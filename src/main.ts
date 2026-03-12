// ── Core ──────────────────────────────────────────────────────
export { TlsManager } from './core/TlsManager.js';

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
export {
  createTlsMiddleware,
  buildTlsProfile,
  extractProfileFromSocket,
  type NextFunction,
  type TlsRequest,
} from './libs/middleware.js';

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
export {
  createTlsStorage,
  serializeProfile,
  type TlsStorage,
} from './libs/adapters/inmemory.js';

export {
  createSqliteAdapter,
  type AsyncTlsStorage,
} from './libs/adapters/sqlite.js';

export {
  createPostgresAdapter,
  type PgPoolLike,
} from './libs/adapters/postgres.js';

export {
  createRedisAdapter,
  type RedisLike,
} from './libs/adapters/redis.js';
