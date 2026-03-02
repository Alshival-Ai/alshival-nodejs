'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const alshival = require('../src');

function resetSdkConfig() {
  const cfg = alshival.getConfig();
  cfg.username = null;
  cfg.resourceBaseUrl = null;
  cfg.resourceLogsPrefix = null;
  cfg.apiKey = null;
  cfg.resourceId = null;
  cfg.enabled = true;
  cfg.cloudLevel = 20;
  cfg.timeoutSeconds = 5;
  cfg.verifySsl = true;
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

test('configure resource url parses user route', () => {
  alshival.configure({ resource: 'https://alshival.ai/DevTools/u/alshival/resources/abc-123/' });
  const cfg = alshival.getConfig();
  assert.equal(cfg.resourceBaseUrl, 'https://alshival.ai');
  assert.equal(cfg.resourceLogsPrefix, '/DevTools/u/alshival/resources');
  assert.equal(cfg.resourceId, 'abc-123');
});

test('configure resource url accepts logs suffix', () => {
  alshival.configure({ resource: 'https://alshival.dev/u/alshival/resources/r-123/logs/' });
  const cfg = alshival.getConfig();
  assert.equal(cfg.resourceBaseUrl, 'https://alshival.dev');
  assert.equal(cfg.resourceLogsPrefix, '/u/alshival/resources');
  assert.equal(cfg.resourceId, 'r-123');
});

test('configure resource url parses team route', () => {
  alshival.configure({ resource: 'https://selfhost.example/team/devops/resources/r-123/' });
  const cfg = alshival.getConfig();
  assert.equal(cfg.resourceBaseUrl, 'https://selfhost.example');
  assert.equal(cfg.resourceLogsPrefix, '/team/devops/resources');
  assert.equal(cfg.resourceId, 'r-123');
});

test('resource endpoint prefers parsed resource prefix', () => {
  alshival.configure({ resource: 'https://dev.alshival.dev/team/Starwood/resources/5176/' });
  const endpoint = alshival.buildResourceLogsEndpoint('override-r');
  assert.equal(endpoint, 'https://dev.alshival.dev/team/Starwood/resources/override-r/logs/');
});

test('resource endpoint empty without resource context', () => {
  const endpoint = alshival.buildResourceLogsEndpoint('r-123');
  assert.equal(endpoint, '');
});

test('env resource url wins and base url env ignored', () => {
  const cfg = withEnv(
    {
      ALSHIVAL_BASE_URL: 'https://ignored.example',
      ALSHIVAL_RESOURCE: 'https://alshival.dev/u/owner-user/resources/r-123/',
    },
    () => alshival.buildClientConfigFromEnv(),
  );

  assert.equal(cfg.resourceBaseUrl, 'https://alshival.dev');
  assert.equal(cfg.resourceLogsPrefix, '/u/owner-user/resources');
  assert.equal(cfg.resourceId, 'r-123');
});
