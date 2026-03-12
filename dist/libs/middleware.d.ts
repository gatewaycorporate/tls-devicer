import type { IncomingMessage, ServerResponse } from 'node:http';
import type { TlsProfile } from '../types.js';
export type NextFunction = (err?: unknown) => void;
/** Extended request object with attached TLS profile */
export interface TlsRequest extends IncomingMessage {
    tlsProfile?: TlsProfile;
}
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
export declare function buildTlsProfile(headers: Record<string, string | string[] | undefined>): TlsProfile;
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
 * proxy_set_header X-JA4               $ssl_client_hello_ja4;
 * proxy_set_header X-TLS-Extensions     $ssl_client_hello_extensions;
 * proxy_set_header X-HTTP2-Settings     $http2_settings;
 * ```
 */
export declare function createTlsMiddleware(): (req: TlsRequest, _res: ServerResponse, next: NextFunction) => void;
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
export declare function extractProfileFromSocket(socket: NodeJS.Socket & {
    getCipher?: () => {
        name?: string;
        standardName?: string;
        version?: string;
    } | null;
    getProtocol?: () => string | null;
    getSharedSigalgs?: () => string[];
    isSessionReused?: () => boolean;
}): Partial<TlsProfile>;
//# sourceMappingURL=middleware.d.ts.map