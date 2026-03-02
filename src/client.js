'use strict';

const { URL } = require('node:url');

const ALERT_LEVEL = 45;

const DISABLED_LEVEL_VALUES = new Set(['NONE', 'NULL', 'FALSE', 'OFF', 'DISABLE', 'DISABLED']);
const CLOUD_LEVEL_NAME_TO_NO = {
  ALERT: ALERT_LEVEL,
  ERROR: 40,
  WARNING: 30,
  INFO: 20,
  DEBUG: 10,
};

const LEVEL_NAME_TO_NO = {
  ALERT: ALERT_LEVEL,
  ALERTS: ALERT_LEVEL,
  CRITICAL: 50,
  FATAL: 50,
  ERROR: 40,
  WARNING: 30,
  WARN: 30,
  INFO: 20,
  DEBUG: 10,
  NOTSET: 0,
};

function coerceLevel(level) {
  if (level === null) {
    return null;
  }
  if (typeof level === 'boolean') {
    if (level === false) {
      return null;
    }
    throw new Error('Invalid log level: true');
  }
  if (typeof level === 'number' && Number.isFinite(level)) {
    return Math.trunc(level);
  }
  const name = String(level).trim().toUpperCase();
  if (DISABLED_LEVEL_VALUES.has(name)) {
    return null;
  }
  if (Object.prototype.hasOwnProperty.call(LEVEL_NAME_TO_NO, name)) {
    return LEVEL_NAME_TO_NO[name];
  }
  throw new Error(`Invalid log level: ${JSON.stringify(level)}`);
}

function coerceCloudLevel(level) {
  if (typeof level !== 'string') {
    throw new Error(`Invalid log level: ${JSON.stringify(level)}`);
  }
  const name = String(level).trim().toUpperCase();
  if (name === 'NONE') {
    return null;
  }
  if (Object.prototype.hasOwnProperty.call(CLOUD_LEVEL_NAME_TO_NO, name)) {
    return CLOUD_LEVEL_NAME_TO_NO[name];
  }
  throw new Error(`Invalid log level: ${JSON.stringify(level)}`);
}

function envLevel(name, defaultValue) {
  const value = process.env[name];
  if (value === undefined || String(value).trim() === '') {
    return defaultValue;
  }
  try {
    return coerceLevel(value);
  } catch {
    return defaultValue;
  }
}

function envCloudLevel(name, defaultValue) {
  const value = process.env[name];
  if (value === undefined || String(value).trim() === '') {
    return defaultValue;
  }
  try {
    return coerceCloudLevel(value);
  } catch {
    return defaultValue;
  }
}

function parseResourceReference(resource) {
  if (resource === undefined || resource === null) {
    return null;
  }
  const raw = String(resource).trim();
  if (!raw) {
    return null;
  }

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }

  let segments = parsed.pathname.split('/').filter(Boolean);
  if (segments.length > 0 && String(segments[segments.length - 1]).trim().toLowerCase() === 'logs') {
    segments = segments.slice(0, -1);
  }

  let resourceLogsPrefix = '';
  let resourceId = '';
  for (let index = 0; index < segments.length; index += 1) {
    if (String(segments[index]).trim().toLowerCase() === 'resources' && index + 1 < segments.length) {
      resourceId = decodeURIComponent(segments[index + 1] || '').trim();
      if (!resourceId) {
        return null;
      }
      resourceLogsPrefix = `/${segments.slice(0, index + 1).join('/')}`;
      if (resourceLogsPrefix === '/') {
        resourceLogsPrefix = '';
      }
      break;
    }
  }

  if (!resourceLogsPrefix || !resourceId) {
    return null;
  }

  return {
    resourceBaseUrl: `${parsed.protocol}//${parsed.host}`.replace(/\/$/, ''),
    resourceLogsPrefix,
    resourceId,
  };
}

