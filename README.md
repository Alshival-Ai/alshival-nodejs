# Alshival SDK (Node.js)

Node.js logging SDK for sending structured logs to Alshival DevTools resources.

## Install

```bash
npm install @alshival.ai/alshival
```

## Usage

Create an API key in Alshival (`Account Settings` -> `API Keys`) and set environment variables:

- `ALSHIVAL_USERNAME`
- `ALSHIVAL_RESOURCE` (required for cloud logs; full resource URL, auto-derives owner username, resource UUID, base URL, and path prefix)
- `ALSHIVAL_API_KEY`
- `ALSHIVAL_BASE_URL` (optional, defaults to `https://alshival.dev` when `ALSHIVAL_RESOURCE` is not set)
- `ALSHIVAL_PORTAL_PREFIX` (optional; override DevTools path prefix, for example `""` or `/DevTools`)
- `ALSHIVAL_CLOUD_LEVEL` (optional, defaults to `INFO`; minimum level forwarded to Alshival Cloud Logs)
- `ALSHIVAL_DEBUG` (optional, `true/false`; enables SDK diagnostics and defaults cloud forwarding to `DEBUG` unless `ALSHIVAL_CLOUD_LEVEL` is set)

```js
const alshival = require('@alshival.ai/alshival');

alshival.log.info('service started');
```

## Cloud Level vs Local Logging

`ALSHIVAL_CLOUD_LEVEL` (or `configure({ cloudLevel: ... })`) controls what gets forwarded to Alshival Cloud Logs.

Accepted thresholds: `DEBUG`, `INFO`, `WARNING`, `ERROR`, `CRITICAL`, `ALERT`, `ALERTS`.
Disable cloud forwarding with `false`/`none` (also accepts `off`/`disabled`, case-insensitive).

```js
const alshival = require('@alshival.ai/alshival');

alshival.configure({
  username: process.env.ALSHIVAL_USERNAME,
  apiKey: process.env.ALSHIVAL_API_KEY,
  resource: process.env.ALSHIVAL_RESOURCE,
  cloudLevel: 'ERROR',
});

alshival.log.info('prints locally if your app logger is configured; not sent to cloud');
alshival.log.error('sent to cloud');
```

Disable cloud forwarding explicitly:

```env
ALSHIVAL_CLOUD_LEVEL=false
```

```js
alshival.configure({ cloudLevel: false }); // equivalent: cloudLevel: 'none'
```

To forward only alert events:

```env
ALSHIVAL_CLOUD_LEVEL=ALERTS
```

## Direct SDK Logging

```js
const alshival = require('@alshival.ai/alshival');

alshival.log.info('service started');
alshival.log.warning('cache miss', { extra: { key: 'user:42' } });
alshival.log.debug('verbose trace');
alshival.log.error('db connection failed');
alshival.log.alert('pager-worthy incident', { extra: { service: 'payments' } });
```

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
logger.error('request failed');
logger.log(alshival.ALERT_LEVEL, 'high-priority incident detected');
```

Attach a cloud handler to an existing logger object (for example a wrapper with `info`/`error` methods):

```js
const appLogger = console;
alshival.attach(appLogger, { cloudLevel: 'DEBUG' });
```

## MCP Tool Helpers

The SDK exposes OpenAI Responses-compatible MCP tool specs:

```js
const alshival = require('@alshival.ai/alshival');

const tools = [
  alshival.mcp,
  alshival.mcp.github,
];
```

Or explicit builders:

```js
const alshival = require('@alshival.ai/alshival');

const primary = alshival.mcpTool();
const github = alshival.githubMcpTool();
```

Optional MCP env overrides:

- `ALSHIVAL_MCP_URL` (default: `https://mcp.alshival.ai/mcp/`)
- `ALSHIVAL_GITHUB_MCP_URL` (default: `https://mcp.alshival.ai/github/`)
- `ALSHIVAL_MCP_REQUIRE_APPROVAL` (default: `never`)
- `ALSHIVAL_MCP_API_KEY_HEADER` (default: `x-api-key`)
- `ALSHIVAL_MCP_USERNAME_HEADER` (default: `x-user-username`)

## Notes

- The SDK is fail-safe by design. Network errors never crash your app.
- If `username`, `apiKey`, or `resource` target is missing, cloud logs are skipped.
- TLS verification is enabled by default (`verifySsl: true`).
