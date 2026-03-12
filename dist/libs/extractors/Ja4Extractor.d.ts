import type { TlsProfile } from '../../types.js';
/**
 * JA4 format:  `{proto}{tls_ver}{sni_flag}{ciphers_count}_{sorted_cipher_hex}_{sorted_ext_hex}`
 * Full spec: https://github.com/FoxIO-LLC/ja4
 *
 * Parses the raw JA4 string without re-deriving from raw TLS — the string
 * itself is the fingerprint we store and compare.
 */
export declare function parseJa4(raw: string): {
    ja4: string;
    valid: boolean;
};
/**
 * Parse a comma, semicolon, or hyphen-separated list of cipher suite or
 * extension codes from a header value. Accepts both decimal and 0x-prefixed hex.
 * GREASE values (0xXAXA where X = any nibble) are filtered out.
 */
export declare function parseCodeList(raw: string): number[];
/**
 * Extract JA4, JA3, cipher suites, and TLS extensions from HTTP request headers
 * injected by a reverse proxy (Nginx, HAProxy, Caddy, Cloudflare, etc.).
 *
 * Returns a partial `TlsProfile` — only fields that were actually found
 * in the headers are set.
 *
 * @param headers - Raw request headers (`IncomingMessage.headers` compatible).
 */
export declare function extractTlsFromHeaders(headers: Record<string, string | string[] | undefined>): Partial<TlsProfile>;
//# sourceMappingURL=Ja4Extractor.d.ts.map