import { describe, it, expect, vi } from 'vitest';
import { createTlsMiddleware, buildTlsProfile, extractProfileFromSocket } from '../libs/middleware.js';
import type { TlsRequest } from '../libs/middleware.js';
import type { ServerResponse } from 'node:http';

// ── createTlsMiddleware ───────────────────────────────────────

describe('createTlsMiddleware', () => {
  function makeReq(headers: Record<string, string> = {}): TlsRequest {
    return {
      headers,
      socket: {},
    } as unknown as TlsRequest;
  }

  it('attaches tlsProfile to the request object', () => {
    const middleware = createTlsMiddleware();
    const req = makeReq({ 'x-ja4': 't13d1516h2_8daaf6152771_b0da82dd1658', accept: 'text/html' });
    const next = vi.fn();

    middleware(req, {} as ServerResponse, next);

    expect(req.tlsProfile).toBeDefined();
    expect(req.tlsProfile!.ja4).toBe('t13d1516h2_8daaf6152771_b0da82dd1658');
    expect(next).toHaveBeenCalledOnce();
  });

  it('calls next() even when no tls headers are present', () => {
    const middleware = createTlsMiddleware();
    const req = makeReq({ host: 'example.com' });
    const next = vi.fn();

    middleware(req, {} as ServerResponse, next);

    expect(req.tlsProfile).toBeDefined();
    expect(next).toHaveBeenCalledOnce();
  });

  it('attaches cipher suites from header', () => {
    const middleware = createTlsMiddleware();
    const req = makeReq({ 'x-tls-ciphers': '4865,4866,4867' });
    const next = vi.fn();

    middleware(req, {} as ServerResponse, next);

    expect(req.tlsProfile!.cipherSuites).toEqual([4865, 4866, 4867]);
  });

  it('attaches http2 settings from header', () => {
    const middleware = createTlsMiddleware();
    const req = makeReq({ 'x-http2-settings': 'header_table_size=65536' });
    const next = vi.fn();

    middleware(req, {} as ServerResponse, next);

    expect(req.tlsProfile!.http2Settings?.headerTableSize).toBe(65536);
  });

  it('captures header order and stable values', () => {
    const middleware = createTlsMiddleware();
    const req = makeReq({ accept: 'text/html', 'accept-encoding': 'gzip' });
    const next = vi.fn();

    middleware(req, {} as ServerResponse, next);

    expect(req.tlsProfile!.headerOrder).toContain('accept');
    expect(req.tlsProfile!.headerValues?.['accept']).toBe('text/html');
  });
});

// ── buildTlsProfile (edge cases) ─────────────────────────────

describe('buildTlsProfile edge cases', () => {
  it('handles array header values', () => {
    const profile = buildTlsProfile({
      'x-ja3': ['aabbccddeeff00112233445566778899'],
      'accept': ['text/html'],
    } as Record<string, string | string[] | undefined>);
    expect(profile.ja3).toBe('aabbccddeeff00112233445566778899');
    expect(profile.headerValues?.['accept']).toBe('text/html');
  });

  it('handles cf-ja4 header alias', () => {
    const profile = buildTlsProfile({ 'cf-ja4': 't13d1516h2_8daaf6152771_b0da82dd1658' });
    expect(profile.ja4).toBe('t13d1516h2_8daaf6152771_b0da82dd1658');
  });

  it('handles cf-ja3-fingerprint header alias', () => {
    const profile = buildTlsProfile({ 'cf-ja3-fingerprint': 'aabbccddeeff00112233445566778899' });
    expect(profile.ja3).toBe('aabbccddeeff00112233445566778899');
  });

  it('handles x-ja3s header', () => {
    const profile = buildTlsProfile({ 'x-ja3s': 'serverja3hash00000000000000000000' });
    expect(profile.ja3s).toBe('serverja3hash00000000000000000000');
  });

  it('handles x-tls-groups header for elliptic curves', () => {
    const profile = buildTlsProfile({ 'x-tls-groups': '29,23,24' });
    expect(profile.ellipticCurves).toEqual([29, 23, 24]);
  });

  it('strips GREASE from cipher header', () => {
    // 0x0a0a = 2570 in decimal
    const profile = buildTlsProfile({ 'x-tls-ciphers': '2570,4865' });
    expect(profile.cipherSuites).not.toContain(2570);
    expect(profile.cipherSuites).toContain(4865);
  });
});

// ── extractProfileFromSocket ──────────────────────────────────

describe('extractProfileFromSocket', () => {
  it('returns empty profile when getCipher is absent', () => {
    const socket = {} as unknown as Parameters<typeof extractProfileFromSocket>[0];
    const profile = extractProfileFromSocket(socket);
    expect(profile).toEqual({});
  });

  it('returns empty profile when getCipher returns null', () => {
    const socket = { getCipher: () => null } as unknown as Parameters<typeof extractProfileFromSocket>[0];
    const profile = extractProfileFromSocket(socket);
    expect(profile).toEqual({});
  });

  it('maps a known IANA cipher name to its numeric code', () => {
    const socket = {
      getCipher: () => ({ standardName: 'TLS_AES_128_GCM_SHA256', name: 'ECDHE-RSA-AES128-GCM-SHA256', version: 'TLSv1.3' }),
    } as unknown as Parameters<typeof extractProfileFromSocket>[0];
    const profile = extractProfileFromSocket(socket);
    expect(profile.cipherSuites).toEqual([0x1301]);
  });

  it('falls back to cipher.name when standardName is absent', () => {
    const socket = {
      getCipher: () => ({ name: 'TLS_CHACHA20_POLY1305_SHA256', version: 'TLSv1.3' }),
    } as unknown as Parameters<typeof extractProfileFromSocket>[0];
    const profile = extractProfileFromSocket(socket);
    expect(profile.cipherSuites).toEqual([0x1303]);
  });

  it('returns empty cipherSuites when cipher name is unknown', () => {
    const socket = {
      getCipher: () => ({ standardName: 'UNKNOWN_CIPHER', name: 'UNKNOWN_CIPHER', version: 'TLSv1.2' }),
    } as unknown as Parameters<typeof extractProfileFromSocket>[0];
    const profile = extractProfileFromSocket(socket);
    expect(profile.cipherSuites).toBeUndefined();
  });

  it('handles getCipher throwing without propagating the error', () => {
    const socket = {
      getCipher: () => { throw new Error('socket closed'); },
    } as unknown as Parameters<typeof extractProfileFromSocket>[0];
    expect(() => extractProfileFromSocket(socket)).not.toThrow();
    const profile = extractProfileFromSocket(socket);
    expect(profile).toEqual({});
  });
});
