import { readFile } from 'node:fs/promises';

export function validateAddonOptions(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Die Add-on-Konfiguration muss ein Objekt sein.');
  const options = { data_source: 'transitous', default_origin: 'home', ...value };
  if (Object.keys(options).some(key => !['data_source', 'default_origin'].includes(key))) throw new Error('Unbekannte Add-on-Option. Bitte die Home-Assistant-Konfiguration prüfen.');
  if (!['transitous', 'bahn', 'auto'].includes(options.data_source)) throw new Error('data_source muss transitous, bahn oder auto sein.');
  if (!['home', 'work'].includes(options.default_origin)) throw new Error('default_origin muss home oder work sein.');
  return options;
}

export async function readAddonOptions(path = '/data/options.json') {
  return validateAddonOptions(JSON.parse(await readFile(path, 'utf8')));
}
