'use strict';

const fs = require('node:fs');
const http = require('node:http');
const https = require('node:https');
const path = require('node:path');
const { format } = require('node:util');
const { URL } = require('node:url');

const {
  ALERT_LEVEL,
  LEVEL_NAME_TO_NO,
  buildResourceLogsEndpoint,
  coerceLevel,
  getConfig,
} = require('./client');

const LEVEL_NO_TO_NAME = {
  0: 'NOTSET',
  10: 'DEBUG',
  20: 'INFO',
  30: 'WARNING',
  40: 'ERROR',
  45: 'ALERT',
  50: 'CRITICAL',
};

const ATTACH_STATE = Symbol('alshivalAttachState');

function safeValue(value) {
  if (
    value === null
    || value === undefined
    || typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean'
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => safeValue(item));
  }
  if (typeof value === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      out[String(key)] = safeValue(item);
    }
    return out;
  }
  return String(value);
}

function sdkVersion() {
  try {
    const packageJsonPath = path.join(__dirname, '..', 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    return String(packageJson.version || 'unknown');
  } catch {
    return 'unknown';
  }
}

function debug(msg) {
  const cfg = getConfig();
  if (!cfg.debug) {
    return;
  }
  try {
    process.stderr.write(`[alshival] ${msg}\n`);
  } catch {
    // Fail-safe diagnostics only.
  }
}

function normalizedLevelNo(level) {
  const resolved = coerceLevel(level);
  if (resolved === null) {
    return null;
  }
  return Number(resolved);
}

function levelNameFromNo(levelNo) {
  if (Object.prototype.hasOwnProperty.call(LEVEL_NO_TO_NAME, levelNo)) {
    return LEVEL_NO_TO_NAME[levelNo];
  }
  if (levelNo >= LEVEL_NAME_TO_NO.CRITICAL) {
    return 'CRITICAL';
  }
  if (levelNo >= ALERT_LEVEL) {
    return 'ALERT';
  }
  if (levelNo >= LEVEL_NAME_TO_NO.ERROR) {
    return 'ERROR';
  }
  if (levelNo >= LEVEL_NAME_TO_NO.WARNING) {
    return 'WARNING';
  }
  if (levelNo >= LEVEL_NAME_TO_NO.INFO) {
    return 'INFO';
  }
  if (levelNo >= LEVEL_NAME_TO_NO.DEBUG) {
    return 'DEBUG';
  }
  return 'NOTSET';
}

function postJson({
  url,
  payload,
  headers,
  timeoutSeconds,
  verifySsl,
}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const body = JSON.stringify(payload);
    const isHttps = parsed.protocol === 'https:';
    const client = isHttps ? https : http;

    const req = client.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || undefined,
        path: `${parsed.pathname}${parsed.search}`,
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(body),
          ...headers,
        },
        timeout: Math.max(1, Number(timeoutSeconds || 5)) * 1000,
        rejectUnauthorized: verifySsl !== false,
      },
      (res) => {
        res.on('data', () => {
          // Drain stream for keep-alive friendliness.
        });
        res.on('end', () => {
          resolve({ statusCode: Number(res.statusCode || 0) });
        });
      },
    );

    req.on('timeout', () => {
      req.destroy(new Error('Request timeout'));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

let transport = postJson;

function setTransportForTests(fn) {
  transport = typeof fn === 'function' ? fn : postJson;
}

class CloudLogHandler {
  constructor({
    resourceId = null,
    cloudLevel = null,
  } = {}) {
    this.resourceId = resourceId;
    this.cloudLevel = cloudLevel;
    this._inEmit = false;
  }

  resourceEndpoint(username, resourceId) {
    return buildResourceLogsEndpoint(username, resourceId);
  }

  shouldForward(record) {
    const cfg = getConfig();
    if (!cfg.enabled) {
      return false;
    }
    if (cfg.cloudLevel === null) {
      return false;
    }
    const minLevel = this.cloudLevel !== null ? this.cloudLevel : cfg.cloudLevel;
    if (record.levelno < minLevel) {
      return false;
    }
    if (!cfg.apiKey) {
      return false;
    }
    if (!cfg.username) {
      return false;
    }
    return true;
  }

  resolvedResourceId(record) {
    const cfg = getConfig();
    const candidates = [
      this.resourceId,
      record.alshival_resource_id,
      cfg.resourceId,
    ];
    for (const value of candidates) {
      if (value && String(value).trim()) {
        return String(value).trim();
      }
    }
    return '';
  }

  emit(record) {
    if (this._inEmit) {
      return;
    }

    this._inEmit = true;

    try {
      if (!this.shouldForward(record)) {
        return;
      }

      const cfg = getConfig();
      const resolvedResource = this.resolvedResourceId(record);
      if (!resolvedResource) {
        debug('skipping cloud log: missing resource target (set ALSHIVAL_RESOURCE or pass resourceId)');
        return;
      }

      const payload = {
        resource_id: resolvedResource,
        sdk: 'alshival-nodejs',
        sdk_version: sdkVersion(),
        logs: [
          {
            level: String(record.levelname || 'INFO').toLowerCase(),
            message: String(record.message || ''),
            logger: String(record.name || 'alshival'),
            ts: new Date().toISOString(),
            extra: {
              logger: String(record.name || 'alshival'),
              module: record.module || null,
              function: record.function || null,
              line: record.line || null,
              path: record.path || null,
              extra: safeValue(record.extra || {}),
              stack_info: record.stack_info || null,
              exception: record.exception || null,
            },
          },
        ],
      };

      const resourceOwner = String(cfg.resourceOwnerUsername || cfg.username || '').trim();
      const endpoint = this.resourceEndpoint(resourceOwner, resolvedResource);

      const headers = {
        'x-api-key': cfg.apiKey || '',
      };
      if (cfg.username) {
        headers['x-user-username'] = cfg.username;
      }

      Promise.resolve(
        transport({
          url: endpoint,
          payload,
          headers,
          timeoutSeconds: cfg.timeoutSeconds,
          verifySsl: cfg.verifySsl,
        }),
      )
        .then((resp) => {
          if (cfg.debug && Number(resp && resp.statusCode) >= 400) {
            debug(`cloud log post failed: status=${resp.statusCode}`);
          }
        })
        .catch((err) => {
          debug(`cloud log post failed: ${err && err.message ? err.message : String(err)}`);
        });
    } catch (err) {
      debug(`cloud log emit failed: ${err && err.message ? err.message : String(err)}`);
    } finally {
      this._inEmit = false;
    }
  }
}

class AlshivalLogger {
  constructor(name = 'alshival', {
    minLevel = LEVEL_NAME_TO_NO.DEBUG,
    cloudLevel = null,
    resourceId = null,
    localLogger = null,
  } = {}) {
    this._loggerName = String(name || 'alshival');
    this._minLevel = Number(minLevel);
    this._localLogger = localLogger;
    this.handlers = [];
    dedupeAddHandler(this, new CloudLogHandler({ resourceId, cloudLevel }));
  }

  details() {
    const cfg = getConfig();
    return {
      username: cfg.username,
      api_key: cfg.apiKey ? 'set' : 'unset',
      base_url: cfg.baseUrl,
      resource_id: cfg.resourceId,
      enabled: cfg.enabled,
      cloud_level: cfg.cloudLevel,
      timeout_seconds: cfg.timeoutSeconds,
      verify_ssl: cfg.verifySsl,
      debug: cfg.debug,
    };
  }

  buildRecord(levelNo, levelName, msg, args, options = {}) {
    const message = typeof msg === 'string' ? format(msg, ...args) : [msg, ...args].map((item) => String(item)).join(' ');
    const record = {
      name: this._loggerName,
      levelno: Number(levelNo),
      levelname: String(levelName),
      message,
      module: this._loggerName,
      function: null,
      line: null,
      path: null,
      extra: options.extra || {},
      stack_info: options.stackInfo || null,
      exception: options.error ? String(options.error.stack || options.error) : null,
    };

    if (options.resourceId) {
      record.alshival_resource_id = options.resourceId;
    }

    return record;
  }

  parseArgs(rawArgs) {
    const args = [...rawArgs];
    let options = {};
    if (args.length > 0) {
      const maybeOptions = args[args.length - 1];
      if (
        maybeOptions
        && typeof maybeOptions === 'object'
        && !Array.isArray(maybeOptions)
        && (
          Object.prototype.hasOwnProperty.call(maybeOptions, 'resourceId')
          || Object.prototype.hasOwnProperty.call(maybeOptions, 'extra')
          || Object.prototype.hasOwnProperty.call(maybeOptions, 'error')
          || Object.prototype.hasOwnProperty.call(maybeOptions, 'stackInfo')
        )
      ) {
        options = args.pop();
      }
    }
    return { args, options };
  }

  emit(record) {
    if (record.levelno < this._minLevel) {
      return;
    }

    if (this._localLogger) {
      const method = record.levelno >= LEVEL_NAME_TO_NO.ERROR ? 'error' : (record.levelno >= LEVEL_NAME_TO_NO.WARNING ? 'warn' : 'info');
      try {
        if (typeof this._localLogger[method] === 'function') {
          this._localLogger[method](record.message, record.extra);
        }
      } catch {
        // Never fail logger flow due to local logger errors.
      }
    }

    for (const currentHandler of this.handlers) {
      currentHandler.emit(record);
    }
  }

  log(level, msg, ...rawArgs) {
    const { args, options } = this.parseArgs(rawArgs);
    const levelNo = normalizedLevelNo(level);
    if (levelNo === null) {
      return;
    }
    const levelName = levelNameFromNo(levelNo);
    this.emit(this.buildRecord(levelNo, levelName, msg, args, options));
  }

  debug(msg, ...rawArgs) {
    const { args, options } = this.parseArgs(rawArgs);
    this.emit(this.buildRecord(LEVEL_NAME_TO_NO.DEBUG, 'DEBUG', msg, args, options));
  }

  info(msg, ...rawArgs) {
    const { args, options } = this.parseArgs(rawArgs);
    this.emit(this.buildRecord(LEVEL_NAME_TO_NO.INFO, 'INFO', msg, args, options));
  }

  warning(msg, ...rawArgs) {
    const { args, options } = this.parseArgs(rawArgs);
    this.emit(this.buildRecord(LEVEL_NAME_TO_NO.WARNING, 'WARNING', msg, args, options));
  }

  warn(msg, ...rawArgs) {
    this.warning(msg, ...rawArgs);
  }

  error(msg, ...rawArgs) {
    const { args, options } = this.parseArgs(rawArgs);
    this.emit(this.buildRecord(LEVEL_NAME_TO_NO.ERROR, 'ERROR', msg, args, options));
  }

  critical(msg, ...rawArgs) {
    const { args, options } = this.parseArgs(rawArgs);
    this.emit(this.buildRecord(LEVEL_NAME_TO_NO.CRITICAL, 'CRITICAL', msg, args, options));
  }

  alert(msg, ...rawArgs) {
    const { args, options } = this.parseArgs(rawArgs);
    this.emit(this.buildRecord(ALERT_LEVEL, 'ALERT', msg, args, options));
  }

  exception(msg, errorOrOptions, maybeOptions) {
    let error = null;
    let options = {};

    if (errorOrOptions instanceof Error) {
      error = errorOrOptions;
      options = maybeOptions && typeof maybeOptions === 'object' ? maybeOptions : {};
    } else if (errorOrOptions && typeof errorOrOptions === 'object') {
      options = errorOrOptions;
      if (options.error instanceof Error) {
        error = options.error;
      }
    }

    if (!error) {
      error = new Error(String(msg));
    }

    this.error(msg, {
      ...options,
      error,
    });
  }

  handler({
    level,
    cloudLevel,
    resourceId = null,
  } = {}) {
    const resolved = cloudLevel !== undefined ? cloudLevel : level;
    const normalizedCloudLevel = resolved === undefined ? null : normalizedLevelNo(resolved);
    return new CloudLogHandler({ resourceId, cloudLevel: normalizedCloudLevel });
  }

  getLogger(name, {
    level = LEVEL_NAME_TO_NO.INFO,
    cloudLevel,
    resourceId = null,
    localLogger = null,
  } = {}) {
    const minLevel = normalizedLevelNo(level);
    const resolvedMinLevel = minLevel === null ? LEVEL_NAME_TO_NO.INFO : minLevel;
    const resolvedCloud = cloudLevel !== undefined
      ? normalizedLevelNo(cloudLevel)
      : resolvedMinLevel;
    return new AlshivalLogger(name, {
      minLevel: resolvedMinLevel,
      cloudLevel: resolvedCloud,
      resourceId,
      localLogger,
    });
  }

  attach(target, {
    level,
    cloudLevel,
    resourceId = null,
  } = {}) {
    const resolved = cloudLevel !== undefined ? cloudLevel : level;
    const normalizedCloudLevel = resolved === undefined ? null : normalizedLevelNo(resolved);
    const handler = new CloudLogHandler({ resourceId, cloudLevel: normalizedCloudLevel });

    if (target instanceof AlshivalLogger) {
      return dedupeAddHandler(target, handler);
    }

    if (!target || typeof target !== 'object') {
      throw new TypeError('attach(...) expects a logger object or AlshivalLogger');
    }

    const state = target[ATTACH_STATE] || {
      handlers: [],
      patched: false,
      original: {},
    };

    if (!state.patched) {
      patchExternalLogger(target, state);
      state.patched = true;
    }

    target[ATTACH_STATE] = state;
    return dedupeAddHandler(state, handler);
  }
}

function dedupeAddHandler(target, handler) {
  if (!target.handlers) {
    target.handlers = [];
  }

  for (const existing of target.handlers) {
    if (existing instanceof CloudLogHandler && existing.resourceId === handler.resourceId) {
      if (handler.cloudLevel !== null) {
        existing.cloudLevel = handler.cloudLevel;
      }
      return existing;
    }
  }

  target.handlers.push(handler);
  return handler;
}

function patchExternalLogger(logger, state) {
  const methods = ['debug', 'info', 'warn', 'warning', 'error', 'critical', 'log'];

  for (const method of methods) {
    if (typeof logger[method] !== 'function') {
      continue;
    }
    state.original[method] = logger[method];
    logger[method] = function wrappedLoggerMethod(...args) {
      let result;
      try {
        result = state.original[method].apply(this, args);
      } finally {
        try {
          const record = buildExternalRecord(logger, method, args);
          if (record) {
            for (const currentHandler of state.handlers) {
              currentHandler.emit(record);
            }
          }
        } catch {
          // Fail-safe instrumentation.
        }
      }
      return result;
    };
  }
}

function buildExternalRecord(logger, method, args) {
  let levelNo;
  let msg;
  let rest;

  if (method === 'log') {
    if (args.length === 0) {
      return null;
    }
    const maybeLevel = args[0];
    if (typeof maybeLevel === 'number' || typeof maybeLevel === 'string' || typeof maybeLevel === 'boolean') {
      const coerced = normalizedLevelNo(maybeLevel);
      if (coerced === null) {
        return null;
      }
      levelNo = coerced;
      msg = args.length > 1 ? args[1] : '';
      rest = args.slice(2);
    } else {
      levelNo = LEVEL_NAME_TO_NO.INFO;
      msg = args[0];
      rest = args.slice(1);
    }
  } else {
    const methodToLevel = {
      debug: LEVEL_NAME_TO_NO.DEBUG,
      info: LEVEL_NAME_TO_NO.INFO,
      warn: LEVEL_NAME_TO_NO.WARNING,
      warning: LEVEL_NAME_TO_NO.WARNING,
      error: LEVEL_NAME_TO_NO.ERROR,
      critical: LEVEL_NAME_TO_NO.CRITICAL,
    };
    levelNo = methodToLevel[method] || LEVEL_NAME_TO_NO.INFO;
    msg = args[0];
    rest = args.slice(1);
  }

  const message = typeof msg === 'string' ? format(msg, ...rest) : [msg, ...rest].map((item) => String(item)).join(' ');

  return {
    name: String(logger.name || logger.constructor.name || 'logger'),
    levelno: Number(levelNo),
    levelname: levelNameFromNo(levelNo),
    message,
    module: null,
    function: null,
    line: null,
    path: null,
    extra: {},
    stack_info: null,
    exception: null,
  };
}

function refreshDebugConsoleHandler() {
  // Compatibility no-op for the Node SDK.
}

const log = new AlshivalLogger('alshival');

module.exports = {
  AlshivalLogger,
  CloudLogHandler,
  log,
  refreshDebugConsoleHandler,
  setTransportForTests,
};
