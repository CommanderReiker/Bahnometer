# Bahnometer

Eine mobile Web-App für direkte **RE- und RB-Verbindungen zwischen Ingolstadt Hbf und Pfaffenhofen (Ilm)**. Für iPhone und iPad gestaltet und zum Home-Bildschirm hinzufügbar.

## Starten

Voraussetzung: Node.js 22 oder neuer.

```sh
cd /workspace/Bahnometer
npm ci
npm start
```

Der Node-Server lauscht auf Port **3000** auf allen Interfaces. `PORT` kann den Port ändern. Für Entwicklung mit Server-Neustarts: `npm run dev`. Es gibt keinen separaten Frontend-Build. HTML, CSS und Browser-Module werden direkt ausgeliefert.

Auf einem eigenen Rechner verwendet man das jeweilige Checkout-Verzeichnis statt `/workspace/Bahnometer`. Die App benötigt einen laufenden Node-Server, kein rein statisches Hosting.

## Auf iPhone und iPad verwenden

1. Den Server hinter einer **HTTPS-Adresse** betreiben, zum Beispiel über einen Hostinganbieter mit Node-Unterstützung und TLS-Reverse-Proxy. Deployment und Domain sind in diesem Repository vorbereitet, aber noch nicht eingerichtet. Der Proxy leitet alle Pfade an denselben Node-Server weiter.
2. Die HTTPS-Adresse in Safari öffnen und den Standort freigeben. Alternativ Zuhause oder Arbeit manuell wählen.
3. In Safari über **Teilen → Zum Home-Bildschirm** hinzufügen.
4. Vor dem Losgehen **Aktualisieren** drücken. Bei sichtbarer App wird zusätzlich alle 60 Sekunden neu abgefragt. Beim Zurückkehren aus dem Hintergrund wird sofort erneut geladen.

Ein unverschlüsselter Zugriff über die LAN-IP eines Computers reicht für die Standortfreigabe auf iOS nicht aus. Laufende Hintergrundabfragen oder Push-Mitteilungen enthält diese Version nicht. Die App ist noch nicht auf einem physischen iOS-Gerät verifiziert; die mobilen Browsertests verwenden Chromium.

## Standort und Fahrtrichtung

| Erkannter Bereich | Startbahnhof | Zielbahnhof |
| --- | --- | --- |
| Zuhause: 15 km um Ingolstadt (48.7651, 11.4237) | Ingolstadt Hbf, EVA 8000183 | Pfaffenhofen (Ilm), EVA 8004781 |
| Arbeit: 10 km um Pfaffenhofen (48.5306, 11.5050) | Pfaffenhofen (Ilm), EVA 8004781 | Ingolstadt Hbf, EVA 8000183 |

Die Radien sind bewusst ein erster Standard für „Raum Ingolstadt“ und „Raum Pfaffenhofen“. Sie stehen in `public/domain.js`. Eine Position wird nur übernommen, wenn auch ihr gemeldeter Genauigkeitskreis in der Region liegt. Außerhalb, bei ungenauen Positionen oder ohne Freigabe bleibt die manuelle Wahl verfügbar. Manuell gewählte Fahrtrichtungen bleiben beim nächsten Öffnen erhalten; mit „Standort nutzen“ wird die automatische Erkennung wieder aktiviert.

Koordinaten werden ausschließlich im Browser ausgewertet und weder gespeichert noch zum Server geschickt. Der Server erhält nur `origin=home` oder `origin=work`. Die App lädt keine externen Schriften, Karten, Tracker oder Analysedienste.

## Bahn-Daten und Aktualität

