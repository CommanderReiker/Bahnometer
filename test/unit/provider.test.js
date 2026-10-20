import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultProfile } from 'db-vendo-client/lib/default-profile.js';
import { profile } from 'db-vendo-client/p/dbweb/index.js';
import { parseBahnLine, createBahnProvider } from '../../lib/provider.js';

test('Echte DB-Feldbelegung: Zugnummer im Namen, RE/RB im separaten Feld', () => {
  const context = { profile: { ...defaultProfile, ...profile } };
  for (const [category, number, route] of [['RE', '59410', '1'], ['RB', '59160', '16']]) {
    const line = parseBahnLine(context, { verkehrsmittel: { produktGattung: 'REGIONAL', name: number, nummer: number, kurzText: category, mittelText: `${category}${route}`, langText: `${category}${route} (${number})`, zugattribute: [] } });
    assert.equal(line.name, `${category} ${route}`);
    assert.equal(line.productName, category);
    assert.equal(line.fahrtNr, number);
  }
});

test('403 der Webschnittstelle nutzt DB-Navigator; weitere Refreshes vermeiden den blockierten Endpunkt', async () => {
  const calls = [];
  let now = 0;
  const provider = createBahnProvider({ clock: () => now, clientFactory: profile => ({ async journeys(_from, _to, options) {
    calls.push(profile.journeysEndpoint);
    assert.equal(options.signal.aborted, false);
    if (profile.journeysEndpoint.includes('int.bahn.de')) throw Object.assign(new Error('Forbidden'), { response: { status: 403 } });
    return { journeys: [] };
  } }) });
  assert.match((await provider.journeys('a', 'b', {})).source, /DB Navigator/);
  await provider.journeys('a', 'b', {});
  assert.equal(calls.filter(url => url.includes('int.bahn.de')).length, 1);
  assert.equal(calls.filter(url => url.includes('app.services-bahn.de')).length, 2);
  now = 601_000;
  await provider.journeys('a', 'b', {});
  assert.equal(calls.filter(url => url.includes('int.bahn.de')).length, 2);
});

test('Blockade beider Schnittstellen ist ein benannter Fehler statt leerer Erfolgsantwort', async () => {
  let count = 0;
  const provider = createBahnProvider({ clientFactory: () => ({ async journeys() { count++; throw Object.assign(new Error('Forbidden'), { response: { status: 403 } }); } }) });
  await assert.rejects(provider.journeys('a', 'b', {}), { code: 'BAHN_ACCESS_BLOCKED' });
  assert.equal(count, 2);
});

test('Andere Fehler verursachen keinen blinden Wiederholungsversuch; Profil ist konfigurierbar', async () => {
  let calls = 0;
  const clientFactory = profile => ({ async journeys() { calls++; throw Object.assign(new Error(profile.journeysEndpoint), { response: { status: 500 } }); } });
  await assert.rejects(createBahnProvider({ clientFactory }).journeys('a', 'b', {}), /int.bahn.de/);
  assert.equal(calls, 1);
  await assert.rejects(createBahnProvider({ clientFactory, mode: 'dbnav' }).journeys('a', 'b', {}), /app.services-bahn.de/);
  assert.equal(calls, 2);
  assert.throws(() => createBahnProvider({ mode: 'invalid' }), /BAHN_PROFILE/);
});
