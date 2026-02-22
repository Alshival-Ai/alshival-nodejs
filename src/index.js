'use strict';

const {
  ALERT_LEVEL,
  buildClientConfigFromEnv,
  buildResourceLogsEndpoint,
  coerceLevel,
  configure,
  getConfig,
  parseResourceReference,
  setEnabled,
} = require('./client');

const {
  log,
  setTransportForTests,
} = require('./logger');

const {
  githubMcpTool,
  mcp,
  mcpTool,
} = require('./mcp-tools');

function getLogger(name, options) {
  return log.getLogger(name, options);
}

function handler(options) {
  return log.handler(options);
}

function attach(logger, options) {
  return log.attach(logger, options);
}

module.exports = {
  ALERT_LEVEL,
  attach,
  buildClientConfigFromEnv,
  buildResourceLogsEndpoint,
  coerceLevel,
  configure,
  getConfig,
  getLogger,
  githubMcpTool,
  handler,
  log,
  mcp,
  mcp_tool: mcpTool,
  mcpTool,
  parseResourceReference,
  setEnabled,
  github_mcp_tool: githubMcpTool,
  _setTransportForTests: setTransportForTests,
};
