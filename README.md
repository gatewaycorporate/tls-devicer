# tls-devicer

## Developed by Gateway Corporate Solutions

**TLS Fingerprinting Middleware** for the FP-Devicer Intelligence Suite.

Passively collect and match JA4 fingerprints, TLS extensions, cipher order,
HTTP/2 settings, and header consistency to strengthen device identity.

Part of the [FP-Devicer](https://github.com/gatewaycorporate/fp-devicer) family
— invisible to clients and extremely hard to spoof.

## Usage

tls-devicer is designed to integrate seamlessly with FP-Devicer by use of the
`registerWith` helper. This works best when your reverse proxy injects JA4 and
TLS headers.

```typescript
import { DeviceManager } from 'devicer.js';
import { TlsManager } from 'tls-devicer';

const deviceManager = new DeviceManager(...);
const tlsManager = new TlsManager({
  licenseKey: process.env.TLS_DEVICER_LICENSE_KEY
});

tlsManager.registerWith(deviceManager);

app.post('/identify', async (req, res) => {
  const result = await deviceManager.identify(req.body, {
    tlsProfile: {
      ja4: req.headers['x-ja4'],
      extensions: req.headers['x-tls-extensions']?.split(','),
      http2Settings: req.headers['x-http2-settings']
    }
  });
});
```

## Recommended Setup (Nginx)

```nginx
http {
    map $ssl_client_hello_ja4 $ja4 {
        default $ssl_client_hello_ja4;
    }
    proxy_set_header X-JA4 $ja4;
    proxy_set_header X-TLS-Extensions $ssl_client_hello_extensions;
}
```

## License

Published under the **Business Source License 1.1 (BSL-1.1)**

- Free for dev/testing/personal use
- Production use requires a paid license from Polar.sh
- Free tier has device count limits and basic features only

Pass the key in the constructor to remove all restrictions.
