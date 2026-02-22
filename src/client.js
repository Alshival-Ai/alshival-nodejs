'use strict';

const { URL } = require('node:url');

const ALERT_LEVEL = 45;

const DEFAULT_BASE_URL = 'https://alshival.dev';
const TRUE_ENV_VALUES = new Set(['1', 'true', 't', 'yes', 'y', 'on']);
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

function envBool(name, defaultValue = false) {
  const value = process.env[name];
  if (value === undefined) {
    return defaultValue;
  }
  return TRUE_ENV_VALUES.has(String(value).trim().toLowerCase());
}

function normalizePortalPrefix(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const raw = String(value).trim();
  if (!raw) {
    return '';
  }
  const cleaned = `/${raw.replace(/^\/+|\/+$/g, '')}`;
  return cleaned === '/' ? '' : cleaned;
}

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
  if (segments.length > 0 && segments[segments.length - 1].toLowerCase() === 'logs') {
    segments = segments.slice(0, -1);
  }

  let owner = '';
  let resourceId = '';
  let prefixSegments = [];

  for (let index = 0; index <= segments.length - 4; index += 1) {
    if (segments[index] === 'u' && segments[index + 2] === 'resources') {
      owner = decodeURIComponent(segments[index + 1] || '').trim();
      resourceId = decodeURIComponent(segments[index + 3] || '').trim();
      prefixSegments = segments.slice(0, index);
      break;
    }
  }

  if (!owner || !resourceId) {
    return null;
  }

  let portalPrefix = prefixSegments.length ? `/${prefixSegments.join('/')}` : '';
  if (portalPrefix === '/') {
    portalPrefix = '';
  }

  return {
    baseUrl: `${parsed.protocol}//${parsed.host}`.replace(/\/$/, ''),
    portalPrefix,
    resourceOwnerUsername: owner,
    resourceId,
  };
}

function buildClientConfigFromEnv() {
  const resourceEnv = parseResourceReference(process.env.ALSHIVAL_RESOURCE || process.env.ALSHIVAL_RESOURCE_URL);
  const debugEnv = envBool('ALSHIVAL_DEBUG', false);
  const defaultCloudLevel = debugEnv ? LEVEL_NAME_TO_NO.DEBUG : LEVEL_NAME_TO_NO.INFO;

  const baseUrl = resourceEnv ? resourceEnv.baseUrl : (process.env.ALSHIVAL_BASE_URL || DEFAULT_BASE_URL);
  const portalPrefix = resourceEnv ? resourceEnv.portalPrefix : normalizePortalPrefix(process.env.ALSHIVAL_PORTAL_PREFIX);

  return {
    username: process.env.ALSHIVAL_USERNAME || null,
    resourceOwnerUsername: resourceEnv ? resourceEnv.resourceOwnerUsername : null,
    apiKey: process.env.ALSHIVAL_API_KEY || null,
    baseUrl: String(baseUrl).replace(/\/$/, ''),
    portalPrefix,
    resourceId: resourceEnv ? resourceEnv.resourceId : null,
    enabled: true,
    cloudLevel: envCloudLevel('ALSHIVAL_CLOUD_LEVEL', defaultCloudLevel),
    timeoutSeconds: 5,
    verifySsl: true,
    debug: debugEnv,
  };
}

const _config = buildClientConfigFromEnv();

function configure(options = {}) {
  const username = options.username;
  const resource = options.resource;
  const apiKey = Object.prototype.hasOwnProperty.call(options, 'apiKey') ? options.apiKey : options.api_key;
  const baseUrl = Object.prototype.hasOwnProperty.call(options, 'baseUrl') ? options.baseUrl : options.base_url;
  const portalPrefix = Object.prototype.hasOwnProperty.call(options, 'portalPrefix')
    ? options.portalPrefix
    : options.portal_prefix;
  const enabled = options.enabled;
  const timeoutSeconds = Object.prototype.hasOwnProperty.call(options, 'timeoutSeconds')
    ? options.timeoutSeconds
    : options.timeout_seconds;
  const verifySsl = Object.prototype.hasOwnProperty.call(options, 'verifySsl') ? options.verifySsl : options.verify_ssl;
  const debug = options.debug;

  if (resource !== undefined) {
    const parsedResource = parseResourceReference(resource);
    if (parsedResource) {
      if (baseUrl === undefined) {
        _config.baseUrl = parsedResource.baseUrl;
      }
      if (portalPrefix === undefined) {
        _config.portalPrefix = parsedResource.portalPrefix;
      }
      _config.resourceOwnerUsername = parsedResource.resourceOwnerUsername;
      _config.resourceId = parsedResource.resourceId;
    } else {
      _config.resourceOwnerUsername = null;
      _config.resourceId = null;
    }
  }

  if (username !== undefined) {
    _config.username = username;
  }
  if (apiKey !== undefined) {
    _config.apiKey = apiKey;
  }
  if (baseUrl !== undefined) {
    _config.baseUrl = String(baseUrl).replace(/\/$/, '');
  }
  if (portalPrefix !== undefined) {
    _config.portalPrefix = normalizePortalPrefix(portalPrefix);
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
  } else if (debug === true && _config.cloudLevel !== null) {
    // In SDK debug mode, prefer forwarding debug-level events unless caller explicitly sets cloudLevel.
    _config.cloudLevel = LEVEL_NAME_TO_NO.DEBUG;
  }

  if (timeoutSeconds !== undefined) {
    _config.timeoutSeconds = Number.isFinite(timeoutSeconds) ? Number(timeoutSeconds) : _config.timeoutSeconds;
  }
  if (verifySsl !== undefined) {
    _config.verifySsl = Boolean(verifySsl);
  }
  if (debug !== undefined) {
    _config.debug = Boolean(debug);
  }

  try {
    const { refreshDebugConsoleHandler } = require('./logger');
    refreshDebugConsoleHandler();
  } catch {
    // Fail-safe: configuration should never raise due to optional helpers.
  }

  try {
    const { refreshMcp } = require('./mcp-tools');
    refreshMcp();
  } catch {
    // Fail-safe: configuration should never raise due to optional helpers.
  }
}

function resolvedPortalPrefix() {
  const cfg = getConfig();
  if (cfg.portalPrefix !== null && cfg.portalPrefix !== undefined) {
    return cfg.portalPrefix;
  }

  try {
    const parsed = new URL(cfg.baseUrl);
    const pathPrefix = normalizePortalPrefix(parsed.pathname);
    if (pathPrefix) {
      return pathPrefix;
    }

    const host = (parsed.hostname || '').trim().toLowerCase();
    if (host === 'alshival.ai' || host === 'www.alshival.ai') {
      return '/DevTools';
    }
    return '';
  } catch {
    return '';
  }
}

function buildResourceLogsEndpoint(username, resourceId) {
  const cfg = getConfig();

  let base;
  try {
    const parsed = new URL(cfg.baseUrl || DEFAULT_BASE_URL);
    base = `${parsed.protocol}//${parsed.host}`;
  } catch {
    base = DEFAULT_BASE_URL;
  }

  const portalPrefix = resolvedPortalPrefix();
  const safeUser = encodeURIComponent(String(username || '').trim());
  const safeResource = encodeURIComponent(String(resourceId || '').trim());
  return `${base}${portalPrefix}/u/${safeUser}/resources/${safeResource}/logs/`;
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
  envBool,
  envLevel,
  getConfig,
  normalizePortalPrefix,
  parseResourceReference,
  resolvedPortalPrefix,
  setEnabled,
};
