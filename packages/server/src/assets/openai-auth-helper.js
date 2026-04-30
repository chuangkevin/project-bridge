#!/usr/bin/env node
/**
 * project-bridge OpenAI auth helper (zero-dependency).
 *
 * Run on YOUR LOCAL machine (the one with the browser). Performs the OpenAI
 * OAuth (PKCE) flow against http://localhost:1455/auth/callback — the only
 * redirect_uri the Codex CLI public client_id accepts — and uploads the
 * resulting tokens back to your project-bridge server.
 *
 * Usage:
 *   node openai-auth-helper.js                       # uses baked-in server URL
 *   node openai-auth-helper.js --server <url>        # override server URL
 *   node openai-auth-helper.js --no-open             # don't auto-open browser
 *   node openai-auth-helper.js --auth-token <bearer> # send Bearer token to server
 */

const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { URL } = require('url');
const { exec } = require('child_process');

// Replaced server-side at download time. If left as the literal sentinel,
// fall back to localhost so manual `node openai-auth-helper.js` from a repo
// checkout still works. The sentinel comparison below is split with `+` so
// the server's global regex replace doesn't rewrite the comparison string too.
const BAKED_SERVER_URL = '__PROJECT_BRIDGE_SERVER__';

const DEFAULTS = {
  server:
    BAKED_SERVER_URL && BAKED_SERVER_URL !== ('__PROJECT_' + 'BRIDGE_SERVER__')
      ? BAKED_SERVER_URL
      : (process.env.PROJECT_BRIDGE_SERVER || 'http://localhost:3003'),
  clientId: process.env.OPENAI_OAUTH_CLIENT_ID || 'app_EMoamEEZ73f0CkXaXp7hrann',
  port: 1455,
  authorizeUrl: process.env.OPENAI_OAUTH_AUTHORIZE_URL || 'https://auth.openai.com/oauth/authorize',
  tokenUrl: process.env.OPENAI_OAUTH_TOKEN_URL || 'https://auth.openai.com/oauth/token',
  scope: process.env.OPENAI_OAUTH_SCOPE || 'openid profile email offline_access',
  originator: process.env.OPENAI_OAUTH_ORIGINATOR || 'project-bridge',
};

function parseArgs(argv) {
  const out = Object.assign({}, DEFAULTS, { openBrowser: true, authToken: '' });
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const next = function () { return argv[++i]; };
    switch (a) {
      case '--server': out.server = next(); break;
      case '--client-id': out.clientId = next(); break;
      case '--port': out.port = Number(next()); break;
      case '--auth-token': out.authToken = next(); break;
      case '--no-open': out.openBrowser = false; break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
      default:
        console.error('Unknown arg: ' + a);
        printHelp();
        process.exit(2);
    }
  }
  return out;
}

function printHelp() {
  console.log('\nUsage: node openai-auth-helper.js [--server <url>] [--no-open] [--auth-token <bearer>]\n');
}

function base64Url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pkce() {
  const verifier = base64Url(crypto.randomBytes(32));
  const challenge = base64Url(crypto.createHash('sha256').update(verifier).digest());
  return { verifier: verifier, challenge: challenge };
}

function openInBrowser(url) {
  const platform = process.platform;
  let cmd;
  if (platform === 'win32') cmd = 'start "" "' + url + '"';
  else if (platform === 'darwin') cmd = 'open "' + url + '"';
  else cmd = 'xdg-open "' + url + '"';
  exec(cmd, function () { /* best-effort */ });
}

function fetchJson(targetUrl, opts) {
  return new Promise(function (resolve, reject) {
    const u = new URL(targetUrl);
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(
      {
        method: opts.method || 'GET',
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: u.pathname + u.search,
        headers: opts.headers || {},
      },
      function (res) {
        const chunks = [];
        res.on('data', function (c) { chunks.push(c); });
        res.on('end', function () {
          const text = Buffer.concat(chunks).toString('utf8');
          let json;
          try { json = text ? JSON.parse(text) : {}; } catch (_e) { json = { raw: text }; }
          resolve({ status: res.statusCode, body: json, text: text });
        });
      }
    );
    req.on('error', reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

async function exchangeCodeForToken(opts) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: opts.clientId,
    code: opts.code,
    redirect_uri: opts.redirectUri,
    code_verifier: opts.verifier,
  }).toString();

  const resp = await fetchJson(opts.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(body),
      Accept: 'application/json',
    },
    body: body,
  });

  if (resp.status !== 200) {
    throw new Error('Token exchange failed (' + resp.status + '): ' + resp.text.slice(0, 500));
  }
  return resp.body;
}

