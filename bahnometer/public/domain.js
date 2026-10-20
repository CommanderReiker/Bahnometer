export const PLACES = Object.freeze({
  home: { label: 'Zuhause', city: 'Ingolstadt', station: 'Ingolstadt Hbf', stationId: '8000183', latitude: 48.7651, longitude: 11.4237, radiusKm: 15 },
  work: { label: 'Arbeit', city: 'Pfaffenhofen', station: 'Pfaffenhofen (Ilm)', stationId: '8004781', latitude: 48.5306, longitude: 11.505, radiusKm: 10 },
});

export const REFRESH_MS = 60_000;
export const STALE_MS = 90_000;

export function opposite(place) { return place === 'home' ? 'work' : 'home'; }

export function distanceKm(a, b) {
  const radians = value => value * Math.PI / 180;
  const dLat = radians(b.latitude - a.latitude);
  const dLon = radians(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function detectPlace({ latitude, longitude, accuracy = 0 }) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180 || !Number.isFinite(accuracy) || accuracy < 0 || accuracy > 5000) return null;
  // Only choose a region when the entire accuracy circle is inside it.
  const matches = Object.entries(PLACES).filter(([, region]) => distanceKm({ latitude, longitude }, region) + accuracy / 1000 <= region.radiusKm);
  return matches.length === 1 ? matches[0][0] : null;
}

export function timeLabel(value) {
  if (!value || !Number.isFinite(Date.parse(value))) return '–';
  return new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' }).format(new Date(value));
}

export function dateLabel(value) {
  return new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Berlin' }).format(new Date(value));
}

export function departureLabel(journey, now = Date.now()) {
  if (journey.cancelled) return 'Fällt aus';
  const minutes = Math.ceil((Date.parse(journey.departure) - now) / 60_000);
  if (minutes < 0) return 'Abgefahren';
  if (minutes === 0) return 'Jetzt';
  return minutes < 60 ? `In ${minutes} Min.` : `In ${Math.floor(minutes / 60)} Std. ${minutes % 60} Min.`;
}

export function isStale(fetchedAt, now = Date.now()) {
  const fetched = Date.parse(fetchedAt);
  return !Number.isFinite(fetched) || now - fetched > STALE_MS;
}
