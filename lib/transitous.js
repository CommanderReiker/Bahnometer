import fetch from 'cross-fetch';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { distanceKm } from '../public/domain.js';

const STATIONS = {
  '8000183': { name: 'Ingolstadt Hbf', latitude: 48.744538, longitude: 11.437335, match: 'ingolstadthbf', transitousId: 'de-DELFI_de:09161:9000_G' },
  '8004781': { name: 'Pfaffenhofen (Ilm)', latitude: 48.522432, longitude: 11.511883, match: 'pfaffenhofenilm', transitousId: 'de-DELFI_de:09186:8134' },
};
const dateValid = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const canonical = value => String(value || '').toLowerCase().replace(/hauptbahnhof/g, 'hbf').replace(/[^a-z0-9]/g, '').replace(/pfaffenhofenadilm/g, 'pfaffenhofenilm');

function matchesStation(place, station) {
  if (!place || !Number.isFinite(place.lat) || !Number.isFinite(place.lon)) return false;
  return canonical(place.name).includes(station.match) && distanceKm(station, { latitude: place.lat, longitude: place.lon }) < 0.8;
}

export function parseTransitousBoard(data, fromId, toId) {
  if (!Array.isArray(data?.stopTimes)) throw Object.assign(new Error('Transitous liefert keine gültige Abfahrtstafel.'), { code: 'TRANSITOUS_UNAVAILABLE' });
  const from = STATIONS[fromId];
  const to = STATIONS[toId];
  if (!from || !to || fromId === toId) throw new Error('INVALID_STATIONS');
  const journeys = [];
  let incomplete = false;
  for (const train of data.stopTimes) {
    const line = train.routeShortName || train.displayName || '';
    if (!['RAIL', 'REGIONAL_FAST_RAIL', 'REGIONAL_RAIL'].includes(train.mode) || !/^(RE|RB)(?=\s|\d|$)/i.test(line) || !matchesStation(train.place, from)) continue;
    if (!Array.isArray(train.nextStops)) { incomplete = true; continue; }
    // A matching line number or headsign alone does not prove it stops at the destination.
    const destination = train.nextStops.find(stop => matchesStation(stop, to));
    if (!destination) continue;
    const plannedDeparture = train.place.scheduledDeparture;
    const plannedArrival = destination.scheduledArrival;
    if (!dateValid(plannedDeparture) || !dateValid(plannedArrival)) { incomplete = true; continue; }
    const realtime = train.realTime === true;
    const departure = realtime && dateValid(train.place.departure) ? train.place.departure : plannedDeparture;
    const arrival = realtime && dateValid(destination.arrival) ? destination.arrival : plannedArrival;
    const cancelled = Boolean(train.cancelled || train.tripCancelled || train.place.cancelled || destination.cancelled);
    journeys.push({ legs: [{
      tripId: train.tripId, line: { name: line, mode: 'train' }, direction: train.headsign || train.tripTo?.name || to.name,
      origin: { id: fromId, name: from.name }, destination: { id: toId, name: to.name },
      plannedDeparture, plannedArrival, departure: cancelled ? null : departure, arrival: cancelled ? null : arrival,
      departureDelay: realtime && dateValid(train.place.departure) ? (Date.parse(departure) - Date.parse(plannedDeparture)) / 1000 : null,
      arrivalDelay: realtime && dateValid(destination.arrival) ? (Date.parse(arrival) - Date.parse(plannedArrival)) / 1000 : null,
      cancelled,
      departurePlatform: train.place.track || train.place.scheduledTrack,
      plannedDeparturePlatform: train.place.scheduledTrack,
      remarks: [...(train.place.alerts || []), ...(destination.alerts || [])].map(alert => ({ text: [alert.headerText, alert.descriptionText].filter(Boolean).join(' · ') })).filter(remark => remark.text),
    }] });
  }
  if (!journeys.length && incomplete) throw Object.assign(new Error('Transitous liefert für diese Züge noch keine vollständigen Folgehalte oder Ankunftszeiten.'), { code: 'TRANSITOUS_UNAVAILABLE' });
  return { journeys, source: 'Transitous · DELFI / offene Verkehrsdaten', attribution: 'transitous' };
}

export function createTransitousProvider({ fetchImpl = fetch, proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY } = {}) {
  const agent = proxy ? new HttpsProxyAgent(proxy, { ALPNProtocols: ['http/1.1'] }) : undefined;
  return {
    async journeys(from, to, options = {}) {
      const station = STATIONS[from];
      if (!station || !STATIONS[to]) throw new Error('INVALID_STATIONS');
      const url = new URL('https://api.transitous.org/api/v6/stoptimes');
      url.search = new URLSearchParams({
        stopId: station.transitousId, center: `${station.latitude},${station.longitude}`, radius: '200',
        fetchStops: 'true', n: '30', window: '7200', realtimeMode: 'REALTIME_ANNOTATION_ONLY',
        time: new Date(options.departure || Date.now()).toISOString(),
      }).toString();
      for (const mode of ['RAIL', 'REGIONAL_FAST_RAIL', 'REGIONAL_RAIL']) url.searchParams.append('mode', mode);
      try {
        const response = await fetchImpl(url, {
          agent, signal: options.signal || AbortSignal.timeout(16_000),
          headers: { Accept: 'application/json', 'User-Agent': 'Bahnometer/1.0 (https://github.com/CommanderReiker/Bahnometer)', 'Accept-Language': 'de' },
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return parseTransitousBoard(await response.json(), from, to);
      } catch (error) {
        if (error.code === 'TRANSITOUS_UNAVAILABLE') throw error;
        throw Object.assign(new Error(`Transitous ist gerade nicht erreichbar (${error.message}).`), { code: 'TRANSITOUS_UNAVAILABLE', cause: error });
      }
    },
  };
}
