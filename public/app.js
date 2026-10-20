import { PLACES, opposite, REFRESH_MS, detectPlace, timeLabel, dateLabel, departureLabel, isStale } from './domain.js';
import { demoConnections } from './demo.js';

const $ = id => document.getElementById(id);
const icon = name => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const escape = text => String(text ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const storage = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* Private browsing can disable storage. */ } },
};
const savedOrigin = storage.get('bahnometer.origin');
const state = {
  origin: ['home', 'work'].includes(savedOrigin) ? savedOrigin : 'home',
  locationMode: storage.get('bahnometer.locationMode') === 'manual' ? 'manual' : 'auto',
  data: null, error: null, loading: false, nextRefreshAt: Date.now() + REFRESH_MS,
  requestId: 0, locationId: 0, controller: null, demo: new URLSearchParams(location.search).get('demo') === '1',
  renderedUnconfirmed: null, firstJourneyId: null,
};

function selectOrigin(origin, { manual = true, refresh = true } = {}) {
  if (manual) {
    state.locationMode = 'manual';
    state.locationId++;
    storage.set('bahnometer.locationMode', 'manual');
    $('location-status').textContent = 'Startort manuell gewählt. Mit Standort automatisch erkennen.';
    $('locate').disabled = false;
  }
  const changed = state.origin !== origin;
  state.origin = origin;
  storage.set('bahnometer.origin', origin);
  if (changed) {
    state.controller?.abort();
    state.requestId++;
    state.loading = false;
    state.data = null;
    state.error = null;
  }
  updateRoute();
  if (refresh) refreshConnections();
}

function updateRoute() {
  for (const origin of ['home', 'work']) $(origin).setAttribute('aria-pressed', String(origin === state.origin));
  $('from-station').textContent = PLACES[state.origin].station;
  $('to-station').textContent = PLACES[opposite(state.origin)].station;
  $('map-from').textContent = PLACES[state.origin].label;
  $('map-to').textContent = PLACES[opposite(state.origin)].label;
  $('departures-title').textContent = `Die nächsten Verbindungen`;
  render();
}

async function locate({ quiet = false } = {}) {
  const locationId = ++state.locationId;
  if (!navigator.geolocation || !window.isSecureContext) {
    $('location-status').textContent = 'Standort benötigt HTTPS und Standortfreigabe. Bitte Startort manuell wählen.';
    return;
  }
  $('locate').disabled = true;
  if (!quiet) $('location-status').textContent = 'Dein Standort wird auf diesem Gerät geprüft …';
  try {
    const position = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false, maximumAge: 30_000, timeout: 10_000,
    }));
    if (locationId !== state.locationId) return;
    const origin = detectPlace(position.coords);
    if (!origin) {
      $('location-status').textContent = 'Außerhalb der beiden Regionen oder Standort zu ungenau. Bitte Startort manuell wählen.';
      return;
    }
    state.locationMode = 'auto';
    storage.set('bahnometer.locationMode', 'auto');
    const changed = state.origin !== origin;
    selectOrigin(origin, { manual: false, refresh: changed });
    $('location-status').textContent = `${PLACES[origin].label} erkannt · Raum ${PLACES[origin].city}. Dein genauer Standort bleibt auf diesem Gerät.`;
  } catch (error) {
    if (locationId !== state.locationId) return;
    $('location-status').textContent = error.code === 1 ? 'Standort nicht freigegeben. Bitte Zuhause oder Arbeit manuell wählen.' : 'Standort gerade nicht verfügbar. Bitte Startort manuell wählen.';
  } finally {
    if (locationId === state.locationId) $('locate').disabled = false;
  }
}

