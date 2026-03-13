// ────────────────────────────────────────────────────────────
//  middleware — Express/Connect-compatible TLS signal extractor
// ────────────────────────────────────────────────────────────

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { TlsProfile } from '../types.js';
import { extractTlsFromHeaders } from './extractors/Ja4Extractor.js';
import { extractHttp2Settings } from './extractors/Http2Settings.js';
import { extractHeaderSignals } from './extractors/headers.js';

export type NextFunction = (err?: unknown) => void;

/** Extended request object with attached TLS profile */
export interface TlsRequest extends IncomingMessage {
  tlsProfile?: TlsProfile;
}

// ── Core extraction logic ─────────────────────────────────────

/**
 * Build a `TlsProfile` from the raw headers of a single HTTP request.
 *
 * Merges signals from:
 * 1. JA4 / JA3 / cipher / extension proxy headers (`Ja4Extractor`)
 * 2. HTTP/2 SETTINGS proxy header (`Http2Settings`)
 * 3. Header order and stable values (`headers` extractor)
 *
 * @param headers - Raw request headers (`IncomingMessage.headers`).
 */
export function buildTlsProfile(
  headers: Record<string, string | string[] | undefined>,
): TlsProfile {
  return {
    ...extractTlsFromHeaders(headers),
    http2Settings: extractHttp2Settings(headers),
    ...extractHeaderSignals(headers),
  };
}

// ── Express / Connect middleware factory ─────────────────────

/**
 * Create an Express/Connect/Fastify-compatible middleware that passively
 * collects TLS and HTTP/2 fingerprint signals from every request and
 * attaches a `TlsProfile` to `req.tlsProfile`.
 *
 * The middleware itself does not call `TlsManager.analyze()` — attach the
 * extracted profile by passing `req.tlsProfile` in to your identity call
 * (or use `TlsManager.registerWith(deviceManager)` for automatic injection).
 *
 * ### Setup
 * ```ts
 * import { createTlsMiddleware } from 'tls-devicer';
 * app.use(createTlsMiddleware());
 *
 * app.post('/identify', async (req, res) => {
 *   const result = await deviceManager.identify(req.body, {
 *     tlsProfile: req.tlsProfile,
 *   });
 * });
 * ```
 *
 * ### Nginx example (injecting JA4)
 * ```nginx
 * # Stock nginx cannot generate JA4 itself.
 * # Forward a JA4 header from an upstream edge such as Cloudflare.
 * proxy_set_header X-JA4 $http_cf_ja4;
 * ```
 */
export function createTlsMiddleware() {
  return function tlsMiddleware(
    req: TlsRequest,
    _res: ServerResponse,
    next: NextFunction,
  ): void {
    req.tlsProfile = buildTlsProfile(
      req.headers as Record<string, string | string[] | undefined>,
    );
    next();
  };
}

// ── Node.js TLS socket inspector ─────────────────────────────

/**
 * Attempt to read raw TLS properties exposed on a Node.js `TLSSocket`.
 *
 * This requires Node.js >= 20 with `enableTrace: true` or a custom TLS
 * server that exposes `socket._tlsConnectState` / `socket.getPeerCertificate`.
 *
 * Returns a partial `TlsProfile` with whatever information is available from
 * the socket; most fields typically require a reverse-proxy to inject headers
 * (see `createTlsMiddleware`).
 *
 * @param socket - A `tls.TLSSocket` from a Node.js HTTPS/TLS server.
 */
export function extractProfileFromSocket(
  socket: NodeJS.Socket & {
    // TLSSocket-like interface — kept loose to avoid a hard dep on @types/node TLS
    getCipher?: () => { name?: string; standardName?: string; version?: string } | null;
    getProtocol?: () => string | null;
    getSharedSigalgs?: () => string[];
    isSessionReused?: () => boolean;
  },
): Partial<TlsProfile> {
  const profile: Partial<TlsProfile> = {};

  try {
    const cipher = socket.getCipher?.();
    if (cipher) {
      // Standard cipher names follow IANA format: TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256
      // Map to IANA numeric code where straightforwardly available
      const ianaCodes = tlsCipherNameToCode(cipher.standardName ?? cipher.name ?? '');
      if (ianaCodes !== null) profile.cipherSuites = [ianaCodes];
    }
  } catch {
    // ignore
  }

  return profile;
}

// ── Minimal cipher name → IANA code map ──────────────────────

/** Subset of common IANA TLS cipher suite codes used for socket fallback */
const CIPHER_NAME_TO_CODE: Record<string, number> = {
  TLS_AES_128_GCM_SHA256:                 0x1301,
  TLS_AES_256_GCM_SHA384:                 0x1302,
  TLS_CHACHA20_POLY1305_SHA256:           0x1303,
  TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256: 0xc02b,
  TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256:  0xc02f,
  TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384: 0xc02c,
  TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384:  0xc030,
  TLS_ECDHE_ECDSA_WITH_CHACHA20_POLY1305_SHA256: 0xcca9,
  TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256:   0xcca8,
};

function tlsCipherNameToCode(name: string): number | null {
  return CIPHER_NAME_TO_CODE[name] ?? null;
}
