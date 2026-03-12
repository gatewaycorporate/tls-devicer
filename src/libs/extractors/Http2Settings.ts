// ────────────────────────────────────────────────────────────
//  Http2Settings — parse HTTP/2 SETTINGS from a proxy header
//  or a raw base64-encoded SETTINGS payload
// ────────────────────────────────────────────────────────────

import type { Http2SettingsMap } from '../../types.js';

/**
 * Header names where reverse proxies encode HTTP/2 SETTINGS.
 *
 * Cloudflare uses `cf-http2-settings` (base64-encoded raw frame payload).
 * Some custom setups inject a human-readable `k=v,k=v` string.
 */
const H2_SETTINGS_HEADERS = [
  'x-http2-settings',
  'cf-http2-settings',
  'x-h2-settings',
] as const;

/** Known SETTINGS identifiers → friendly key name */
const SETTINGS_IDS: Record<number, keyof Http2SettingsMap> = {
  0x1: 'headerTableSize',
  0x2: 'enablePush',
  0x3: 'maxConcurrentStreams',
  0x4: 'initialWindowSize',
  0x5: 'maxFrameSize',
  0x6: 'maxHeaderListSize',
};

// ── Parsers ───────────────────────────────────────────────────

/**
 * Parse a base64-encoded HTTP/2 SETTINGS payload.
 *
 * The HTTP/2 SETTINGS frame body consists of 6-byte pairs: 2 bytes identifier
 * (big-endian uint16) + 4 bytes value (big-endian uint32).
 */
function parseBase64Settings(raw: string): Http2SettingsMap {
  let buf: Buffer;
  try {
    buf = Buffer.from(raw, 'base64');
  } catch {
    return {};
  }

  const settings: Http2SettingsMap = {};
  for (let offset = 0; offset + 6 <= buf.length; offset += 6) {
    const id    = buf.readUInt16BE(offset);
    const value = buf.readUInt32BE(offset + 2);
    const key   = SETTINGS_IDS[id];
    if (key !== undefined) {
      (settings as Record<string, number>)[key] = value;
    }
  }
  return settings;
}

/**
 * Parse a key=value CSV string such as the one injected by some proxies:
 * `HEADER_TABLE_SIZE=65536,MAX_CONCURRENT_STREAMS=1000,...`
 */
function parseKvSettings(raw: string): Http2SettingsMap {
  const settings: Http2SettingsMap = {};
  const LABEL_MAP: Record<string, keyof Http2SettingsMap> = {
    header_table_size:    'headerTableSize',
    enable_push:          'enablePush',
    max_concurrent_streams: 'maxConcurrentStreams',
    initial_window_size:  'initialWindowSize',
    max_frame_size:       'maxFrameSize',
    max_header_list_size: 'maxHeaderListSize',
    // numeric id aliases
    '1': 'headerTableSize',
    '2': 'enablePush',
    '3': 'maxConcurrentStreams',
    '4': 'initialWindowSize',
    '5': 'maxFrameSize',
    '6': 'maxHeaderListSize',
  };

  for (const pair of raw.split(/[,;]/)) {
    const [k, v] = pair.split('=').map((s) => s.trim().toLowerCase());
    if (!k || v === undefined) continue;
    const mapped = LABEL_MAP[k];
    if (mapped !== undefined) {
      const num = Number(v);
      if (!isNaN(num)) {
        (settings as Record<string, number>)[mapped] = num;
      }
    }
  }
  return settings;
}

/**
 * Determine whether a header value looks like base64 (vs. a k=v string).
 */
function looksLikeBase64(s: string): boolean {
  return /^[A-Za-z0-9+/]+=*$/.test(s) && s.length % 4 === 0;
}

// ── Public API ────────────────────────────────────────────────

/**
 * Try to extract HTTP/2 SETTINGS from the reverse-proxy header.
 *
 * Supports both base64-encoded raw SETTINGS payloads and human-readable
 * `KEY=VALUE,...` strings.
 *
 * @param headers - Raw request headers.
 * @returns Parsed settings or an empty object when no header is present.
 */
export function extractHttp2Settings(
  headers: Record<string, string | string[] | undefined>,
): Http2SettingsMap {
  for (const name of H2_SETTINGS_HEADERS) {
    const raw = headers[name] ?? headers[name.toLowerCase()];
    if (!raw) continue;
    const value = (Array.isArray(raw) ? raw[0] : raw).trim();
    if (!value) continue;

    if (looksLikeBase64(value)) {
      return parseBase64Settings(value);
    }
    return parseKvSettings(value);
  }
  return {};
}

/**
 * Compute a similarity score (0–1) between two `Http2SettingsMap` objects.
 *
 * Each matching key adds `1 / total_keys`; an exact value match adds the
 * full contribution, a proportional difference reduces it.
 */
export function http2SettingsSimilarity(
  a: Http2SettingsMap,
  b: Http2SettingsMap,
): number {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof Http2SettingsMap>;
  if (keys.size === 0) return 1;

  let total = 0;
  for (const key of keys) {
    const va = (a as Record<string, number | undefined>)[key as string];
    const vb = (b as Record<string, number | undefined>)[key as string];
    if (va === undefined || vb === undefined) {
      total += 0.5; // neutral — one side missing
      continue;
    }
    if (va === vb) {
      total += 1;
    } else {
      // Proportional proximity — large value diffs still count a bit
      const range = Math.max(Math.abs(va), Math.abs(vb), 1);
      total += Math.max(0, 1 - Math.abs(va - vb) / range);
    }
  }
  return total / keys.size;
}
