'use strict';

const { getConfig } = require('./client');

const DEFAULT_MCP_URL = 'https://mcp.alshival.ai/mcp/';
const DEFAULT_GITHUB_MCP_URL = 'https://mcp.alshival.ai/github/';

function clean(value) {
  return String(value || '').trim();
}

function pick(...values) {
  for (const value of values) {
    const cleaned = clean(value);
    if (cleaned) {
      return cleaned;
    }
  }
  return '';
}

function resolvedIdentity({
  apiKey,
  username,
} = {}) {
  const cfg = getConfig();
  const resolvedApiKey = pick(apiKey, cfg.apiKey, process.env.ALSHIVAL_API_KEY);
  const resolvedUsername = pick(username, cfg.username, process.env.ALSHIVAL_USERNAME);
  return { resolvedApiKey, resolvedUsername };
}

function resolvedRequireApproval(value) {
  return pick(value, process.env.ALSHIVAL_MCP_REQUIRE_APPROVAL, 'never');
}

function buildHeaders({
  apiKey,
  username,
  includeAccept = true,
} = {}) {
  const headers = {};
  const apiKeyHeader = pick(process.env.ALSHIVAL_MCP_API_KEY_HEADER, 'x-api-key');
  const usernameHeader = pick(process.env.ALSHIVAL_MCP_USERNAME_HEADER, 'x-user-username');

  if (apiKey) {
    headers[apiKeyHeader] = apiKey;
  }
  if (username) {
    headers[usernameHeader] = username;
  }
  if (includeAccept) {
    headers.accept = 'application/json, text/event-stream';
  }
  return headers;
}

function buildTool({
  serverLabel,
  serverUrl,
  apiKey,
  username,
  requireApproval,
}) {
  const { resolvedApiKey, resolvedUsername } = resolvedIdentity({ apiKey, username });
  return {
    type: 'mcp',
    server_label: serverLabel,
    server_url: clean(serverUrl),
    require_approval: resolvedRequireApproval(requireApproval),
    headers: buildHeaders({
      apiKey: resolvedApiKey,
      username: resolvedUsername,
    }),
  };
}

function mcpTool({
  serverUrl,
  apiKey,
  username,
  requireApproval,
} = {}) {
  return buildTool({
    serverLabel: 'alshival-mcp',
    serverUrl: pick(serverUrl, process.env.ALSHIVAL_MCP_URL, DEFAULT_MCP_URL),
    apiKey,
    username,
    requireApproval,
  });
}

function githubMcpTool({
  serverUrl,
  apiKey,
  username,
  requireApproval,
} = {}) {
  return buildTool({
    serverLabel: 'github-mcp',
    serverUrl: pick(serverUrl, process.env.ALSHIVAL_GITHUB_MCP_URL, DEFAULT_GITHUB_MCP_URL),
    apiKey,
    username,
    requireApproval,
  });
}

class MCPToolSpec {
  constructor() {
    this.refresh();
  }

  get github() {
    return githubMcpTool();
  }

  refresh() {
    const spec = mcpTool();
    this.type = spec.type;
    this.server_label = spec.server_label;
    this.server_url = spec.server_url;
    this.require_approval = spec.require_approval;
    this.headers = spec.headers;
    return this;
  }
}

const mcp = new MCPToolSpec();

function refreshMcp() {
  return mcp.refresh();
}

module.exports = {
  DEFAULT_GITHUB_MCP_URL,
  DEFAULT_MCP_URL,
  githubMcpTool,
  mcp,
  mcpTool,
  refreshMcp,
};
