import { PLACES, opposite } from '../public/domain.js';

export const REGIONAL_PRODUCTS = Object.freeze({ nationalExpress: false, national: false, regionalExpress: true, regional: true, suburban: false, bus: false, ferry: false, subway: false, tram: false, taxi: false });
const validDate = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const stationMatches = (station, id) => station?.id === id || station?.station?.id === id;
const cleanText = value => typeof value === 'string' ? value.replace(/<[^>]*>/g, '').slice(0, 1200) : '';

function delaySeconds(explicit, planned, actual) {
  if (Number.isFinite(explicit)) return explicit;
  if (validDate(actual) && validDate(planned) && actual !== planned) return (Date.parse(actual) - Date.parse(planned)) / 1000;
  return null;
}

export function normalizeJourneys(data, origin, now = Date.now()) {
  if (!Array.isArray(data?.journeys)) throw new Error('INVALID_PROVIDER_RESPONSE');
  const from = PLACES[origin];
  const to = PLACES[opposite(origin)];
  const connections = new Map();
  for (const journey of data.journeys) {
    if (!Array.isArray(journey.legs) || journey.legs.length !== 1) continue;
    const leg = journey.legs[0];
    const line = cleanText(leg.line?.name).trim();
    // A regional product alone also includes trains other than RE/RB.
    if (leg.walking || !/^(RE|RB)(?=\s|\d|$)/i.test(line) || (leg.line?.mode && leg.line.mode !== 'train')) continue;
    if (!stationMatches(leg.origin, from.stationId) || !stationMatches(leg.destination, to.stationId)) continue;
    const cancelled = Boolean(journey.cancelled || leg.cancelled || leg.origin?.cancelled || leg.destination?.cancelled);
    const plannedDeparture = leg.plannedDeparture;
    const plannedArrival = leg.plannedArrival;
    if (!validDate(plannedDeparture) || !validDate(plannedArrival)) continue;
    // Null actual times on a cancelled service must never turn it into an on-time train.
    const departure = cancelled ? null : validDate(leg.departure) ? leg.departure : plannedDeparture;
    const arrival = cancelled ? null : validDate(leg.arrival) ? leg.arrival : plannedArrival;
    if (Date.parse(cancelled ? plannedDeparture : departure) < now - (cancelled ? 120_000 : 30_000)) continue;
    const departureDelay = delaySeconds(leg.departureDelay, plannedDeparture, leg.departure);
    const arrivalDelay = delaySeconds(leg.arrivalDelay, plannedArrival, leg.arrival);
    const remarks = [...(journey.remarks || []), ...(leg.remarks || [])].map(remark => cleanText(remark.text || remark.summary)).filter(Boolean);
    const id = `${leg.tripId || line}:${plannedDeparture}`;
    const connection = {
      id, line, direction: cleanText(leg.direction) || to.station,
      plannedDeparture, departure, plannedArrival, arrival,
      departureDelay, arrivalDelay,
      departureDelayMinutes: departureDelay === null ? null : Math.ceil(departureDelay / 60),
      arrivalDelayMinutes: arrivalDelay === null ? null : Math.ceil(arrivalDelay / 60),
      realtime: departureDelay !== null,
      cancelled,
      platform: cancelled ? null : cleanText(leg.departurePlatform || leg.plannedDeparturePlatform) || null,
      plannedPlatform: cleanText(leg.plannedDeparturePlatform) || null,
      platformChanged: Boolean(leg.departurePlatform && leg.plannedDeparturePlatform && leg.departurePlatform !== leg.plannedDeparturePlatform),
      durationMinutes: Math.max(0, Math.round((Date.parse(arrival || plannedArrival) - Date.parse(departure || plannedDeparture)) / 60_000)),
      remarks: [...new Set(remarks)],
    };
    // If duplicate responses disagree, retain the cancellation rather than hiding it.
    if (!connections.get(id)?.cancelled) connections.set(id, connection);
  }
  return [...connections.values()].sort((a, b) => Date.parse(a.departure || a.plannedDeparture) - Date.parse(b.departure || b.plannedDeparture)).slice(0, 10);
}

export function createRailService(provider, { clock = Date.now } = {}) {
  // Coalesce concurrent requests only. Every subsequent refresh queries upstream again.
  const pending = new Map();
  return {
    async getConnections(origin) {
      if (!Object.hasOwn(PLACES, origin)) throw new Error('INVALID_ORIGIN');
      if (pending.has(origin)) return pending.get(origin);
      const operation = (async () => {
        const data = await provider.journeys(PLACES[origin].stationId, PLACES[opposite(origin)].stationId, {
          departure: new Date(clock() - 15 * 60_000), results: 10,
          transfers: 0, products: { ...REGIONAL_PRODUCTS },
          remarks: true, stopovers: true, tickets: false, polylines: false,
          notOnlyFastRoutes: true, language: 'de',
        });
        return {
          origin, destination: opposite(origin), fetchedAt: new Date(clock()).toISOString(),
          // DB does not expose a reliable timestamp for when its predictions were updated.
          sourceUpdatedAt: null,
          source: 'Deutsche Bahn · bahn.de', refreshAfterSeconds: 60,
          journeys: normalizeJourneys(data, origin, clock()),
        };
      })();
      pending.set(origin, operation);
      try { return await operation; } finally { pending.delete(origin); }
    },
  };
}
