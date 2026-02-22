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

test('resource endpoint legacy host uses devtools prefix', () => {
  alshival.configure({ baseUrl: 'https://alshival.ai', portalPrefix: null });
  const endpoint = alshival.buildResourceLogsEndpoint('sam', 'abc-123');
  assert.equal(endpoint, 'https://alshival.ai/DevTools/u/sam/resources/abc-123/logs/');
});

test('resource endpoint devtools domain uses root paths', () => {
  alshival.configure({ baseUrl: 'https://alshival.dev', portalPrefix: null });
  const endpoint = alshival.buildResourceLogsEndpoint('sam', 'abc-123');
  assert.equal(endpoint, 'https://alshival.dev/u/sam/resources/abc-123/logs/');
});

test('resource endpoint respects explicit prefix override', () => {
  alshival.configure({ baseUrl: 'https://alshival.ai', portalPrefix: '' });
  const endpoint = alshival.buildResourceLogsEndpoint('sam', 'abc-123');
  assert.equal(endpoint, 'https://alshival.ai/u/sam/resources/abc-123/logs/');
});

test('configure resource url parses owner uuid and prefix', () => {
  alshival.configure({
    resource: 'https://alshival.ai/DevTools/u/alshival/resources/3e2ad894-5e5f-4c34-9899-1f9c2158009c/',
  });
  const cfg = alshival.getConfig();
  assert.equal(cfg.baseUrl, 'https://alshival.ai');
  assert.equal(cfg.portalPrefix, '/DevTools');
  assert.equal(cfg.resourceOwnerUsername, 'alshival');
  assert.equal(cfg.resourceId, '3e2ad894-5e5f-4c34-9899-1f9c2158009c');
});

test('configure resource url accepts logs suffix', () => {
  alshival.configure({
    resource: 'https://alshival.dev/u/alshival/resources/3e2ad894-5e5f-4c34-9899-1f9c2158009c/logs/',
  });
  const cfg = alshival.getConfig();
  assert.equal(cfg.baseUrl, 'https://alshival.dev');
  assert.equal(cfg.portalPrefix, '');
  assert.equal(cfg.resourceOwnerUsername, 'alshival');
  assert.equal(cfg.resourceId, '3e2ad894-5e5f-4c34-9899-1f9c2158009c');
});

test('env resource url wins over conflicting base url', () => {
  const cfg = withEnv(
    {
      ALSHIVAL_BASE_URL: 'https://alshival.ai',
      ALSHIVAL_RESOURCE: 'https://alshival.dev/u/owner-user/resources/r-123/',
    },
    () => alshival.buildClientConfigFromEnv(),
  );

  assert.equal(cfg.baseUrl, 'https://alshival.dev');
  assert.equal(cfg.portalPrefix, '');
  assert.equal(cfg.resourceOwnerUsername, 'owner-user');
  assert.equal(cfg.resourceId, 'r-123');
});

test('mcp tool helpers available', () => {
  alshival.configure({ username: 'sam', apiKey: 'secret-key' });
  assert.equal(alshival.mcp.type, 'mcp');
  assert.equal(alshival.mcp.server_label, 'alshival-mcp');
  assert.equal(alshival.mcp.headers['x-api-key'], 'secret-key');
  assert.equal(alshival.mcp.headers['x-user-username'], 'sam');
  assert.equal(Object.prototype.hasOwnProperty.call(alshival.mcp.headers, 'x-user-email'), false);
  assert.equal(alshival.mcp.github.server_label, 'github-mcp');
  assert.equal(Object.prototype.hasOwnProperty.call(alshival.mcp.github, 'server_url'), true);
});

test('mcp headers with missing username omit user header', () => {
  alshival.configure({ username: '', apiKey: 'secret-key' });
  const headers = alshival.mcpTool().headers;
  assert.equal(headers['x-api-key'], 'secret-key');
  assert.equal(Object.prototype.hasOwnProperty.call(headers, 'x-user-username'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(headers, 'x-user-email'), false);
});

test('python-style mcp aliases are exported', () => {
  const primary = alshival.mcp_tool();
  const github = alshival.github_mcp_tool();
  assert.equal(primary.server_label, 'alshival-mcp');
  assert.equal(github.server_label, 'github-mcp');
});