async function postTokensToServer(opts) {
  const url = new URL('/api/openai-oauth/token', opts.server).toString();
  const body = JSON.stringify({
    access_token: opts.tokens.access_token,
    refresh_token: opts.tokens.refresh_token,
    expires_in: opts.tokens.expires_in,
  });
  const headers = {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  };
  if (opts.authToken) headers['Authorization'] = 'Bearer ' + opts.authToken;

  const resp = await fetchJson(url, { method: 'POST', headers: headers, body: body });
  if (resp.status < 200 || resp.status >= 300) {
    throw new Error('Upload to ' + url + ' failed (' + resp.status + '): ' + resp.text.slice(0, 500));
  }
  return resp.body;
}

async function run() {
  const args = parseArgs(process.argv);
  const pk = pkce();
  const verifier = pk.verifier;
  const challenge = pk.challenge;
  const state = base64Url(crypto.randomBytes(16));
  const redirectUri = 'http://localhost:' + args.port + '/auth/callback';

  // Mirror the Codex CLI authorize request. The `id_token_add_organizations`
  // and `codex_cli_simplified_flow` flags are required by the public Codex
  // client_id; without them auth.openai.com short-circuits to its generic
  // "session expired" page instead of starting the OAuth consent flow.
  const authParams = new URLSearchParams({
    response_type: 'code',
    client_id: args.clientId,
    redirect_uri: redirectUri,
    scope: args.scope,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    id_token_add_organizations: 'true',
    codex_cli_simplified_flow: 'true',
    state: state,
    originator: args.originator,
  });
  const authorizeUrl = args.authorizeUrl + '?' + authParams.toString();

  console.log('');
  console.log('▶ Target server: ' + args.server);
  console.log('▶ client_id:     ' + args.clientId);
  console.log('▶ Listening on:  ' + redirectUri);
  console.log('');

  const server = http.createServer();
  const captured = await new Promise(function (resolve, reject) {
    server.on('request', function (req, res) {
      const reqUrl = new URL(req.url, 'http://localhost:' + args.port);
      if (reqUrl.pathname !== '/auth/callback') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
        return;
      }
      const code = reqUrl.searchParams.get('code');
      const returnedState = reqUrl.searchParams.get('state');
      const errorParam = reqUrl.searchParams.get('error');

      if (errorParam) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<html><body><h2>OAuth error</h2><pre>' + errorParam + '</pre></body></html>');
        reject(new Error('OAuth error: ' + errorParam));
        return;
      }
      if (!code || !returnedState) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Missing code or state');
        reject(new Error('Missing code or state'));
        return;
      }
      if (returnedState !== state) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('State mismatch');
        reject(new Error('State mismatch — possible CSRF'));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(
        '<html><body style="font-family:sans-serif;padding:32px;">' +
        '<h2>OK Authorization received</h2>' +
        '<p>Exchanging code for token and uploading to <code>' + args.server + '</code>…</p>' +
        '<p>You can close this tab. Check the terminal for the result.</p>' +
        '</body></html>'
      );
      resolve({ code: code });
    });

    server.listen(args.port, '127.0.0.1', function () {
      if (args.openBrowser) {
        console.log('Opening browser…');
        openInBrowser(authorizeUrl);
      }
      console.log('If the browser does not open, visit this URL manually:');
      console.log('');
      console.log('  ' + authorizeUrl);
      console.log('');
      console.log('Waiting for OAuth callback…');
    });

    server.on('error', reject);
  });

  server.close();

  console.log('Exchanging code for tokens…');
  const tokens = await exchangeCodeForToken({
    tokenUrl: args.tokenUrl,
    clientId: args.clientId,
    code: captured.code,
    verifier: verifier,
    redirectUri: redirectUri,
  });

  console.log('Uploading tokens to project-bridge…');
  await postTokensToServer({
    server: args.server,
    authToken: args.authToken,
    tokens: tokens,
  });

  console.log('');
  console.log('Done. project-bridge is now connected to OpenAI.');
  if (tokens.expires_in) {
    const at = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
    console.log('   access_token expires at: ' + at);
  }
}

run().catch(function (err) {
  console.error('');
  console.error('ERROR:', err && err.message ? err.message : err);
  process.exit(1);
});
