# Entwicklung und Validierung

Das Hauptprodukt ist die Home Assistant OS App unter `bahnometer/`. Node.js auf einem Entwicklerrechner ist nur für Entwicklung erforderlich, nicht für die HA-OS-Installation.

```sh
cd bahnometer
npm ci --ignore-scripts
npm test
npm run test:e2e
```

Node.js >=22 und Chromium sind erforderlich. Die Browsertests verwenden `/usr/bin/chromium`, alternativ `CHROMIUM_PATH` setzen. Für einen isolierten Entwicklungsserver im selben Verzeichnis `npm start` verwenden (Port 3000). Im HA-Container startet dagegen `node addon.js` auf Port 8099 mit Ingress-Zugriffsschutz.

## Aufbau

```text
repository.yaml          Erkennung als HA-App-Repository
README.md                Installation und Bedienung
bahnometer/
  config.yaml            HA-Metadaten und Optionsschema
  Dockerfile             Multiarch-Container
  addon.js               Supervisor-Optionen und Serverstart
  DOCS.md                App-Store-Dokumentation
  CHANGELOG.md           Versionshistorie
  translations/de.yaml   Optionsbeschreibungen
  lib/ public/ server.js Anwendung und Datenquellen
  test/                  Unit-, HTTP-, Browser-/Ingress-Tests
```

## Container bauen

Vom Repository-Stamm:

```sh
docker build --build-arg BUILD_ARCH=amd64 --build-arg BUILD_VERSION=2.0.0 -t bahnometer-ha:2.0.0-amd64 bahnometer
docker build --platform linux/arm64 --build-arg BUILD_ARCH=aarch64 --build-arg BUILD_VERSION=2.0.0 -t bahnometer-ha:2.0.0-aarch64 bahnometer
```

Der feste offizielle Node-24-Image-Digest enthält beide Architekturen. Die Installation läuft auf der Build-Architektur, die Laufzeitbasis entspricht der Zielplattform. Produktionsabhängigkeiten sind JavaScript/Daten; Installationsskripte sind deaktiviert. Das ARM64-Image kann deshalb ohne ARM-Emulation gebaut werden. Das belegt nicht seine Ausführung auf physischer ARM-Hardware.

Zur lokalen Container-Ausführung `/data/options.json` bereitstellen, z.B. `{"data_source":"transitous","default_origin":"home"}`. Supervisor erstellt die Datei als root mit 0600. Nach dem Lesen läuft der Server als UID/GID 1000. Fehlende oder ungültige Optionen führen zum sichtbaren Startfehler.

UI/API-Zugriffe sind nur von `172.30.32.2` (Supervisor-Ingress) erlaubt; `/api/health` zusätzlich von Loopback. Ein Port-Mapping auf den Entwicklerhost allein reicht daher nicht zum funktionalen Test. `test/ingress-proxy.js` bildet Unterpfad und same-origin-iframe lokal nach. Er bietet keine Authentifizierung und wird nicht ins Produktionsimage kopiert.

In einer proxied Cloud beim Build optional `--secret id=proxy_ca,src="$CODEX_PROXY_CERT"` ergänzen. Der optionale BuildKit-Mount erweitert nur für npm die CA-Vertrauenskette; das Zertifikat wird nicht ins Image kopiert. Bei einem Container-Test eine benötigte Proxy-CA read-only mounten und `NODE_EXTRA_CA_CERTS` setzen. TLS-Prüfung bleibt aktiv. Normales HA OS benötigt diese Cloud-Optionen nicht.

## Prüfumfang

- Unit-/HTTP-Tests für HA-Optionen, Ingress-Quelladressen statt gefälschter Header, RE/RB und Aktualität.
- Browser: Mobil-/iPad-Ansicht, Standort, Refresh, Ausfälle, Offlinezustand, Quellenhinweise.
- HA-Ingress im same-origin-iframe: Assets, API, Optionen, Manifest und Worker bleiben unter `/api/hassio_ingress/.../`.
- Builds für AMD64/ARM64; AMD64-Laufzeittest mit root-eigenem 0600-Optionsfile, UID/GID 1000, schreibgeschütztem Anwendungscode, echtem Gateway-Quell-IP-Test, Browser-Demo und Neustart.

API-/Browsertests verwenden kontrollierte Daten. Bei Live-Tests zwischen Webserver-Health, erreichbarer Datenquelle und tatsächlich passenden Echtzeitverbindungen unterscheiden. `npm run check:live` prüft Transitous ausdrücklich live. Cloud-Netzwerkregeln gelten nicht automatisch auf einem privaten HA-Rechner. Eine physische HA-OS/Pi-5-Installation und ein zuverlässiger Live-Ausfallnachweis sind hier nicht bestätigt.
