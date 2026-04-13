import http from 'node:http';
import https from 'node:https';

const port = Number(process.env.LIVE_API_PROXY_PORT || 3001);
const targetBase = new URL(process.env.LIVE_API_BASE_URL || 'https://designbridge.sisihome.org');

const server = http.createServer((req, res) => {
  const upstream = https.request({
    protocol: targetBase.protocol,
    hostname: targetBase.hostname,
    port: targetBase.port || 443,
    method: req.method,
    path: req.url,
    headers: {
      ...req.headers,
      host: targetBase.host,
    },
  }, (upstreamRes) => {
    res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
    upstreamRes.pipe(res);
  });

  upstream.on('error', (error) => {
    res.writeHead(502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'live_api_proxy_error', message: String(error) }));
  });

  req.pipe(upstream);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`[live-api-proxy] forwarding http://127.0.0.1:${port} -> ${targetBase.origin}`);
});
