'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const alshival = require('../src');

function resetSdkConfig() {
  const cfg = alshival.getConfig();
  cfg.username = null;
  cfg.resourceOwnerUsername = null;
  cfg.apiKey = null;
  cfg.baseUrl = 'https://alshival.ai';
  cfg.portalPrefix = null;
  cfg.resourceId = null;
  cfg.enabled = true;
  cfg.cloudLevel = 20;
  cfg.timeoutSeconds = 5;
  cfg.verifySsl = true;
  cfg.debug = false;
}

async function withTransportCapture(fn) {
  const calls = [];
  alshival._setTransportForTests((request) => {
    calls.push(request);
    return Promise.resolve({ statusCode: 200 });
  });
  try {
    await fn(calls);
  } finally {
    alshival._setTransportForTests();
  }
}

function withEnv(tempEnv, fn) {
  const previous = {};
  for (const key of Object.keys(tempEnv)) {
    previous[key] = process.env[key];
    process.env[key] = tempEnv[key];
  }
  try {
    return fn();
  } finally {
    for (const key of Object.keys(tempEnv)) {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    }
  }
}

test.beforeEach(() => {
  resetSdkConfig();
});

test('cloud level filters only cloud handler', async () => {
  alshival.configure({
    username: 'u',
    apiKey: 'k',
    resource: 'https://alshival.dev/u/u/resources/r/',
    enabled: true,
    cloudLevel: 'ERROR',
  });

  await withTransportCapture(async (calls) => {
    alshival.log.info('hello');
    assert.equal(calls.length, 0);
  });
});

test('debug method forwards when cloud level is DEBUG', async () => {
  alshival.configure({
    username: 'u',
    apiKey: 'k',
    resource: 'https://alshival.dev/u/u/resources/r/',
    enabled: true,
    cloudLevel: 'DEBUG',
  });

  await withTransportCapture(async (calls) => {
    alshival.log.debug('debug event');
    assert.equal(calls.length, 1);
  });
});

test('cloud level disable token skips forwarding', async () => {
  alshival.configure({
    username: 'u',
    apiKey: 'k',
    resource: 'https://alshival.dev/u/u/resources/r/',
    enabled: true,
    cloudLevel: 'NONE',
  });

  await withTransportCapture(async (calls) => {
    alshival.log.error('cloud forwarding disabled');
    assert.equal(calls.length, 0);
  });
});

test('configure supports snake_case cloud_level disable token', async () => {
  alshival.configure({
    username: 'u',
    api_key: 'k',
    resource: 'https://alshival.dev/u/u/resources/r/',
    enabled: true,
    cloud_level: 'NONE',
  });

  await withTransportCapture(async (calls) => {
    alshival.log.error('cloud forwarding disabled');
    assert.equal(calls.length, 0);
  });
});

test('env cloud level NONE token parses as disabled', () => {
  const cfgNone = withEnv({ ALSHIVAL_CLOUD_LEVEL: 'NONE' }, () => alshival.buildClientConfigFromEnv());
  assert.equal(cfgNone.cloudLevel, null);
});

test('env cloud level invalid value falls back to default', () => {
  const cfgInvalid = withEnv({ ALSHIVAL_CLOUD_LEVEL: 'false' }, () => alshival.buildClientConfigFromEnv());
  assert.equal(cfgInvalid.cloudLevel, 20);
});

test('alert level and tag supported', async () => {
  alshival.configure({
    username: 'u',
    apiKey: 'k',
    resource: 'https://alshival.dev/u/u/resources/r/',
    enabled: true,
    cloudLevel: 'ALERT',
  });

  await withTransportCapture(async (calls) => {
    alshival.log.error('below alert threshold');
    assert.equal(calls.length, 0);

    alshival.log.alert('urgent incident');
    assert.equal(calls.length, 1);
    const payload = calls[0].payload || {};
    const logs = payload.logs || [];
    assert.equal(logs.length > 0, true);
    assert.equal(String(logs[0].level || ''), 'alert');
  });
});

test('configure cloudLevel rejects non-string values', () => {
  assert.throws(
    () => alshival.configure({ cloudLevel: false }),
    /Invalid log level/,
  );
});

test('shared resource uses owner path with actor headers', async () => {
  alshival.configure({
    username: 'viewer-user',
    apiKey: 'k',
    resource: 'https://alshival.dev/u/owner-user/resources/r/',
    enabled: true,
    cloudLevel: 'INFO',
  });

  await withTransportCapture(async (calls) => {
    alshival.log.info('shared write');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url.includes('/u/owner-user/resources/r/logs/'), true);
    assert.equal(calls[0].headers['x-api-key'], 'k');
    assert.equal(calls[0].headers['x-user-username'], 'viewer-user');
    assert.equal(Object.prototype.hasOwnProperty.call(calls[0].headers, 'x-user-email'), false);
  });
});

test('cloud send requires username identity', async () => {
  alshival.configure({
    username: '',
    apiKey: 'k',
    resource: 'https://alshival.dev/u/owner-user/resources/r/',
    enabled: true,
    cloudLevel: 'INFO',
  });

  await withTransportCapture(async (calls) => {
    alshival.log.info('shared write without username');
    assert.equal(calls.length, 0);
  });
});
