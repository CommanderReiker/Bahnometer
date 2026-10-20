import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';
import { createRailService } from './lib/rail.js';
import { createBahnProvider } from './lib/provider.js';

const publicDir = resolve(fileURLToPath(new URL('./public/', import.meta.url)));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'geolocation=(self)',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; worker-src 'self'; manifest-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
};

export function createApp({ rail = createRailService(createBahnProvider()), logger = console } = {}) {
  let requestsInWindow = 0;
  let windowStart = Date.now();
  return createServer(async (req, res) => {
    const respond = (status, body, headers = {}) => {
      res.writeHead(status, { ...securityHeaders, 'Cache-Control': 'no-store', ...headers });
      res.end(req.method === 'HEAD' ? undefined : body);
    };
    const json = (status, body, headers) => respond(status, JSON.stringify(body), { 'Content-Type': 'application/json; charset=utf-8', ...headers });
    try {
      if (!['GET', 'HEAD'].includes(req.method)) return json(405, { error: 'METHOD_NOT_ALLOWED' }, { Allow: 'GET, HEAD' });
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/api/health') return json(200, { status: 'ok' });
      if (url.pathname === '/api/connections') {
        const origin = url.searchParams.get('origin');
        if (!['home', 'work'].includes(origin)) return json(400, { error: 'INVALID_ORIGIN', message: 'Bitte Zuhause oder Arbeit als Start wählen.' });
        if (Date.now() - windowStart >= 60_000) { windowStart = Date.now(); requestsInWindow = 0; }
        if (++requestsInWindow > 20) return json(429, { error: 'RATE_LIMIT', message: 'Zu viele Abfragen. Bitte in einer Minute erneut versuchen.' }, { 'Retry-After': '60' });
        try {
          return json(200, await rail.getConnections(origin));
        } catch (error) {
          logger.error('Bahn-Abfrage fehlgeschlagen:', error.name, error.code || error.message);
          if (error.code === 'BAHN_ACCESS_BLOCKED') return json(502, { error: 'BAHN_ACCESS_BLOCKED', message: 'Die Bahn blockiert den Abruf von diesem Internetzugang (HTTP 403 / OPS_BLOCKED). Bitte später erneut versuchen. Bei einer dauerhaften Sperre wird ein anderer Datenzugang benötigt.' });
          return json(502, { error: 'UPSTREAM_UNAVAILABLE', message: 'Die Bahn-Daten sind gerade nicht erreichbar. Bitte erneut aktualisieren. Vorhandene Anzeigen sind nicht mehr bestätigt.' });
        }
      }
      if (url.pathname.startsWith('/api/')) return json(404, { error: 'NOT_FOUND' });
      const pathname = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
      const target = resolve(publicDir, `.${pathname}`);
      if (!target.startsWith(`${publicDir}${sep}`)) return respond(403, 'Forbidden');
      try {
        const file = await readFile(target);
        return respond(200, file, { 'Content-Type': types[extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      } catch (error) {
        if (['ENOENT', 'ENOTDIR', 'EISDIR'].includes(error.code)) return respond(404, 'Nicht gefunden');
        throw error;
      }
    } catch (error) {
      logger.error('HTTP-Fehler:', error.name);
      return json(500, { error: 'INTERNAL_ERROR' });
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000);
  const server = createApp();
  server.listen(port, '0.0.0.0', () => console.log(`Bahnometer läuft auf Port ${port}.`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
}