Der Server verwendet [`db-vendo-client`](https://github.com/public-transport/db-vendo-client), zunächst Profil `dbweb`, und damit die **nicht offiziell freigegebene Web-Schnittstelle von bahn.de**:

```text
POST https://int.bahn.de/web/api/angebote/fahrplan
```

Bei HTTP 403 oder dem nicht standardisierten HTTP 466 (in der Bibliothek häufig nur „Unknown“) versucht der Server einmal das Bibliotheksprofil `dbnav` über `https://app.services-bahn.de/mob/angebote/fahrplan`. Danach bleibt er zehn Minuten bei diesem Zugang, statt den blockierten Web-Endpunkt jede Minute erneut aufzurufen. Auch dieser Zugang kann gesperrt sein; dann zeigen App und Server-Log den konkreten HTTP-Status und `OPS_BLOCKED`. `BAHN_PROFILE=auto` ist der Standard; mit `dbweb` oder `dbnav` lässt sich ein Profil fest auswählen. Der tatsächliche Zugang steht im API-Antwortfeld `source`.

Um auf einer vorhandenen Windows-Installation den alternativen Zugang direkt zu prüfen, zuerst den Server mit `Strg+C` beenden und dann in derselben PowerShell ausführen:

```powershell
$env:BAHN_PROFILE="dbnav"
npm.cmd start
```

Danach die Webseite erneut aktualisieren. Für die automatische Auswahl den Server wieder beenden, `Remove-Item Env:BAHN_PROFILE` ausführen und erneut starten. Eine Änderung des Profils garantiert keine Freischaltung durch die Bahn. Falls auch das direkte Navigator-Profil `OPS_BLOCKED` liefert, ist ein anderer freigegebener Datenzugang erforderlich; wiederholtes Neuinstallieren oder Abschalten der TLS-Prüfung hilft nicht.

Für beide Profile wird kein API-Schlüssel benötigt. Schnittstelle und Zugriff können sich ändern oder blockiert werden. Vor einem öffentlichen oder dauerhaften Betrieb sind die Nutzungsbedingungen der Datenquelle zu prüfen. Eine Alternative mit vertraglich zugesichertem Datenzugang kann hinter `createRailService()` eingebunden werden; die Oberfläche ist von der Datenquelle getrennt.

Die Suche erlaubt nur Regionalverkehr und keine Umstiege. Der Server prüft zusätzlich die Zugkategorie **RE/RB** sowie beide Stationskennungen. Die Bahn kann im Feld `name` nur eine Zugnummer liefern; Kategorie und Linienbezeichnung werden deshalb aus den separaten Feldern `kurzText` und `mittelText` ausgewertet. Andere regionale Zugmarken, ICE, IC, S-Bahn und Busse werden nicht angezeigt. Das Suchfenster beginnt 15 Minuten vor der aktuellen Zeit, damit verspätete Züge mit bereits vergangener Planabfahrt noch berücksichtigt werden. Es werden bis zu zehn passende Verbindungen aus den gelieferten Suchergebnissen dargestellt. Die Suche ist keine vollständige Bahnhofstafel; bereits aus dem Fahrplan entfernte Ausfälle können vom Anbieter fehlen.

- Jede neue Abfrage geht an die Bahn. Lediglich gleichzeitig laufende Abfragen derselben Richtung werden zusammengeführt; es gibt keinen abgeschlossenen Antwortcache.
- Der Anbieter liefert keinen verlässlichen Aktualisierungszeitpunkt seiner Prognosen. **„Zuletzt abgerufen“ zeigt unseren erfolgreichen Abruf**, nicht das Alter der zugrunde liegenden Bahn-Meldung. Eine minutengenaue Garantie ist nicht möglich.
- Verspätungen bei Abfahrt und Ankunft sowie gemeldete Ausfälle werden rot hervorgehoben. Plan- und Prognosezeiten bleiben unterscheidbar.
- Fehlende Echtzeitprognosen heißen **„Nur Fahrplan“**, nicht „pünktlich“.
- Fehler oder ein Abrufalter über 90 Sekunden kennzeichnen die Daten als **unbestätigt**. Vorhandene Verbindungen bleiben als alter Stand sichtbar; erfolgreiche Abrufzeit und Prognosen werden nicht erfunden.
- HTTP-Antworten der API sind `no-store`; der Service Worker speichert nur die App-Hülle. Offline werden keine gespeicherten Bahn-Antworten als aktuell ausgegeben.
- Eine globale Grenze von 20 API-Anfragen pro Minute und eine gemeinsame Anfragedeadline von 16 Sekunden einschließlich eines möglichen Profilwechsels schützen den kleinen privaten Server. Für viele gleichzeitige Nutzer wäre ein zentraler Aktualisierungsdienst mit abgestimmten Anbieterlimits erforderlich.

### Netzwerk in der Codex-Cloud

Die ausgehenden HTTPS-Verbindungen zu **`int.bahn.de`** und für das alternative Profil zu **`app.services-bahn.de`** müssen in den Umgebungseinstellungen zugelassen sein. Beide Domains stehen im Konfigurationsentwurf. Am 20.10.2026 lieferte der korrigierte Web-Zugang hier echte RE-/RB-Verbindungen; der alternative Zugang war zu diesem Zeitpunkt durch die Cloud-Netzwerkregel noch blockiert und ist live noch nicht bestätigt. Ein gespeicherter Entwurf allein ändert den laufenden Netzwerkzugriff nicht. Änderungen in den Umgebungseinstellungen prüfen und speichern, anschließend die Umgebung veröffentlichen.

Danach den betroffenen Abruf erneut ausführen:

```sh
curl --fail-with-body 'http://127.0.0.1:3000/api/connections?origin=home'
```

Der Client respektiert die vorhandenen `HTTPS_PROXY`-/`HTTP_PROXY`-Einstellungen und die CA-Vertrauenskette. TLS-Prüfung bleibt aktiviert.

## Ansicht mit Beispieldaten

Über **Gut zu wissen → Ansicht mit Beispieldaten testen** oder den URL-Parameter **`?demo=1`** lässt sich die Oberfläche ohne Bahnzugriff ansehen. Ein permanenter Banner und Markierungen an jeder Verbindung kennzeichnen den Demomodus. Fehler im Live-Modus aktivieren ihn niemals automatisch. „Live-Daten laden“ beendet die Demo und startet einen echten Abruf.

## Prüfungen

```sh
npm test
npm run test:e2e
```

Die Unit-/Serverprüfungen testen Standortgrenzen, Stationskennungen, die reale DB-Feldbelegung, RE/RB-Filter, Verspätungen, Ausfälle, fehlende Echtzeitdaten, frische Folgeabrufe, Profilwechsel bei HTTP 403 und die HTTP-Schnittstelle. Die neun Browsertests prüfen die mobile/iPad-Darstellung, beide Standorte, manuelle Richtung, einen neu gemeldeten Ausfall, Fehler und Wiederholung, alte Zeitstempel, automatische Abfragen und Offline-Verhalten des Service Workers. Die Tests verwenden ausdrücklich Testdaten und beweisen nicht die Erreichbarkeit oder Aktualität der echten Bahn-API auf einem anderen Internetzugang.

### Unter Windows aktualisieren

Bei einer ZIP-Installation den laufenden Server mit `Strg+C` beenden, die aktuelle ZIP von GitHub in einen neuen Ordner entpacken und dort PowerShell öffnen. Dann `npm.cmd ci` und `npm.cmd start` ausführen. Die vorhandene Node.js-Installation kann weiterverwendet werden. Den Browser anschließend neu laden. Eine auf dem eigenen Rechner gemeldete `OPS_BLOCKED`-Antwort kommt von der Bahn; die Netzwerkfreigaben der Codex-Cloud ändern diese lokale Sperre nicht.

Für die Browsertests wird ein Chromium benötigt. In dieser Umgebung liegt es unter `/usr/bin/chromium`. Bei abweichender Installation `CHROMIUM_PATH` setzen. Screenshots entstehen unter `test-results/` und sind nicht versioniert.
