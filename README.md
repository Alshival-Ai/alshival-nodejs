# Alshival SDK (Node.js)

<p align="center"><a href="https://alshival.ai"><img src="https://alshival.ai/static/img/logos/brain1_transparent.png" alt="Alshival" width="50%" /></a></p>

Node.js logging SDK for sending structured logs to Alshival resources (cloud and self-hosted).

**Company:** Alshival.Ai  
**Website:** https://Alshival.Ai

## Install

```bash
npm install @alshival.ai/alshival
```

## Usage

To authenticate, create an API key in your Alshival account.

- Sign in to Alshival.
- Open `Account Settings`.
- In the `API Keys` section, create a key (requires an active DevTools subscription).
- Store the key and resource URL in environment variables.

The SDK reads these environment variables automatically:

- `ALSHIVAL_USERNAME` (optional; forwarded as `x-user-username` when set)
- `ALSHIVAL_RESOURCE` (required for cloud logs; full resource URL, auto-derives resource host/path and resource UUID)
- `ALSHIVAL_API_KEY`
- `ALSHIVAL_CLOUD_LEVEL` (optional, defaults to `INFO`; minimum level forwarded to Alshival Cloud Logs: `DEBUG`, `INFO`, `WARNING`, `ERROR`, `ALERT`, `NONE`)

With those set, you can start logging immediately:

```js
const alshival = require('@alshival.ai/alshival');

alshival.log.info('service started');
```

## Cloud Level vs Local Logging

`ALSHIVAL_CLOUD_LEVEL` (or `configure({ cloudLevel: ... })`) controls what gets forwarded to Alshival Cloud Logs.

Accepted values: `DEBUG`, `INFO`, `WARNING`, `ERROR`, `ALERT`, `NONE`.
Use `NONE` to disable cloud forwarding.

This does not prevent local logging in your app. Keep using your own logger output configuration as usual.

If you want to override values at runtime, call `configure`:

```js
const alshival = require('@alshival.ai/alshival');

alshival.configure({
  username: process.env.ALSHIVAL_USERNAME,
  apiKey: process.env.ALSHIVAL_API_KEY,
  resource: process.env.ALSHIVAL_RESOURCE,
  cloudLevel: 'ERROR', // only forward ERROR+ to Alshival Cloud Logs
});

alshival.log.info('prints locally if your app logger is configured; not sent to cloud');
alshival.log.error('prints locally and sent to cloud');
```

Disable cloud forwarding explicitly:

```env
ALSHIVAL_CLOUD_LEVEL=NONE
```

```js
alshival.configure({ cloudLevel: 'NONE' });
```

## Direct SDK Logging

The logger sends events to your resource endpoint:

- Main site (legacy path): `https://alshival.ai/DevTools/u/<username>/resources/<resource_uuid>/logs/`
- DevTools domain: `https://alshival.dev/u/<username>/resources/<resource_uuid>/logs/`
- Team route: `https://<your-host>/team/<team_name>/resources/<resource_uuid>/logs/`

For shared resources:
- Optionally set `ALSHIVAL_USERNAME` to forward actor identity as `x-user-username`.
- Point `ALSHIVAL_RESOURCE` at the owner's resource URL.
- When `ALSHIVAL_RESOURCE` is set, the SDK derives the endpoint directly from that URL.

You can provide a full resource URL:

```env
ALSHIVAL_RESOURCE=https://alshival.dev/u/alshival/resources/3e2ad894-5e5f-4c34-9899-1f9c2158009c/
```

Or a team-scoped resource URL:

```env
ALSHIVAL_RESOURCE=https://selfhost.example/team/devops/resources/3e2ad894-5e5f-4c34-9899-1f9c2158009c/
```

Equivalent runtime override:

```js
alshival.configure({ resource: 'https://alshival.dev/u/alshival/resources/<resource_uuid>/' });
```

Basic usage:

```js
const alshival = require('@alshival.ai/alshival');

alshival.log.info('service started');
alshival.log.warning('cache miss', { extra: { key: 'user:42' } });
alshival.log.debug('verbose trace');
alshival.log.error('db connection failed');
alshival.log.alert('pager-worthy incident', { extra: { service: 'payments' } });
```

To forward debug events to cloud logs, set `ALSHIVAL_CLOUD_LEVEL=DEBUG`. To forward only alert events, set
`ALSHIVAL_CLOUD_LEVEL=ALERT`.

Attach logs to a specific resource per call:

```js
alshival.log.info('one-off event', { resourceId: '82d7e623-b8ad-4ee6-a047-75bbe587486f' });
```

Exception logging:

```js
try {
  throw new Error('unexpected');
} catch (err) {
  alshival.log.exception('unexpected error', err);
}
```

## Logger Helpers

```js
const alshival = require('@alshival.ai/alshival');

const logger = alshival.getLogger('my-service', { level: 'INFO' });
logger.info('service online');
logger.error('request failed', { extra: { request_id: 'abc123' } });
logger.log(alshival.ALERT_LEVEL, 'high-priority incident detected');
```

Attach cloud forwarding to an existing logger object (for example `console` or a wrapper with `info`/`error` methods):

```js
const appLogger = console;
alshival.attach(appLogger, { cloudLevel: 'DEBUG' });
```

## Notes

- The SDK is fail-safe by design. Network errors never crash your app.
- If `apiKey` or `resource` target is missing, cloud logs are skipped.
- API key can be passed via `ALSHIVAL_API_KEY` or `configure({ apiKey: ... })`.
- TLS verification is enabled by default (`verifySsl: true`).
- `404 invalid_resource` usually means the URL owner path and resource UUID do not match.