function buildClientConfigFromEnv() {
  const resourceEnv = parseResourceReference(process.env.ALSHIVAL_RESOURCE || process.env.ALSHIVAL_RESOURCE_URL);
  const defaultCloudLevel = LEVEL_NAME_TO_NO.INFO;

  const resourceBaseUrl = resourceEnv ? resourceEnv.resourceBaseUrl : null;
  const resourceLogsPrefix = resourceEnv ? resourceEnv.resourceLogsPrefix : null;
  const resourceId = resourceEnv ? resourceEnv.resourceId : null;

  return {
    username: process.env.ALSHIVAL_USERNAME || null,
    resourceBaseUrl,
    resourceLogsPrefix,
    apiKey: process.env.ALSHIVAL_API_KEY || null,
    resourceId,
    enabled: true,
    cloudLevel: envCloudLevel('ALSHIVAL_CLOUD_LEVEL', defaultCloudLevel),
    timeoutSeconds: 5,
    verifySsl: true,
  };
}

const _config = buildClientConfigFromEnv();

function configure(options = {}) {
  const username = options.username;
  const resource = options.resource;
  const apiKey = Object.prototype.hasOwnProperty.call(options, 'apiKey') ? options.apiKey : options.api_key;
  const enabled = options.enabled;
  const timeoutSeconds = Object.prototype.hasOwnProperty.call(options, 'timeoutSeconds')
    ? options.timeoutSeconds
    : options.timeout_seconds;
  const verifySsl = Object.prototype.hasOwnProperty.call(options, 'verifySsl') ? options.verifySsl : options.verify_ssl;

  if (resource !== undefined) {
    const parsedResource = parseResourceReference(resource);
    if (parsedResource) {
      _config.resourceBaseUrl = parsedResource.resourceBaseUrl;
      _config.resourceLogsPrefix = parsedResource.resourceLogsPrefix;
      _config.resourceId = parsedResource.resourceId;
    } else {
      _config.resourceBaseUrl = null;
      _config.resourceLogsPrefix = null;
      _config.resourceId = null;
    }
  }

  if (username !== undefined) {
    _config.username = username;
  }
  if (apiKey !== undefined) {
    _config.apiKey = apiKey;
  }
  if (enabled !== undefined) {
    _config.enabled = Boolean(enabled);
  }

  const hasCloudLevel = (
    Object.prototype.hasOwnProperty.call(options, 'cloudLevel')
    || Object.prototype.hasOwnProperty.call(options, 'cloud_level')
  );
  if (hasCloudLevel) {
    const cloudLevelValue = Object.prototype.hasOwnProperty.call(options, 'cloudLevel')
      ? options.cloudLevel
      : options.cloud_level;
    _config.cloudLevel = coerceCloudLevel(cloudLevelValue);
  }

  if (timeoutSeconds !== undefined) {
    _config.timeoutSeconds = Number.isFinite(timeoutSeconds) ? Number(timeoutSeconds) : _config.timeoutSeconds;
  }
  if (verifySsl !== undefined) {
    _config.verifySsl = Boolean(verifySsl);
  }
}

function buildResourceLogsEndpoint(resourceId) {
  const cfg = getConfig();
  const base = String(cfg.resourceBaseUrl || '').trim().replace(/\/$/, '');
  const safeResource = encodeURIComponent(String(resourceId || '').trim());
  const resourceLogsPrefix = String(cfg.resourceLogsPrefix || '').trim();
  if (!base || !resourceLogsPrefix) {
    return '';
  }
  const cleanedPrefix = `/${resourceLogsPrefix.replace(/^\/+|\/+$/g, '')}`;
  return `${base}${cleanedPrefix}/${safeResource}/logs/`;
}

function setEnabled(enabled) {
  _config.enabled = Boolean(enabled);
}

function getConfig() {
  return _config;
}

module.exports = {
  ALERT_LEVEL,
  LEVEL_NAME_TO_NO,
  buildClientConfigFromEnv,
  buildResourceLogsEndpoint,
  coerceLevel,
  coerceCloudLevel,
  configure,
  envLevel,
  getConfig,
  parseResourceReference,
  setEnabled,
};
