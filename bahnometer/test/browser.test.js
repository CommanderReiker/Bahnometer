import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir } from 'node:fs/promises';
import { chromium, devices } from 'playwright';
import { createApp } from '../server.js';
import { demoConnections } from '../public/demo.js';
import { createIngressProxy } from './ingress-proxy.js';

let browser;
before(async () => {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
  await mkdir('test-results', { recursive: true });
});
after(async () => browser?.close());

async function setup(t, { getConnections = async origin => demoConnections(origin), latitude = 48.7651, longitude = 11.4237, denyLocation = false, tablet = false, serviceWorkers = 'block' } = {}) {
  const server = createApp({ rail: { getConnections }, logger: { error() {} } });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const baseURL = `http://127.0.0.1:${server.address().port}`;
  const context = await browser.newContext({
    ...(tablet ? devices['iPad Pro 11'] : devices['iPhone 13']),
    geolocation: { latitude, longitude, accuracy: 30 }, permissions: denyLocation ? [] : ['geolocation'],
    serviceWorkers,
  });
  t.after(async () => { await context.close(); await new Promise(resolve => server.close(resolve)); });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  if (denyLocation) await page.addInitScript(() => {
    Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition(_success, failure) { failure({ code: 1 }); } } });
  });
  return { context, page, baseURL, errors };
}

test('Mobile Ansicht: Standort, rote Verspätungen, Ausfall und fehlende Prognose', async t => {
  const { page, baseURL, errors } = await setup(t);
  await page.goto(baseURL);
  await page.waitForSelector('.journey-card');
  await page.waitForFunction(() => document.getElementById('location-status').textContent.includes('Zuhause erkannt'));
  assert.equal(await page.locator('.journey-card').count(), 4);
  assert.match(await page.locator('.delayed .journey-status').textContent(), /Abfahrt \+7/);
  assert.equal(await page.locator('.delayed .departure-time').evaluate(element => getComputedStyle(element).color), 'rgb(188, 53, 50)');
  assert.equal(await page.locator('.arrival-delayed .arrival-time').evaluate(element => getComputedStyle(element).color), 'rgb(188, 53, 50)');
  assert.match(await page.locator('.cancelled .countdown').textContent(), /Fällt aus/);
  assert.match(await page.locator('.journey-status.unknown').textContent(), /Nur Fahrplan/);
  assert.equal(await page.locator('.next-label').count(), 1);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: 'test-results/mobile.png', fullPage: true });
  assert.deepEqual(errors, []);
});

test('Standort Pfaffenhofen wählt automatisch die Rückfahrt nach Ingolstadt', async t => {
  const { page, baseURL } = await setup(t, { latitude: 48.5306, longitude: 11.505 });
  await page.goto(baseURL);
  await page.waitForFunction(() => document.getElementById('work').getAttribute('aria-pressed') === 'true' && document.querySelector('.journey-card'));
  assert.equal(await page.locator('#from-station').textContent(), 'Pfaffenhofen (Ilm)');
  assert.equal(await page.locator('#to-station').textContent(), 'Ingolstadt Hbf');
  assert.match(await page.locator('#location-status').textContent(), /Arbeit erkannt/);
});

test('Verweigerter Standort blockiert weder manuelle Auswahl noch gespeicherte Rückfahrt', async t => {
  const { page, baseURL } = await setup(t, { denyLocation: true });
  await page.goto(baseURL);
  await page.waitForSelector('.journey-card');
  assert.match(await page.locator('#location-status').textContent(), /nicht freigegeben/);
  await page.locator('#work').click();
  await page.waitForFunction(() => document.querySelector('.journey-card') && document.getElementById('refresh').disabled === false);
  assert.equal(await page.locator('#from-station').textContent(), 'Pfaffenhofen (Ilm)');
  await page.reload();
  await page.waitForSelector('.journey-card');
  assert.equal(await page.locator('#from-station').textContent(), 'Pfaffenhofen (Ilm)');
  await page.locator('#swap').click();
  assert.equal(await page.locator('#from-station').textContent(), 'Ingolstadt Hbf');
});

