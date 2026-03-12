import type { Http2SettingsMap } from '../../types.js';
/**
 * Try to extract HTTP/2 SETTINGS from the reverse-proxy header.
 *
 * Supports both base64-encoded raw SETTINGS payloads and human-readable
 * `KEY=VALUE,...` strings.
 *
 * @param headers - Raw request headers.
 * @returns Parsed settings or an empty object when no header is present.
 */
export declare function extractHttp2Settings(headers: Record<string, string | string[] | undefined>): Http2SettingsMap;
/**
 * Compute a similarity score (0–1) between two `Http2SettingsMap` objects.
 *
 * Each matching key adds `1 / total_keys`; an exact value match adds the
 * full contribution, a proportional difference reduces it.
 */
export declare function http2SettingsSimilarity(a: Http2SettingsMap, b: Http2SettingsMap): number;
//# sourceMappingURL=Http2Settings.d.ts.map