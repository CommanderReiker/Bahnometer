import { createTransitousProvider } from '../lib/transitous.js';
import { createRailService } from '../lib/rail.js';
import { PLACES, opposite } from '../public/domain.js';

// Explicit manual live check, not part of the deterministic test suite.
const rail = createRailService(createTransitousProvider());
for (const origin of ['home', 'work']) {
  console.log(`${PLACES[origin].station} → ${PLACES[opposite(origin)].station}`);
  try {
    const data = await rail.getConnections(origin);
    console.log(`Quelle: ${data.source}`);
    console.log(`Passende Verbindungen: ${data.journeys.length}; mit Echtzeitprognose: ${data.journeys.filter(j => j.realtime).length}; Ausfälle: ${data.journeys.filter(j => j.cancelled).length}`);
    for (const journey of data.journeys.slice(0, 3)) console.log(`${journey.line} · Plan ${journey.plannedDeparture} · ${journey.cancelled ? 'Ausfall' : journey.realtime ? `Prognose ${journey.departure}` : 'keine Echtzeitprognose'}`);
    if (!data.journeys.length) process.exitCode = 1;
  } catch (error) {
    console.error(`${error.code || error.name}: ${error.message}`);
    process.exitCode = 1;
  }
}
