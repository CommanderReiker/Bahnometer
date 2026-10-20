import { readAddonOptions } from './lib/addon-config.js';
import { startServer } from './server.js';

try {
  // Supervisor writes options.json as root with mode 0600. Read it before
  // dropping privileges; the web server itself does not need root or HA tokens.
  const options = await readAddonOptions();
  if (process.getuid?.() === 0) {
    process.setgid(1000);
    process.setuid(1000);
  }
  startServer({ port: 8099, ingressOnly: true, allowLan: true, dataSource: options.data_source, defaultOrigin: options.default_origin });
} catch (error) {
  console.error('Bahnometer konnte nicht starten:', error.message);
  process.exitCode = 1;
}