test('Manueller Refresh macht einen neu gemeldeten Ausfall sichtbar', async t => {
  let count = 0;
  const { page, baseURL } = await setup(t, { getConnections: async origin => {
    const data = demoConnections(origin);
    if (++count > 1) data.journeys[0] = { ...data.journeys[0], cancelled: true, departure: null, arrival: null };
    return data;
  } });
  await page.goto(baseURL);
  await page.waitForSelector('.journey-card');
  assert.equal(await page.locator('.cancelled').count(), 1);
  await page.locator('#quick-refresh').click();
  await page.waitForFunction(() => document.querySelectorAll('.cancelled').length === 2);
  assert.equal(count, 2);
  assert.match(await page.locator('.journey-card').first().textContent(), /Zug fällt aus/);
});

test('API-Fehler erhält den letzten Stand, entfernt Entwarnungen und erlaubt Wiederholung', async t => {
  let fail = false;
  const { page, baseURL } = await setup(t, { getConnections: async origin => { if (fail) throw new Error('offline'); return demoConnections(origin); } });
  await page.goto(baseURL);
  await page.waitForSelector('.journey-card');
  const lastSuccess = await page.locator('#last-success').textContent();
  fail = true;
  await page.locator('#refresh').click();
  await page.waitForSelector('.unconfirmed');
  assert.equal(await page.locator('.journey-card').count(), 4);
  assert.equal(await page.locator('#last-success').textContent(), lastSuccess);
  assert.equal(await page.locator('.next-label').count(), 0);
  assert.match(await page.locator('#freshness-label').textContent(), /fehlgeschlagen/);
  assert.match(await page.locator('.journey-card').first().textContent(), /nicht bestätigt/);
  assert.equal(await page.locator('.journey-status').filter({ hasText: 'Pünktlich' }).count(), 0);
  fail = false;
  await page.locator('#refresh').click();
  await page.waitForFunction(() => !document.querySelector('.unconfirmed') && !document.getElementById('refresh').disabled);
  assert.equal(await page.locator('.next-label').count(), 1);
});

test('Veralteter Zeitstempel zeigt Warnung statt aktuelle Entwarnung', async t => {
  const { page, baseURL } = await setup(t, { getConnections: async origin => ({ ...demoConnections(origin), fetchedAt: new Date(Date.now() - 120_000).toISOString() }) });
  await page.goto(baseURL);
  await page.waitForSelector('.unconfirmed');
  assert.equal(await page.locator('#freshness-label').textContent(), 'Daten veraltet');
  assert.match(await page.locator('#request-notice').textContent(), /älter als 90 Sekunden/);
  assert.equal(await page.locator('.next-label').count(), 0);
});

test('Unabhängige Datenquelle und Quellenhinweise werden sichtbar angezeigt', async t => {
  const { page, baseURL } = await setup(t, { getConnections: async origin => ({ ...demoConnections(origin), source: 'Transitous · DELFI / offene Verkehrsdaten', attribution: 'transitous' }) });
  await page.goto(baseURL);
  await page.waitForSelector('.journey-card');
  assert.match(await page.locator('#data-source').textContent(), /Transitous/);
  assert.equal(await page.locator('#transitous-attribution').isVisible(), true);
  assert.equal(await page.locator('#transitous-attribution a').count(), 3);
  assert.equal(await page.locator('#freshness-label').textContent(), 'Neu abgerufen');
});

test('Nur Fahrplan für alle Züge führt zu einem deutlichen Echtzeithinweis', async t => {
  const { page, baseURL } = await setup(t, { getConnections: async origin => {
    const data = demoConnections(origin);
    data.journeys = data.journeys.filter(j => !j.cancelled).map(j => ({ ...j, realtime: false, departureDelayMinutes: null, arrivalDelayMinutes: null, departure: j.plannedDeparture, arrival: j.plannedArrival }));
    return data;
  } });
  await page.goto(baseURL);
  await page.waitForSelector('.journey-card');
  assert.equal(await page.locator('#coverage-notice').isVisible(), true);
  assert.match(await page.locator('#coverage-notice').textContent(), /keine Echtzeitprognosen/);
  assert.equal(await page.locator('.journey-status').filter({ hasText: 'Pünktlich' }).count(), 0);
});

test('Automatik fragt nach 60 Sekunden neu ab; Rückkehr aus Hintergrund aktualisiert sofort', async t => {
  let count = 0;
  const { page, baseURL } = await setup(t, { getConnections: async origin => { count++; return demoConnections(origin); } });
  await page.clock.install();
  await page.goto(baseURL);
  await page.waitForSelector('.journey-card');
  await page.clock.runFor(61_000);
  await page.waitForFunction(() => !document.getElementById('refresh').disabled);
  assert.equal(count, 2);
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.waitForFunction(() => !document.getElementById('refresh').disabled);
  assert.equal(count, 3);
});

