// Explicit, opt-in presentation data. Never used as a fallback for a failed API call.
export function demoConnections(origin) {
  const base = Date.now();
  const iso = minutes => new Date(base + minutes * 60_000).toISOString();
  const trains = [
    { line: 'RE 1', minutes: 8, delay: 7, arrivalDelay: 7, duration: 23, platform: '4', realtime: true },
    { line: 'RB 16', minutes: 24, delay: 0, arrivalDelay: 0, duration: 28, platform: '3', cancelled: true, realtime: true },
    { line: 'RB 16', minutes: 42, delay: 0, arrivalDelay: 0, duration: 28, platform: '3', realtime: true },
    { line: 'RE 1', minutes: 68, delay: null, arrivalDelay: null, duration: 23, platform: '4', realtime: false },
  ];
  return {
    origin, destination: origin === 'home' ? 'work' : 'home', fetchedAt: new Date(base).toISOString(), sourceUpdatedAt: null,
    source: 'Beispieldaten · keine echten Abfahrten', refreshAfterSeconds: 60,
    journeys: trains.map((train, index) => ({
      id: `demo-${origin}-${index}`, line: train.line, direction: origin === 'home' ? 'München Hbf' : 'Nürnberg Hbf',
      plannedDeparture: iso(train.minutes), departure: train.cancelled ? null : iso(train.minutes + (train.delay || 0)),
      plannedArrival: iso(train.minutes + train.duration), arrival: train.cancelled ? null : iso(train.minutes + train.duration + (train.arrivalDelay || 0)),
      departureDelay: train.delay === null ? null : train.delay * 60,
      arrivalDelay: train.arrivalDelay === null ? null : train.arrivalDelay * 60,
      departureDelayMinutes: train.delay, arrivalDelayMinutes: train.arrivalDelay,
      cancelled: Boolean(train.cancelled), realtime: train.realtime,
      platform: train.cancelled ? null : train.platform, plannedPlatform: train.platform,
      platformChanged: false, durationMinutes: train.duration,
      remarks: train.cancelled ? ['Beispielmeldung: Dieser Zug fällt heute aus. Bitte eine andere Verbindung wählen.'] : [],
    })),
  };
}
