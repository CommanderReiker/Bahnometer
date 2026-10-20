import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLACES, detectPlace, opposite, isStale, timeLabel, departureLabel } from '../../public/domain.js';

test('Standortregionen erkennen Zuhause und Arbeit; fremde und ungenaue Positionen bleiben unbestimmt', () => {
  assert.equal(detectPlace({ ...PLACES.home, accuracy: 30 }), 'home');
  assert.equal(detectPlace({ ...PLACES.work, accuracy: 30 }), 'work');
  assert.equal(detectPlace({ latitude: 48.137, longitude: 11.576, accuracy: 20 }), null);
  assert.equal(detectPlace({ ...PLACES.home, accuracy: 10_000 }), null);
  assert.equal(detectPlace({ latitude: NaN, longitude: 11 }), null);
  assert.equal(detectPlace({ latitude: 120, longitude: 11 }), null);
  assert.equal(detectPlace({ ...PLACES.work, accuracy: -1 }), null);
  // An accuracy circle extending outside the region must not determine direction.
  assert.equal(detectPlace({ latitude: 48.65, longitude: 11.42, accuracy: 4000 }), null);
});

test('Fahrtrichtung und geprüfte Stationskennungen', () => {
  assert.equal(opposite('home'), 'work');
  assert.equal(opposite('work'), 'home');
  assert.equal(PLACES.home.stationId, '8000183');
  assert.equal(PLACES.work.stationId, '8004781');
});

test('Uhrzeit bleibt in Deutschland auch bei anderer Gerätezonenzeit und Zeitumstellung', () => {
  assert.equal(timeLabel('2026-10-20T06:05:00Z'), '08:05');
  assert.equal(timeLabel('2026-10-26T06:05:00Z'), '07:05');
  assert.equal(timeLabel(null), '–');
});

test('Alter Datenstand wird nach 90 Sekunden markiert; Ausfälle erhalten keinen Countdown', () => {
  const now = Date.parse('2026-10-20T06:00:00Z');
  assert.equal(isStale('2026-10-20T05:58:29Z', now), true);
  assert.equal(isStale('2026-10-20T05:59:00Z', now), false);
  assert.equal(isStale(null, now), true);
  assert.equal(departureLabel({ cancelled: true, departure: null }, now), 'Fällt aus');
  assert.equal(departureLabel({ departure: '2026-10-20T06:07:00Z' }, now), 'In 7 Min.');
});
