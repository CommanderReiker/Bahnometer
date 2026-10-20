// Test-only stand-in for the authenticated Supervisor ingress gateway.
// This proxy is excluded from the add-on image and supplies no authentication.
import { createServer, request } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function createIngressProxy({ upstreamPort, upstreamHost = '127.0.0.1', prefix = '/api/hassio_ingress/test-session/', onRequest = () => {} }) {
  return createServer((req, res) => {
    onRequest(req.url);
    if (req.url === '/ha') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Test Home Assistant</title><style>html,body{height:100%;margin:0}iframe{width:100%;height:100%;border:0}</style></head><body><iframe title="Bahnometer" src="${prefix}"></iframe></body></html>`);
      return;
    }
    if (req.url === prefix.slice(0, -1)) { res.writeHead(308, { Location: prefix }); res.end(); return; }
    if (!req.url.startsWith(prefix)) { res.writeHead(404); res.end('Not an ingress route'); return; }
    const forwarded = request({ hostname: upstreamHost, port: upstreamPort, path: `/${req.url.slice(prefix.length)}`, method: req.method, headers: { ...req.headers, 'x-ingress-path': prefix.slice(0, -1) } }, response => {
      res.writeHead(response.statusCode, response.headers);
      response.pipe(res);
    });
    forwarded.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end('Backend unavailable'); });
    req.pipe(forwarded);
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  createIngressProxy({ upstreamHost: process.env.TEST_UPSTREAM_HOST || '127.0.0.1', upstreamPort: Number(process.env.TEST_UPSTREAM_PORT || 8099) }).listen(8080, '0.0.0.0');
}
