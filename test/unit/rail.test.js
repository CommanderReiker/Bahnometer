import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeJourneys, createRailService } from '../../lib/rail.js';

const now = Date.parse('2026-10-20T06:00:00Z');
const makeLeg = (overrides = {}) => ({
  origin: { id: '8000183' }, destination: { id: '8004781' },
  line: { name: 'RE 1', mode: 'train' }, tripId: 'test-trip',
  departure: '2026-10-20T06:05:00Z', plannedDeparture: '2026-10-20T06:05:00Z',
  arrival: '2026-10-20T06:29:00Z', plannedArrival: '2026-10-20T06:29:00Z',
  departureDelay: 0, arrivalDelay: 0,
  plannedDeparturePlatform: '4', departurePlatform: '4', ...overrides,
});
const normalize = legs => normalizeJourneys({ journeys: legs.map(leg => ({ legs: [leg] })) }, 'home', now);

test('Nur direkte RE/RB auf exakt der Pendelstrecke; kein ICE, Bus, S-Bahn oder fremder Bahnhof', () => {
  const result = normalize([
    makeLeg(), makeLeg({ line: { name: 'RB16', mode: 'train' }, tripId: 'rb' }),
    ...['ICE 100', 'IC 3', 'S 2', 'MEX 12', 'REX 5'].map(name => makeLeg({ line: { name } })),
    makeLeg({ line: { name: 'RE 1', mode: 'bus' } }),
    makeLeg({ destination: { id: '8004775' } }),
    makeLeg({ origin: { id: '8003076' } }),
    makeLeg({ walking: true }),
  ]);
  assert.deepEqual(result.map(connection => connection.line), ['RE 1', 'RB16']);
  assert.equal(normalizeJourneys({ journeys: [{ legs: [makeLeg(), makeLeg()] }] }, 'home', now).length, 0);
});

test('Verspätungen, Ankunftsverspätung und Gleisänderung bleiben erhalten', () => {
  const [result] = normalize([makeLeg({ departure: '2026-10-20T06:12:00Z', arrival: '2026-10-20T06:38:00Z', departureDelay: 420, arrivalDelay: 540, departurePlatform: '5' })]);
  assert.equal(result.departureDelayMinutes, 7);
  assert.equal(result.arrivalDelayMinutes, 9);
  assert.equal(result.platformChanged, true);
  assert.equal(result.platform, '5');
  assert.equal(result.realtime, true);
});

test('Null-Prognose wird nicht als pünktlich interpretiert', () => {
  const [result] = normalize([makeLeg({ departureDelay: null, arrivalDelay: null })]);
  assert.equal(result.departureDelayMinutes, null);
  assert.equal(result.realtime, false);
});

test('Ausfall mit null Echtzeitwerten und verspäteter Zug mit vergangener Planzeit bleiben sichtbar', () => {
  const result = normalize([
    makeLeg({ cancelled: true, departure: null, arrival: null }),
    makeLeg({ tripId: 'late', plannedDeparture: '2026-10-20T05:55:00Z', departure: '2026-10-20T06:10:00Z', departureDelay: 900 }),
    makeLeg({ tripId: 'gone', departure: '2026-10-20T05:50:00Z', plannedDeparture: '2026-10-20T05:50:00Z' }),
  ]);
  assert.equal(result.length, 2);
  const cancelled = result.find(connection => connection.cancelled);
  assert.equal(cancelled.departure, null);
  assert.equal(cancelled.platform, null);
  assert.ok(result.find(connection => connection.id.startsWith('late')));
});

test('Duplikate können eine Ausfallmeldung nicht überschreiben; Hinweise sind Text', () => {
  const result = normalize([makeLeg({ cancelled: true }), makeLeg({ remarks: [{ text: '<b>Warnung</b>' }] })]);
  assert.equal(result.length, 1);
  assert.equal(result[0].cancelled, true);
  assert.deepEqual(normalize([makeLeg({ remarks: [{ text: '<b>Warnung</b>' }] })])[0].remarks, ['Warnung']);
});

test('Leere gültige Antwort ist erlaubt, defekte Antwort ist ein Fehler', () => {
  assert.deepEqual(normalizeJourneys({ journeys: [] }, 'home', now), []);
  assert.throws(() => normalizeJourneys({}, 'home', now), /INVALID_PROVIDER_RESPONSE/);
});

test('Jeder Refresh fragt neu an; gleichzeitige Abfragen werden zusammengeführt', async () => {
  let calls = 0;
  let query;
  const provider = { async journeys(...args) { calls++; query = args; await new Promise(resolve => setTimeout(resolve, 10)); return { journeys: [{ legs: [makeLeg()] }] }; } };
  const service = createRailService(provider, { clock: () => now });
  const [a, b] = await Promise.all([service.getConnections('home'), service.getConnections('home')]);
  assert.equal(calls, 1);
  assert.deepEqual(a, b);
  await service.getConnections('home');
  assert.equal(calls, 2);
  assert.equal(query[0], '8000183');
  assert.equal(query[1], '8004781');
  assert.equal(query[2].products.nationalExpress, false);
  assert.equal(query[2].products.bus, false);
  assert.equal(query[2].transfers, 0);
  assert.equal(query[2].departure.getTime(), now - 15 * 60_000);
  assert.equal(a.sourceUpdatedAt, null);
  await service.getConnections('work');
  assert.deepEqual(query.slice(0, 2), ['8004781', '8000183']);
});

test('Eine fehlgeschlagene Abfrage bleibt beim nächsten Refresh wiederholbar', async () => {
  let count = 0;
  const service = createRailService({ async journeys() { if (++count === 1) throw new Error('offline'); return { journeys: [] }; } });
  await assert.rejects(service.getConnections('home'), /offline/);
  assert.deepEqual((await service.getConnections('home')).journeys, []);
  await assert.rejects(service.getConnections('invalid'), /INVALID_ORIGIN/);
});