async function refreshConnections() {
  if (state.loading || document.hidden) return;
  const requestId = ++state.requestId;
  const origin = state.origin;
  state.loading = true;
  const controller = new AbortController();
  state.controller = controller;
  const timeout = setTimeout(() => controller.abort(), 20_000);
  render();
  try {
    let data;
    if (state.demo) {
      data = demoConnections(origin);
    } else {
      const response = await fetch(`/api/connections?origin=${origin}`, { cache: 'no-store', signal: controller.signal, headers: { Accept: 'application/json' } });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || 'Aktuelle Bahn-Daten konnten nicht geladen werden.');
      data = body;
    }
    if (requestId !== state.requestId) return;
    if (!Array.isArray(data?.journeys) || data.origin !== origin || !Number.isFinite(Date.parse(data.fetchedAt))) throw new Error('Die Antwort der Datenquelle ist unvollständig. Bitte erneut versuchen.');
    state.data = data;
    state.error = null;
  } catch (error) {
    if (requestId !== state.requestId) return;
    state.error = error.name === 'AbortError' ? 'Die Abfrage hat zu lange gedauert. Bitte erneut aktualisieren.' : error.message || 'Keine Verbindung. Bitte Internetzugang prüfen.';
  } finally {
    clearTimeout(timeout);
    if (requestId === state.requestId) {
      state.loading = false;
      state.nextRefreshAt = Date.now() + REFRESH_MS;
      render();
    }
  }
}

function unconfirmed() { return Boolean(state.error || (state.data && isStale(state.data.fetchedAt))); }

function visibleJourneys() {
  return (state.data?.journeys || []).filter(journey => Date.parse(journey.departure || journey.plannedDeparture) >= Date.now() - (journey.cancelled ? 120_000 : 30_000));
}

function journeyMarkup(journey, index, firstId) {
  const delayed = journey.departureDelayMinutes > 0;
  const arrivalDelayed = journey.arrivalDelayMinutes > 0;
  const uncertain = unconfirmed();
  const next = !uncertain && !journey.cancelled && journey.id === firstId;
  let status, statusIcon, statusClass;
  if (journey.cancelled) { status = uncertain ? 'Ausfall gemeldet · unbestätigter Stand' : 'Zug fällt aus'; statusIcon = 'cross'; statusClass = 'delay'; }
  else if (uncertain) { status = 'Alter Stand · aktuell nicht bestätigt'; statusIcon = 'alert'; statusClass = 'delay'; }
  else if (delayed || arrivalDelayed) {
    status = [delayed ? `Abfahrt +${journey.departureDelayMinutes} Min.` : null, arrivalDelayed ? `Ankunft +${journey.arrivalDelayMinutes} Min.` : null].filter(Boolean).join(' · ');
    statusIcon = 'clock'; statusClass = 'delay';
  }
  else if (journey.realtime) { status = journey.departureDelayMinutes < 0 ? `${Math.abs(journey.departureDelayMinutes)} Min. früher · Prognose` : 'Pünktlich · Prognose'; statusIcon = 'check'; statusClass = ''; }
  else { status = 'Nur Fahrplan · keine Echtzeitprognose'; statusIcon = 'info'; statusClass = 'unknown'; }
  const from = PLACES[state.origin];
  const to = PLACES[opposite(state.origin)];
  const departure = journey.departure || journey.plannedDeparture;
  const arrival = journey.arrival || journey.plannedArrival;
  const nextDay = dateLabel(departure) !== dateLabel(new Date().toISOString());
  const arrivalNextDay = dateLabel(arrival) !== dateLabel(departure);
  const changedDeparture = !journey.cancelled && journey.departureDelayMinutes !== null && journey.departureDelayMinutes !== 0;
  const changedArrival = !journey.cancelled && journey.arrivalDelayMinutes !== null && journey.arrivalDelayMinutes !== 0;
  return `<article class="journey-card card ${next ? 'next' : ''} ${journey.cancelled ? 'cancelled' : ''} ${delayed ? 'delayed' : ''} ${arrivalDelayed ? 'arrival-delayed' : ''}" aria-label="${escape(journey.line)} ${timeLabel(journey.plannedDeparture)} ${escape(status)}">
    <div class="journey-top"><div class="line-info"><span class="train-badge">${icon('train')}${escape(journey.line)}</span><span class="train-direction">Richtung ${escape(journey.direction)}</span></div>${next ? '<span class="next-label">DEIN NÄCHSTER ZUG</span>' : ''}</div>
    <div class="journey-times"><div><div class="time-block">${changedDeparture ? `<span class="planned-time" aria-label="Geplant ${timeLabel(journey.plannedDeparture)}">${timeLabel(journey.plannedDeparture)}</span>` : ''}<time class="departure-time" datetime="${escape(departure)}">${timeLabel(departure)}</time></div><span class="time-station">${escape(from.station)}</span>${nextDay ? `<span class="next-day">${dateLabel(departure)}</span>` : ''}</div>
      <div class="journey-track"><span>${journey.durationMinutes} Min.</span><div class="journey-track-line"><span></span></div><span>direkt</span></div>
      <div><div class="time-block">${changedArrival ? `<span class="planned-time" aria-label="Geplant ${timeLabel(journey.plannedArrival)}">${timeLabel(journey.plannedArrival)}</span>` : ''}<time class="arrival-time" datetime="${escape(arrival)}">${timeLabel(arrival)}</time>${arrivalNextDay ? '<span class="date-suffix">+1 Tag</span>' : ''}</div><span class="time-station">${escape(to.station)}</span></div>
      <div class="journey-aside"><span class="countdown" data-countdown="${index}">${uncertain && !journey.cancelled ? 'Unbestätigt' : departureLabel(journey)}</span><p class="platform ${journey.platformChanged ? 'changed' : ''}">${journey.cancelled ? 'Keine Abfahrt' : journey.platform ? `Gleis ${escape(journey.platform)}${journey.platformChanged ? ' · geändert' : ''}` : 'Gleis offen'}</p></div></div>
    <div class="journey-bottom"><span class="journey-status ${statusClass}">${icon(statusIcon)}${escape(status)}</span><span class="direct-note">${state.demo ? 'BEISPIELDATEN' : 'Ohne Umstieg'}</span></div>
    ${journey.remarks?.length ? `<details class="remarks"><summary>Hinweise zur Verbindung (${journey.remarks.length})</summary>${journey.remarks.map(remark => `<p>${escape(remark)}</p>`).join('')}</details>` : ''}
  </article>`;
}