test('iPad-Ansicht und opt-in Demo sind klar markiert, ohne erfundene Live-Abrufe', async t => {
  let calls = 0;
  const { page, baseURL, errors } = await setup(t, { tablet: true, getConnections: async origin => { calls++; return demoConnections(origin); } });
  await page.goto(`${baseURL}/?demo=1`);
  await page.waitForSelector('.journey-card');
  assert.equal(calls, 0);
  assert.match(await page.locator('#demo-banner').textContent(), /DEMOMODUS/);
  assert.equal(await page.locator('.direct-note').filter({ hasText: 'BEISPIELDATEN' }).count(), 4);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: 'test-results/ipad.png', fullPage: true });
  await page.locator('#exit-demo').click();
  await page.waitForFunction(() => document.getElementById('demo-banner').hidden && document.querySelector('.journey-card'));
  assert.equal(calls, 1);
  assert.deepEqual(errors, []);
});

test('Service Worker cached nur App-Hülle; offline entstehen keine bestätigten Bahn-Abfahrten', async t => {
  const { page, context, baseURL } = await setup(t, { serviceWorkers: 'allow' });
  await page.goto(baseURL);
  await page.waitForSelector('.journey-card');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true })); });
  await context.setOffline(true);
  await page.reload();
  await page.waitForSelector('.state-card.error');
  assert.equal(await page.locator('.journey-card').count(), 0);
  assert.match(await page.locator('#freshness-label').textContent(), /fehlgeschlagen/);
  assert.equal(await page.evaluate(async () => (await Promise.all((await caches.keys()).map(async key => (await (await caches.open(key)).keys()).map(request => new URL(request.url).pathname)))).flat().some(path => path.startsWith('/api/'))), false);
});

test('HA-Ingress im iframe: Assets, Konfiguration, Refresh, Manifest und Worker bleiben unter dem Prefix', async t => {
  const seen = [];
  const prefix = '/api/hassio_ingress/test-session/';
  let calls = 0;
  const server = createApp({ ingressOnly: true, ingressGateway: '127.0.0.1', defaultOrigin: 'work', rail: { async getConnections(origin) { calls++; return demoConnections(origin); } } });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const proxy = createIngressProxy({ upstreamPort: server.address().port, prefix, onRequest: url => seen.push(url) });
  proxy.listen(0, '127.0.0.1');
  await once(proxy, 'listening');
  const context = await browser.newContext({ ...devices['iPhone 13'], serviceWorkers: 'allow' });
  t.after(async () => { await context.close(); await new Promise(resolve => proxy.close(resolve)); await new Promise(resolve => server.close(resolve)); });
  await context.addInitScript(() => Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition(_success, failure) { failure({ code: 1 }); } } }));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const base = `http://127.0.0.1:${proxy.address().port}`;
  await page.goto(`${base}/ha`);
  const frame = page.frameLocator('iframe');
  await frame.locator('.journey-card').first().waitFor();
  assert.equal(await frame.locator('#from-station').textContent(), 'Pfaffenhofen (Ilm)');
  await frame.locator('#quick-refresh').click();
  await page.waitForFunction(() => !document.querySelector('iframe').contentDocument.getElementById('refresh').disabled);
  assert.equal(calls, 2);
  assert.ok(seen.some(url => url === `${prefix}styles.css`));
  assert.ok(seen.some(url => url === `${prefix}api/config`));
  assert.ok(seen.some(url => url === `${prefix}api/connections?origin=work`));
  assert.equal(seen.some(url => /^\/(api\/(connections|config)|styles\.css|app\.js|sw\.js)/.test(url)), false);
  const scope = await page.frames().find(f => f.url().includes(prefix)).evaluate(async () => (await navigator.serviceWorker.ready).scope);
  assert.equal(scope, `${base}${prefix}`);
  const manifest = await (await context.request.get(`${base}${prefix}manifest.webmanifest`)).json();
  assert.equal(new URL(manifest.start_url, `${base}${prefix}manifest.webmanifest`).pathname, prefix);
  await page.screenshot({ path: 'test-results/ha-ingress.png', fullPage: true });
  assert.deepEqual(errors, []);
});
