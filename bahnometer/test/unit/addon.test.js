import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { parse } from 'yaml';
import { validateAddonOptions, readAddonOptions } from '../../lib/addon-config.js';
import { isLanAddress } from '../../lib/lan-access.js';
import { createApp } from '../../server.js';

test('Supervisor-Optionen sind typisiert und werden vor Serverstart geprüft', async t => {
  assert.deepEqual(validateAddonOptions({}), { data_source: 'transitous', default_origin: 'home' });
  assert.deepEqual(validateAddonOptions({ data_source: 'bahn', default_origin: 'work' }), { data_source: 'bahn', default_origin: 'work' });
  for (const value of [null, [], { default_origin: 'office' }, { data_source: 'invalid' }, { unknown: true }]) assert.throws(() => validateAddonOptions(value));
  const directory = await mkdtemp(join(tmpdir(), 'bahnometer-options-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'options.json');
  await writeFile(path, '{"default_origin":"work"}', { mode: 0o600 });
  assert.equal((await readAddonOptions(path)).default_origin, 'work');
  await writeFile(path, 'invalid json');
  await assert.rejects(readAddonOptions(path));
});

test('HA-Repository ist auffindbar und Add-on-Version, Optionen und Docker-Labels passen zusammen', async () => {
  const root = new URL('../../', import.meta.url);
  const config = parse(await readFile(new URL('config.yaml', root), 'utf8'));
  const repository = parse(await readFile(new URL('../repository.yaml', root), 'utf8'));
  const metadata = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
  const dockerfile = await readFile(new URL('Dockerfile', root), 'utf8');
  assert.ok(repository.name);
  assert.match(repository.url, /CommanderReiker\/Bahnometer$/);
  assert.equal(config.version, metadata.version);
  assert.match(dockerfile, new RegExp(`ARG BUILD_VERSION=${metadata.version.replaceAll('.', '\\.')}`));
  assert.deepEqual(validateAddonOptions(config.options), config.options);
  assert.ok(config.arch.includes('aarch64'));
  assert.equal(config.ingress_port, 8099);
  assert.equal(config.ingress, true);
  assert.equal(config.host_network ?? false, false);
  assert.deepEqual(config.ports, { '8099/tcp': 8099 });
  assert.match(dockerfile, /^EXPOSE 8099$/m);
  assert.match(dockerfile, /http:\/\/127\.0\.0\.1:8099\/api\/health/);
  const entrypoint = await readFile(new URL('addon.js', root), 'utf8');
  assert.match(entrypoint, /port: 8099, ingressOnly: true, allowLan: true/);
  assert.match(await readFile(new URL('server.js', root), 'utf8'), /server\.listen\(port, '0\.0\.0\.0'/);
  assert.equal(config.privileged, undefined);
  assert.equal(config.homeassistant_api ?? false, false);
  assert.match(dockerfile, /io.hass.type="app"/);
  assert.match(dockerfile, /--omit=dev --ignore-scripts/);
});

test('Ingress-Zugriff prüft echte Quelladresse, nicht gefälschte Proxy-Header', async t => {
  let calls = 0;
  const server = createApp({ ingressOnly: true, rail: { async getConnections() { calls++; return {}; } } });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(`${base}/api/connections?origin=home`, { headers: { 'x-forwarded-for': '172.30.32.2', 'x-ingress-path': '/api/hassio_ingress/forged/' } });
  assert.equal(response.status, 403);
  assert.equal(calls, 0);
  assert.equal((await fetch(base)).status, 403);
  const health = await fetch(`${base}/api/health`);
  assert.equal(health.status, 200);
  assert.ok((await health.json()).version);
});

test('Ingress-Gateway erhält HA-Einstellungen und same-origin-Framefreigabe', async t => {
  const server = createApp({ ingressOnly: true, ingressGateway: '127.0.0.1', dataSource: 'transitous', defaultOrigin: 'work' });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.deepEqual(await (await fetch(`${base}/api/config`)).json(), { defaultOrigin: 'work', refreshIntervalSeconds: 60, dataSource: 'transitous' });
  const response = await fetch(base);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'self'/);
});


test('LAN-Freigabe akzeptiert lokale Adressen und lehnt öffentliche Adressen ab', () => {
  for (const address of ['10.1.2.3', '172.16.0.1', '172.31.255.254', '192.168.178.50', '127.0.0.1', '169.254.1.1', '::1', 'fd12::1', 'fe80::1', '::ffff:192.168.1.2']) assert.equal(isLanAddress(address), true, address);
  for (const address of ['8.8.8.8', '172.15.255.255', '172.32.0.1', '192.169.0.1', '0.0.0.0', '2001:4860:4860::8888', '::ffff:8.8.8.8', '::', '', undefined, 'not-an-ip']) assert.equal(isLanAddress(address), false, address);
});

test('Direktes LAN-HTTP liefert root-relative Oberfläche, API und Ressourcen neben Ingress', async t => {
  const calls = [];
  const server = createApp({ ingressOnly: true, allowLan: true, rail: { async getConnections(origin) { calls.push(origin); return { origin }; } } });
  server.listen(0, '0.0.0.0');
  await once(server, 'listening');
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const path of ['/', '/index.html', '/app.js', '/domain.js', '/styles.css', '/icon-192.png', '/manifest.webmanifest', '/sw.js', '/api/config']) {
    const response = await fetch(`${base}${path}`);
    assert.equal(response.status, 200, path);
    assert.ok((await response.arrayBuffer()).byteLength > 0, path);
  }
  for (const origin of ['home', 'work']) assert.deepEqual(await (await fetch(`${base}/api/connections?origin=${origin}`)).json(), { origin });
  assert.deepEqual(calls, ['home', 'work']);
  assert.equal((await fetch(`${base}/api/connections?origin=invalid`)).status, 400);
  assert.equal((await fetch(`${base}/missing.js`)).status, 404);
});
