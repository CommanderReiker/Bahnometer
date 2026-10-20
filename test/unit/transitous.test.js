import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTransitousBoard, createTransitousProvider } from '../../lib/transitous.js';
import { normalizeJourneys } from '../../lib/rail.js';
import { createDataProvider } from '../../lib/data-provider.js';

const home = { name: 'Ingolstadt Hbf', lat: 48.744538, lon: 11.437335, scheduledDeparture: '2026-10-20T06:10:00Z', departure: '2026-10-20T06:17:00Z', scheduledTrack: '4', track: '5' };
const work = { name: 'Pfaffenhofen(Ilm)', lat: 48.522432, lon: 11.511883, scheduledArrival: '2026-10-20T06:33:00Z', arrival: '2026-10-20T06:40:00Z' };
const train = overrides => ({ mode: 'REGIONAL_FAST_RAIL', routeShortName: 'RE 1', tripId: 'test-1', realTime: true, place: { ...home }, nextStops: [{ ...work }], ...overrides });
const parse = trains => parseTransitousBoard({ stopTimes: trains }, '8000183', '8004781');

test('Transitous-Abfahrtstafel liefert RE/RB, echte Folgehalte, Zeiten und Gleisänderung', () => {
  const data = parse([train(), train({ tripId: 'rb', mode: 'REGIONAL_RAIL', routeShortName: 'RB 16' })]);
  const normalized = normalizeJourneys(data, 'home', Date.parse('2026-10-20T06:00:00Z'));
  assert.equal(normalized.length, 2);
  assert.equal(normalized[0].line, 'RE 1');
  assert.equal(normalized[0].departureDelayMinutes, 7);
  assert.equal(normalized[0].arrivalDelayMinutes, 7);
  assert.equal(normalized[0].platformChanged, true);
  assert.equal(data.attribution, 'transitous');
});

test('Transitous verwechselt weder Busse, ICEs, andere Stationen noch die falsche Fahrtrichtung', () => {
  const data = parse([
    train({ mode: 'BUS' }), train({ routeShortName: 'ICE 123' }), train({ routeShortName: 'S 2' }),
    train({ place: { ...home, name: 'Ingolstadt Nord' } }),
    train({ nextStops: [{ ...work, lat: 49.5 }] }),
    train({ nextStops: [], headsign: 'Pfaffenhofen(Ilm)' }),
  ]);
  assert.deepEqual(data.journeys, []);
});

test('Fehlende Echtzeit bleibt unbekannt; Ausfall am Zielhalt bleibt ein Ausfall', () => {
  const data = parse([train({ realTime: false }), train({ tripId: 'cancelled', nextStops: [{ ...work, cancelled: true }] })]);
  const normalized = normalizeJourneys(data, 'home', Date.parse('2026-10-20T06:00:00Z'));
  assert.equal(normalized.find(j => j.id.startsWith('test-1')).realtime, false);
  assert.equal(normalized.find(j => j.id.startsWith('test-1')).departureDelay, null);
  assert.equal(normalized.find(j => j.cancelled).departure, null);
});

test('Fehlende Folgehalte oder ungültige Antwort werden nicht als leere Erfolgsantwort ausgegeben', () => {
  assert.throws(() => parseTransitousBoard({}, '8000183', '8004781'), { code: 'TRANSITOUS_UNAVAILABLE' });
  assert.throws(() => parse([train({ nextStops: undefined })]), { code: 'TRANSITOUS_UNAVAILABLE' });
  assert.deepEqual(parse([]).journeys, []);
});

test('Transitous-Abruf identifiziert die App und nutzt Abfahrtstafel statt Routenberechnung', async () => {
  let requested;
  const provider = createTransitousProvider({ proxy: null, fetchImpl: async (url, options) => {
    requested = { url, options };
    return { ok: true, json: async () => ({ stopTimes: [train()] }) };
  } });
  await provider.journeys('8000183', '8004781', { departure: new Date('2026-10-20T06:00:00Z') });
  assert.equal(requested.url.pathname, '/api/v6/stoptimes');
  assert.equal(requested.url.searchParams.get('fetchStops'), 'true');
  assert.deepEqual(requested.url.searchParams.getAll('mode'), ['RAIL', 'REGIONAL_FAST_RAIL', 'REGIONAL_RAIL']);
  assert.equal(requested.url.searchParams.get('center'), '48.744538,11.437335');
  assert.match(requested.options.headers['User-Agent'], /github.com\/CommanderReiker\/Bahnometer/);
  await assert.rejects(createTransitousProvider({ proxy: null, fetchImpl: async () => ({ ok: false, status: 503 }) }).journeys('8000183', '8004781'), { code: 'TRANSITOUS_UNAVAILABLE' });
});

test('Rückfahrt verwendet den tatsächlichen Zielhalt Ingolstadt Hbf', () => {
  const data = parseTransitousBoard({ stopTimes: [train({ place: { ...work, name: 'Pfaffenhofen a.d. Ilm, Bahnhof', scheduledDeparture: '2026-10-20T06:10:00Z', departure: '2026-10-20T06:10:00Z' }, nextStops: [{ ...home, scheduledArrival: '2026-10-20T06:40:00Z', arrival: '2026-10-20T06:40:00Z' }] })] }, '8004781', '8000183');
  assert.equal(data.journeys[0].legs[0].destination.id, '8000183');
});

test('Automatik verwendet nach Bahn-Sperre die unabhängige Quelle, nicht bei leeren Ergebnissen', async () => {
  let bahnCalls = 0;
  let transitousCalls = 0;
  const provider = createDataProvider({ mode: 'auto', bahn: { async journeys() { bahnCalls++; throw Object.assign(new Error('blocked'), { code: 'BAHN_ACCESS_BLOCKED' }); } }, transitous: { async journeys() { transitousCalls++; return parse([]); } } });
  await provider.journeys('a', 'b', {});
  await provider.journeys('a', 'b', {});
  assert.equal(bahnCalls, 1);
  assert.equal(transitousCalls, 2);
  const noFallback = createDataProvider({ mode: 'auto', bahn: { async journeys() { return { journeys: [] }; } }, transitous: { async journeys() { throw new Error('must not be called'); } } });
  assert.deepEqual((await noFallback.journeys('a', 'b', {})).journeys, []);
});

test('Explizites Transitous-Profil nutzt keinen Bahn-Zugang', async () => {
  const provider = createDataProvider({ mode: 'transitous', bahn: { async journeys() { throw new Error('must not be called'); } }, transitous: { async journeys() { return parse([]); } } });
  assert.match((await provider.journeys('a', 'b', {})).source, /Transitous/);
});
