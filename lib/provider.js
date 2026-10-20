import { createClient } from 'db-vendo-client';
import { profile as webProfile } from 'db-vendo-client/p/dbweb/index.js';
import { profile as navigatorProfile } from 'db-vendo-client/p/dbnav/index.js';
import { parseLine } from 'db-vendo-client/parse/line.js';

export function parseBahnLine(context, raw) {
  const line = parseLine(context, raw);
  const transport = raw.verkehrsmittel || raw.verkehrmittel;
  // DB's name can be just "59410"; mittelText contains the actual line "RE1".
  const label = transport?.mittelText || transport?.langText;
  const match = typeof label === 'string' && label.match(/^(RE|RB)\s*(\d+[a-z]?)(?=\s|\(|$)/i);
  if (match) line.name = `${match[1].toUpperCase()} ${match[2]}`;
  return line;
}

export function createBahnProvider({ clientFactory = createClient, mode = process.env.BAHN_PROFILE || 'auto', clock = Date.now } = {}) {
  if (!['auto', 'dbweb', 'dbnav'].includes(mode)) throw new Error('BAHN_PROFILE muss auto, dbweb oder dbnav sein.');
  const clients = {};
  for (const [name, profile] of Object.entries({ dbweb: webProfile, dbnav: navigatorProfile })) {
    clients[name] = clientFactory({
      ...profile, parseLine: parseBahnLine,
      // Preserve the environment's proxy and CA trust, with one shared deadline.
      transformReq: (context, request) => ({ ...request, signal: context.opt.signal }),
    }, 'Bahnometer/1.0 (https://github.com/CommanderReiker/Bahnometer)', { enrichStations: false });
  }
  let webBlockedUntil = 0;
  const query = async (profile, from, to, options) => ({
    ...await clients[profile].journeys(from, to, options),
    source: profile === 'dbnav' ? 'Deutsche Bahn · DB Navigator' : 'Deutsche Bahn · bahn.de',
  });
  return {
    async journeys(from, to, options) {
      const settings = { ...options, signal: AbortSignal.timeout(16_000) };
      const selected = mode === 'auto' ? clock() < webBlockedUntil ? 'dbnav' : 'dbweb' : mode;
      try {
        try {
          return await query(selected, from, to, settings);
        } catch (error) {
          if (mode !== 'auto' || selected !== 'dbweb' || error.response?.status !== 403) throw error;
          // Retry once through the other DB interface, then avoid repeatedly
          // calling the blocked interface. No cached train data is used.
          webBlockedUntil = clock() + 10 * 60_000;
          return await query('dbnav', from, to, settings);
        }
      } catch (error) {
        if (error.response?.status === 403) throw Object.assign(new Error('Die Bahn blockiert den Datenabruf von diesem Internetzugang.'), { code: 'BAHN_ACCESS_BLOCKED', cause: error });
        throw error;
      }
    },
  };
}
