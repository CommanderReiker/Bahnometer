import { createBahnProvider } from './provider.js';
import { createTransitousProvider } from './transitous.js';

export function createDataProvider({ mode = process.env.RAIL_PROVIDER || 'transitous', bahn, transitous, clock = Date.now } = {}) {
  if (!['auto', 'bahn', 'transitous'].includes(mode)) throw new Error('RAIL_PROVIDER muss auto, bahn oder transitous sein.');
  bahn ??= createBahnProvider();
  transitous ??= createTransitousProvider();
  let useTransitousUntil = 0;
  return {
    async journeys(from, to, options) {
      const settings = { ...options, signal: AbortSignal.timeout(17_000) };
      if (mode === 'transitous' || (mode === 'auto' && clock() < useTransitousUntil)) return transitous.journeys(from, to, settings);
      try { return await bahn.journeys(from, to, settings); }
      catch (error) {
        if (mode !== 'auto' || error.code !== 'BAHN_ACCESS_BLOCKED') throw error;
        useTransitousUntil = clock() + 10 * 60_000;
        return transitous.journeys(from, to, settings);
      }
    },
  };
}
