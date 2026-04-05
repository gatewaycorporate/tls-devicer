# tls-devicer

**TLS Intelligence Middleware** for the FP-Devicer Intelligence Suite.
Developed by [Gateway Corporate Solutions](https://gatewaycorporate.io).

---

## Overview

`tls-devicer` passively collects and compares JA4 fingerprints, JA3/JA3S,
extension order, cipher order, HTTP/2 settings, and header consistency to
strengthen device identity matching.

Important: `tls-devicer` does not derive JA4 itself. It consumes JA4 or related
TLS signals from headers injected by an upstream edge such as Cloudflare,
HAProxy with custom logic, Envoy filters, or another TLS terminator that can
compute and forward them.

### What it does

| Step | Description |
|------|-------------|
| **TLS profile ingestion** | Accepts JA4, JA3, JA3S, cipher suites, extension order, HTTP/2 settings, and ordered headers from middleware or request context. |
| **Protocol consistency** | Compares the current TLS profile against historical snapshots for the same device. |
| **Signal scoring** | Computes similarity across JA4, JA3, cipher suites, extension sets, HTTP/2 settings, header order, and stable header values. |
| **Anomaly detection** | Emits human-readable factor keys when profiles drift in suspicious ways. |
| **Confidence adjustment** | Applies a positive or negative confidence delta back into the `DeviceManager` result. |

---

## Installation

Install `tls-devicer` as a standalone package:

```bash
npm install tls-devicer
```

Install the bundled network-intelligence pair with FP-Devicer:

```bash
npm install devicer.js ip-devicer tls-devicer
```

Optional peer dependencies for persistent storage:

```bash
npm install better-sqlite3
npm install ioredis
npm install pg
```

Install the full Devicer Intelligence Suite meta-package:

```bash
npm install @gatewaycorporate/devicer-intel
```

---

## Quick start

```typescript
import { createInMemoryAdapter, DeviceManager } from "devicer.js";
import { TlsManager } from "tls-devicer";

const deviceManager = new DeviceManager(createInMemoryAdapter());
const tlsManager = new TlsManager({
	licenseKey: process.env.DEVICER_LICENSE_KEY,
});

deviceManager.use(tlsManager);

app.post("/identify", async (req, res) => {
	const result = await deviceManager.identify(req.body.fpPayload, {
		tlsProfile: {
			ja4: req.headers["x-ja4"] as string | undefined,
			ja3: req.headers["x-ja3"] as string | undefined,
			headerOrder: Object.keys(req.headers),
		},
	});

	res.json(result);
});
```

---

## Storage adapters

| Adapter | Import | Use case |
|---------|--------|----------|
| In-memory *(default)* | `createTlsStorage` | Dev / testing / single-process |
| SQLite | `createSqliteAdapter` | Single-process production |
| PostgreSQL | `createPostgresAdapter` | Multi-process / HA |
| Redis | `createRedisAdapter` | Distributed / low-latency |

```typescript
import { createSqliteAdapter, TlsManager } from "tls-devicer";

const tlsStorage = createSqliteAdapter("./data/tls-history.db");
await tlsStorage.init();

const tlsManager = new TlsManager({
	licenseKey: process.env.DEVICER_LICENSE_KEY,
	storage: tlsStorage,
});
```

---

## Recommended setup

Stock nginx cannot generate JA4 or expose ClientHello extension lists through
variables. That means the following variables do not exist in standard nginx:

- `$ssl_client_hello_ja4`
- `$ssl_client_hello_extensions`
- a request variable for the client's raw HTTP/2 SETTINGS frame

Use nginx as a pass-through layer for headers that were already added by an
upstream edge.

### Cloudflare to nginx to app

`tls-devicer` accepts `cf-ja4` directly, but many applications prefer
normalizing that to `x-ja4` before it reaches Node.

This method requires a Cloudflare Enterprise subscription.

```nginx
server {
	listen 443 ssl http2;
	server_name example.com;

	ssl_certificate /etc/letsencrypt/live/example/fullchain.pem;
	ssl_certificate_key /etc/letsencrypt/live/example/privkey.pem;

	location / {
		proxy_pass http://127.0.0.1:3000;

		proxy_set_header Host $host;
		proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
		proxy_set_header X-Forwarded-Proto $scheme;

		proxy_set_header X-JA4 $http_cf_ja4;
		proxy_set_header X-JA3 $http_cf_ja3_fingerprint;
	}
}
```

In your application, either consume `x-ja4` as shown above or pass the raw
Cloudflare header through unchanged. `tls-devicer` supports both `x-ja4` and
`cf-ja4`.

### If nginx is your TLS edge

If nginx is the first TLS terminator, you have two realistic options:

1. Use another edge or extension that computes JA4 and injects it before the
   request reaches your app.
2. Run `tls-devicer` without JA4 and rely on the signals nginx can actually
   expose, such as header order and selected TLS metadata available from other
   headers.

For plain nginx, do not expect native JA4, raw extension-order, or client
HTTP/2 SETTINGS extraction.

---

## Plugin pipeline

Reference deployments typically bundle `ip-devicer` and `tls-devicer` together
as the network-intelligence pair.

```text
identify(payload, context)
   │
   ├─ 'ip'  post-processor  (ip-devicer, optional companion bundle)
   │     └─> complementary geo / ASN / risk signals
   │
   └─ 'tls' post-processor  (tls-devicer)
         ├─ compares JA4 / JA3 / HTTP/2 / header signals
         └─> result.tlsConsistency + result.tlsConfidenceBoost
```

---

## Enrichment result shape

```typescript
{
  tlsConsistency: {
    consistencyScore: number;
    ja4Match: boolean | null;
    ja3Match: boolean | null;
    cipherJaccard: number;
    extensionJaccard: number;
    http2Score: number;
    headerOrderScore: number;
    headerValueScore: number;
    tlshScore: number | null;
    isNewDevice: boolean;
    factors: string[];
  };
  tlsConfidenceBoost?: number;
}
```

---

## License tiers

| Tier | Price | Devices | Capability |
|------|-------|---------|------------|
| Free | $0 | 10,000 | Basic features only |
| Pro | $49 / mo | Unlimited | Single-server production |
| Enterprise | $299 / mo | Unlimited | Multi-server production |

Production use requires a paid license. You can obtain a dual-use key for
`tls-devicer` and `ip-devicer` through polar.sh
[here](https://buy.polar.sh/polar_cl_0Y4djPLDe5yLdNUDKdtPGlFW5TG2ZpFD5qkb93HsSQc).

---

## API reference

This project uses TypeDoc and publishes documentation at
[gatewaycorporate.github.io/tls-devicer](https://gatewaycorporate.github.io/tls-devicer/).

---

## License

Business Source License 1.1 — see [license.txt](./license.txt).