function renderList() {
  const list = $('journey-list');
  list.classList.toggle('unconfirmed', unconfirmed());
  list.setAttribute('aria-busy', String(state.loading));
  if (!state.data) {
    list.innerHTML = state.error
      ? `<div class="state-card card error">${icon('alert')}<h3>Gerade keine aktuellen Bahn-Daten</h3><p>${escape(state.error)}</p><button class="primary-button" data-action="refresh">${icon('refresh')}Erneut versuchen</button><button class="text-button" data-action="demo">Ansicht mit Beispieldaten testen ↗</button></div>`
      : `<div class="state-card card"><span class="loading-ring"></span><h3>Deine Verbindungen werden geladen</h3><p>Wir fragen die aktuellen Bahn-Daten ab.</p></div>`;
    return;
  }
  const journeys = visibleJourneys();
  const firstId = journeys.find(journey => !journey.cancelled && Date.parse(journey.departure) >= Date.now())?.id;
  state.firstJourneyId = firstId;
  state.renderedUnconfirmed = unconfirmed();
  list.innerHTML = journeys.length
    ? journeys.map((journey, index) => journeyMarkup(journey, index, firstId)).join('')
    : `<div class="state-card card">${icon('train')}<h3>Keine passenden Verbindungen gefunden</h3><p>${unconfirmed() ? 'Der letzte Abruf ist nicht mehr bestätigt. Bitte erneut aktualisieren.' : 'Die Bahn meldet im abgefragten Zeitraum keine direkten RE- oder RB-Verbindungen auf dieser Strecke.'}</p><button class="text-button" data-action="refresh">Noch einmal aktualisieren ↗</button></div>`;
}

