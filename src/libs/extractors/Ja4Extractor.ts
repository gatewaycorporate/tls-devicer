// ────────────────────────────────────────────────────────────
//  Ja4Extractor — parse JA4 / JA3 TLS fingerprints from
//  reverse-proxy injected headers or raw strings
// ────────────────────────────────────────────────────────────

import type { TlsProfile } from '../../types.js';

/**
 * Header names where reverse proxies typically inject JA4 / JA3 values.
 * Listed in priority order; the first non-empty header wins.
 */
const JA4_HEADERS = ['x-ja4', 'x-tls-ja4', 'cf-ja4'] as const;
const JA3_HEADERS  = ['x-ja3', 'x-tls-ja3', 'cf-ja3-fingerprint'] as const;
const JA3S_HEADERS = ['x-ja3s', 'x-tls-ja3s'] as const;

/**
 * Cipher suite header — some proxies inject the raw list separately from JA4.
 * Expected format: comma or hyphen-separated decimal or hex codes.
 */
const CIPHER_HEADERS = ['x-tls-ciphers', 'x-ssl-ciphers'] as const;

/** TLS extension header — comma-separated decimal type codes */
const EXT_HEADERS = ['x-tls-extensions', 'x-ssl-extensions'] as const;

/** Supported groups (elliptic curves) header */
const CURVES_HEADERS = ['x-tls-groups', 'x-tls-supported-groups'] as const;

// ── JA4 structural parser ─────────────────────────────────────

/**
 * JA4 format:  `{proto}{tls_ver}{sni_flag}{ciphers_count}_{sorted_cipher_hex}_{sorted_ext_hex}`
 * Full spec: https://github.com/FoxIO-LLC/ja4
 *
 * Parses the raw JA4 string without re-deriving from raw TLS — the string
 * itself is the fingerprint we store and compare.
 */
export function parseJa4(raw: string): { ja4: string; valid: boolean } {
  // Format: {proto(1)}{tls_ver(2)}{sni(1)}{ciphers_count(2)}{exts_count(2)}{alpn(2)}_{hash}_{hash}
  const valid = /^[a-z][0-9]{2}[di][0-9]{4}[a-z0-9]{2}_[0-9a-f]+_[0-9a-f]+$/i.test(raw);
  return { ja4: raw.trim(), valid };
}

// ── Cipher suite / extension list parser ─────────────────────

/**
 * Parse a comma, semicolon, or hyphen-separated list of cipher suite or
 * extension codes from a header value. Accepts both decimal and 0x-prefixed hex.
 * GREASE values (0xXAXA where X = any nibble) are filtered out.
 */
export function parseCodeList(raw: string): number[] {
  if (!raw) return [];
  return raw
    .split(/[\s,;-]+/)
    .map((s) => {
      const trimmed = s.trim();
      if (!trimmed) return NaN;
      return trimmed.startsWith('0x') || trimmed.startsWith('0X')
        ? parseInt(trimmed, 16)
        : parseInt(trimmed, 10);
    })
    .filter((n) => {
      if (isNaN(n) || n < 0) return false;
      // Strip GREASE: any value of the form 0x?A?A
      return !isGrease(n);
    });
}

/**
 * Returns true for GREASE values defined in RFC 8701.
 * GREASE ciphers/groups follow the pattern 0x{X}A{X}A where X ∈ {0..F}.
 */
function isGrease(value: number): boolean {
  const lo = value & 0xff;
  const hi = (value >> 8) & 0xff;
  return lo === 0x0a && hi === lo;
}

// ── Header-based extractor ────────────────────────────────────

function firstHeader(
  headers: Record<string, string | string[] | undefined>,
  names: readonly string[],
): string | undefined {
  for (const name of names) {
    const val = headers[name] ?? headers[name.toLowerCase()];
    if (val) return Array.isArray(val) ? val[0] : val;
  }
  return undefined;
}

/**
 * Extract JA4, JA3, cipher suites, and TLS extensions from HTTP request headers
 * injected by a reverse proxy (Nginx, HAProxy, Caddy, Cloudflare, etc.).
 *
 * Returns a partial `TlsProfile` — only fields that were actually found
 * in the headers are set.
 *
 * @param headers - Raw request headers (`IncomingMessage.headers` compatible).
 */
export function extractTlsFromHeaders(
  headers: Record<string, string | string[] | undefined>,
): Partial<TlsProfile> {
  const profile: Partial<TlsProfile> = {};

  const rawJa4 = firstHeader(headers, JA4_HEADERS);
  if (rawJa4) {
    const { ja4 } = parseJa4(rawJa4);
    profile.ja4 = ja4;
  }

  const rawJa3 = firstHeader(headers, JA3_HEADERS);
  if (rawJa3) profile.ja3 = rawJa3.trim();

  const rawJa3s = firstHeader(headers, JA3S_HEADERS);
  if (rawJa3s) profile.ja3s = rawJa3s.trim();

  const rawCiphers = firstHeader(headers, CIPHER_HEADERS);
  if (rawCiphers) profile.cipherSuites = parseCodeList(rawCiphers);

  const rawExts = firstHeader(headers, EXT_HEADERS);
  if (rawExts) profile.extensions = parseCodeList(rawExts);

  const rawCurves = firstHeader(headers, CURVES_HEADERS);
  if (rawCurves) profile.ellipticCurves = parseCodeList(rawCurves);

  return profile;
}
