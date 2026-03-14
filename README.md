# tls-devicer

## Developed by Gateway Corporate Solutions

**TLS Intelligence Middleware** for the FP-Devicer Intelligence Suite.

Passively collect and match JA4 fingerprints, TLS extensions, cipher order,
HTTP/2 settings, and header consistency to strengthen device identity.

Part of the [FP-Devicer](https://github.com/gatewaycorporate/fp-devicer) family
— invisible to clients and extremely hard to spoof.

Important: tls-devicer does not derive JA4 itself. It consumes JA4 or related
TLS signals from headers injected by an upstream edge such as Cloudflare,
HAProxy with custom logic, Envoy filters, or another TLS terminator that can
compute and forward them.

## Usage

tls-devicer is designed to integrate seamlessly with FP-Devicer by use of the
`registerWith` helper. This works best when your reverse proxy injects JA4 and
TLS headers.

```typescript
import { createInMemoryAdapter, DeviceManager } from "devicer.js";
import { TlsManager } from "tls-devicer";

const deviceManager = new DeviceManager(createInMemoryAdapter());
const tlsManager = new TlsManager({
	licenseKey: process.env.DEVICER_LICENSE_KEY,
});

tlsManager.registerWith(deviceManager);

app.post("/identify", async (req, res) => {
	const result = await deviceManager.identify(req.body, {
		tlsProfile: {
			ja4: req.headers["x-ja4"],
			extensions: req.headers["x-tls-extensions"]?.split(","),
			http2Settings: req.headers["x-http2-settings"],
		},
	});
});
```

## Recommended Setup (Nginx w/ CloudFlare)

Stock nginx cannot generate JA4 or expose ClientHello extension lists through
variables. That means the following variables do not exist in standard nginx:

- `$ssl_client_hello_ja4`
- `$ssl_client_hello_extensions`
- a request variable for the client's raw HTTP/2 SETTINGS frame

Use nginx as a pass-through layer for headers that were already added by an
upstream edge.

### Cloudflare to nginx to app

tls-devicer accepts `cf-ja4` directly, but many applications prefer normalizing
that to `x-ja4` before it reaches Node.

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

		# Cloudflare-managed JA4 header forwarded to your app.
		proxy_set_header X-JA4 $http_cf_ja4;

		# Optional JA3 alias if your upstream provides it.
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
2. Run tls-devicer without JA4 and rely on the signals nginx can actually
   expose, such as header order and selected TLS metadata available from other
   headers.

For plain nginx, do not expect native JA4, raw extension-order, or client HTTP/2
SETTINGS extraction.

### Documentation

This project uses typedoc and autodeploys via GitHub Pages. You can view the
generated documentation [here](https://gatewaycorporate.github.io/tls-devicer/).

## Installation

You can install ip-devicer and tls-devicer alongside FP-Devicer with

```bash
npm install devicer.js ip-devicer tls-devicer
```

You can also install the meta-package for the entire Devicer Intelligence Suite
with

```bash
npm install @gatewaycorporate/devicer-intel
```

## License

Published under the **Business Source License 1.1 (BSL-1.1)**

- Free for dev/testing/personal use
- Production use requires a paid license from Polar.sh
- Free tier has device count limits and basic features only
- Pro tier can operate on a single server and has no device count limits
- Enterprise can operate on any number of servers and has no device count limits

Pass the key in the constructor to remove restrictions

## Obtaining a Key

tls-devicer uses polar.js for key verification. You can obtain a key for dual
use of this library and ip-devicer by purchasing one
[here](https://buy.polar.sh/polar_cl_0Y4djPLDe5yLdNUDKdtPGlFW5TG2ZpFD5qkb93HsSQc)