function updateFreshness() {
  const uncertain = unconfirmed();
  const fresh = $('freshness');
  fresh.className = `freshness ${state.error || uncertain ? 'error' : !state.data || state.demo ? 'pending' : ''}`;
  $('freshness-label').textContent = state.demo ? 'Beispieldaten · keine Live-Daten' : state.error ? 'Abruf fehlgeschlagen' : uncertain ? 'Daten veraltet' : state.loading ? 'Daten werden abgefragt' : state.data ? 'Neu von der Bahn abgerufen' : 'Daten werden geladen';
  $('compact-status').textContent = `${state.demo ? 'BEISPIELDATEN' : state.error ? 'Abruf fehlgeschlagen' : uncertain ? 'Daten veraltet' : state.loading ? 'Wird aktualisiert …' : 'Zuletzt abgerufen'}${state.data ? ` · ${timeLabel(state.data.fetchedAt)} Uhr` : ''}`;
  $('compact-status').classList.toggle('error', Boolean(uncertain));
  $('last-success').textContent = state.data ? `${dateLabel(state.data.fetchedAt)} · ${new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Europe/Berlin' }).format(new Date(state.data.fetchedAt))} Uhr` : 'Noch kein Abruf';
  const seconds = Math.max(0, Math.ceil((state.nextRefreshAt - Date.now()) / 1000));
  $('refresh-countdown').textContent = document.hidden ? 'Pausiert, solange die App im Hintergrund ist' : state.loading ? 'Aktuelle Verbindung wird angefragt …' : `Nächster ${state.demo ? 'Demo-' : ''}Abruf in ${seconds} Sek.`;
  const notice = $('request-notice');
  notice.hidden = !uncertain;
  if (uncertain) notice.innerHTML = `${icon('alert')}<span>${escape(state.error || 'Der letzte erfolgreiche Abruf ist älter als 90 Sekunden.')} ${state.data ? 'Die angezeigten Verbindungen sind nicht aktuell bestätigt.' : ''}</span>`;
}

function render() {
  $('refresh').disabled = state.loading;
  $('quick-refresh').disabled = state.loading;
  $('refresh').querySelector('span').textContent = state.loading ? 'Wird aktualisiert …' : 'Jetzt aktualisieren';
  $('demo-banner').hidden = !state.demo;
  renderList();
  updateFreshness();
}

function setDemo(enabled) {
  state.controller?.abort();
  state.requestId++;
  state.demo = enabled;
  state.data = null;
  state.error = null;
  state.loading = false;
  const url = new URL(location.href);
  if (enabled) url.searchParams.set('demo', '1'); else url.searchParams.delete('demo');
  history.replaceState(null, '', url);
  refreshConnections();
}

for (const origin of ['home', 'work']) $(origin).addEventListener('click', () => selectOrigin(origin));
$('swap').addEventListener('click', () => selectOrigin(opposite(state.origin)));
$('refresh').addEventListener('click', refreshConnections);
$('quick-refresh').addEventListener('click', refreshConnections);
$('locate').addEventListener('click', () => locate());
$('enter-demo').addEventListener('click', () => setDemo(true));
$('exit-demo').addEventListener('click', () => setDemo(false));
$('journey-list').addEventListener('click', event => {
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (action === 'refresh') refreshConnections();
  if (action === 'demo') setDemo(true);
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    refreshConnections();
    if (state.locationMode === 'auto') locate({ quiet: true });
  }
  updateFreshness();
});
window.addEventListener('online', () => { if (!document.hidden) refreshConnections(); });
window.addEventListener('pageshow', event => { if (event.persisted) refreshConnections(); });

setInterval(() => {
  updateFreshness();
  if (document.hidden) return;
  const journeys = visibleJourneys();
  const firstId = journeys.find(journey => !journey.cancelled && Date.parse(journey.departure) >= Date.now())?.id;
  if (state.data && (state.renderedUnconfirmed !== unconfirmed() || firstId !== state.firstJourneyId || journeys.length !== $('journey-list').querySelectorAll('.journey-card').length)) renderList();
  document.querySelectorAll('[data-countdown]').forEach(element => {
    const journey = journeys[Number(element.dataset.countdown)];
    if (journey) element.textContent = unconfirmed() && !journey.cancelled ? 'Unbestätigt' : departureLabel(journey);
  });
  if (Date.now() >= state.nextRefreshAt && !state.loading) {
    refreshConnections();
    if (state.locationMode === 'auto') locate({ quiet: true });
  }
}, 1000);

updateRoute();
refreshConnections();
if (state.locationMode === 'auto' && !state.demo) locate();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => { /* App also works without offline support. */ });
