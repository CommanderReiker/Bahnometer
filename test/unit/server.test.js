import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../../server.js';

test('HTTP liefert App und gültige Antworten, verhindert beliebige Routen und cached keine Bahn-Daten', async t => {
  let origin;
  const server = createApp({ rail: { async getConnections(value) { origin = value; return { origin: value, journeys: [] }; } } });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const page = await fetch(base);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Bahnometer/);
  assert.match(page.headers.get('content-security-policy'), /connect-src 'self'/);
  const response = await fetch(`${base}/api/connections?origin=work`);
  assert.equal(response.status, 200);
  assert.equal(origin, 'work');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal((await response.json()).origin, 'work');
  assert.equal((await fetch(`${base}/api/connections?origin=https://example.org`)).status, 400);
  assert.equal((await fetch(`${base}/api/unknown`)).status, 404);
  assert.equal((await fetch(`${base}/package.json`)).status, 404);
  assert.equal((await fetch(base, { method: 'POST' })).status, 405);
});

test('Upstreamfehler ist 502 statt leere oder erfundene Verbindungen; Wiederholung kann gelingen', async t => {
  let fail = true;
  const server = createApp({ rail: { async getConnections() { if (fail) throw new Error('blocked'); return { journeys: [] }; } }, logger: { error() {} } });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const url = `http://127.0.0.1:${server.address().port}/api/connections?origin=home`;
  const response = await fetch(url);
  assert.equal(response.status, 502);
  assert.equal((await response.json()).error, 'UPSTREAM_UNAVAILABLE');
  fail = false;
  assert.equal((await fetch(url)).status, 200);
});

test('Bahn-Zugriffssperre wird für Nutzer als HTTP 403 / OPS_BLOCKED erkennbar', async t => {
  const server = createApp({ rail: { async getConnections() { throw Object.assign(new Error('Forbidden'), { code: 'BAHN_ACCESS_BLOCKED' }); } }, logger: { error() {} } });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/connections?origin=home`);
  assert.equal(response.status, 502);
  const data = await response.json();
  assert.equal(data.error, 'BAHN_ACCESS_BLOCKED');
  assert.match(data.message, /OPS_BLOCKED/);
});
