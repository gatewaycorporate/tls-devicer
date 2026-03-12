// ────────────────────────────────────────────────────────────
//  tls-devicer — shared types
// ────────────────────────────────────────────────────────────

// ── Constructor options ──────────────────────────────────────

export interface TlsManagerOptions {
  /** BSL-1.1 license key — unlocks full history and advanced scoring */
  licenseKey?: string;
  /** Max TLS snapshots kept per deviceId in memory. Default: 50 (10 without key) */
  maxHistoryPerDevice?: number;
  /** Track and score JA4 fingerprint. Default: true */
  enableJa4?: boolean;
  /** Track and score JA3 fingerprint. Default: true */
  enableJa3?: boolean;
  /** Score HTTP/2 SETTINGS frame consistency. Default: true */
  enableHttp2?: boolean;
  /** Score header order and stable-value consistency. Default: true */
  enableHeaderConsistency?: boolean;
  /**
   * Weight applied to TLS consistency when boosting / penalising the
   * DeviceManager confidence signal. Range 0–1. Default: 0.15
   */
  confidenceBoostWeight?: number;
}

// ── HTTP/2 SETTINGS ──────────────────────────────────────────

/** Known HTTP/2 SETTINGS frame identifiers and their values */
export interface Http2SettingsMap {
  /** SETTINGS_HEADER_TABLE_SIZE (0x1) */
  headerTableSize?: number;
  /** SETTINGS_ENABLE_PUSH (0x2) */
  enablePush?: number;
  /** SETTINGS_MAX_CONCURRENT_STREAMS (0x3) */
  maxConcurrentStreams?: number;
  /** SETTINGS_INITIAL_WINDOW_SIZE (0x4) */
  initialWindowSize?: number;
  /** SETTINGS_MAX_FRAME_SIZE (0x5) */
  maxFrameSize?: number;
  /** SETTINGS_MAX_HEADER_LIST_SIZE (0x6) */
  maxHeaderListSize?: number;
}

// ── TLS profile ──────────────────────────────────────────────

/**
 * Passively collected TLS / network signals for a single request.
 * All fields optional — gracefully scored when partially available.
 */
export interface TlsProfile {
  /** JA4 fingerprint string (e.g. "t13d1516h2_...") */
  ja4?: string;
  /** JA3 fingerprint MD5 string */
  ja3?: string;
  /** JA3S (server-side) fingerprint MD5 string */
  ja3s?: string;
  /**
   * TLS cipher suite codes in the order sent by the client.
   * GREASE values (0xXAXA patterns) should be stripped before passing.
   */
  cipherSuites?: number[];
  /**
   * TLS extension type codes in the order encountered in the ClientHello.
   */
  extensions?: number[];
  /** Supported elliptic curves (named groups) */
  ellipticCurves?: number[];
  /** Elliptic curve point formats */
  pointFormats?: number[];
  /** HTTP/2 SETTINGS frame values observed in the connection preface */
  http2Settings?: Http2SettingsMap;
  /** HTTP header names in the order they were received */
  headerOrder?: string[];
  /**
   * Selected stable header values used to detect spoofing.
   * Suggested keys: Accept, Accept-Encoding, Accept-Language, Connection.
   */
  headerValues?: Record<string, string>;
}

// ── Storage ──────────────────────────────────────────────────

export interface TlsSnapshot {
  id: string;
  deviceId: string;
  timestamp: Date;
  profile: TlsProfile;
}

// ── Consistency / scoring result ─────────────────────────────

export interface TlsConsistency {
  /** Overall consistency of the TLS profile against device history. 0–100 */
  consistencyScore: number;
  /** Whether the JA4 string matches the most-recent snapshot. null = no history */
  ja4Match: boolean | null;
  /** Whether the JA3 string matches the most-recent snapshot. null = no history */
  ja3Match: boolean | null;
  /** Jaccard similarity of cipher suites vs the most-recent snapshot. 0–1 */
  cipherJaccard: number;
  /** Jaccard similarity of TLS extensions vs the most-recent snapshot. 0–1 */
  extensionJaccard: number;
  /** HTTP/2 settings similarity vs the most-recent snapshot. 0–1 */
  http2Score: number;
  /** Header order Jaccard similarity vs the most-recent snapshot. 0–1 */
  headerOrderScore: number;
  /** Stable header values similarity vs the most-recent snapshot. 0–1 */
  headerValueScore: number;
  /**
   * TLSH fuzzy hash distance score. 100 = identical, 0 = maximally different.
   * null when TLSH cannot be computed (profile too short).
   */
  tlshScore: number | null;
  /** True when no history existed before this request */
  isNewDevice: boolean;
  /** Human-readable anomaly signals detected */
  factors: string[];
}

// ── Context attached to DeviceManager.identify() ─────────────

export interface TlsIdentifyContext {
  /** TLS profile extracted by middleware or manually constructed */
  tlsProfile?: TlsProfile;
  /** Raw request headers (used as fallback for header-order extraction) */
  headers?: Record<string, string | string[] | undefined>;
}

// ── Extended IdentifyResult ───────────────────────────────────

export interface IdentifyResult {
  deviceId: string;
  confidence: number;
  isNewDevice: boolean;
  matchConfidence: number;
  linkedUserId?: string;
}

export interface EnrichedIdentifyResult extends IdentifyResult {
  tlsConsistency?: TlsConsistency;
  /** Net confidence points applied (+/-) based on TLS signal */
  tlsConfidenceBoost?: number;
}
