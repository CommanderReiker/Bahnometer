import { createClient } from 'db-vendo-client';
import { profile } from 'db-vendo-client/p/dbweb/index.js';

export function createBahnProvider() {
  const client = createClient({
    ...profile,
    // The client honors HTTPS_PROXY and the machine's CA configuration.
    transformReq: (context, request) => ({ ...request, signal: context.opt.signal }),
  }, 'Bahnometer/1.0 (https://github.com/CommanderReiker/Bahnometer)', { enrichStations: false });
  return {
    journeys(from, to, options) {
      // One deadline for the whole search, including any library pagination requests.
      return client.journeys(from, to, { ...options, signal: AbortSignal.timeout(12_000) });
    },
  };
}
