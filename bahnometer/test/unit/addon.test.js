import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { parse } from 'yaml';
import { validateAddonOptions, readAddonOptions } from '../../lib/addon-config.js';
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
  assert.equal(config.ports, undefined);
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
