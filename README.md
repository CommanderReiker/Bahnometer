# Bahnometer für Home Assistant OS

Bahnometer ist eine **Home Assistant App (früher Add-on)** für den Raspberry Pi 5 und andere unterstützte HA-OS-Systeme. Der Webserver läuft auf dem Home-Assistant-Rechner; die Oberfläche öffnet sich über **Ingress direkt in Home Assistant**. Ein zusätzlicher Windows-/Mac-Server oder eine manuelle Node.js-Installation sind für die Nutzung nicht erforderlich.

Die App zeigt direkte **RE-/RB-Verbindungen zwischen Ingolstadt Hbf und Pfaffenhofen (Ilm)**. Verspätungen und gemeldete Ausfälle werden rot hervorgehoben. Standardquelle ist **Transitous**, weil die direkten Bahn-Zugänge durch `OPS_BLOCKED` gesperrt werden können.

Die Installation erfolgt über **Apps/Add-ons**, nicht „Geräte & Dienste“. Die App stellt eine Weboberfläche bereit; eigene HA-Sensoren oder Automationen sind noch nicht enthalten.

## Voraussetzungen

- Home Assistant OS auf dem **Raspberry Pi 5 mit 64 Bit (`aarch64`)** oder einem **x86-64-System (`amd64`)**.
- Aktueller Supervisor **ab 2026.04**, mit dem aktuellen Docker-/BuildKit-basierten App-Build.
- Administratorzugriff für die Installation und Internetzugang des HA-Systems für Container-Download, npm-Pakete und `api.transitous.org`.

## Installation: lokal über Samba

**Dieser Weg funktioniert auch mit einem privaten GitHub-Repository.** Das Repository war bei der Einrichtung ohne Anmeldung nicht erreichbar (HTTP 404). Home Assistant übernimmt deine GitHub-Anmeldung nicht automatisch. Lade die ZIP selbst angemeldet herunter und installiere die App lokal:

1. [Aktuelle Repository-ZIP herunterladen](https://github.com/CommanderReiker/Bahnometer/archive/refs/heads/main.zip) und auf deinem Computer entpacken.
2. In Home Assistant **Einstellungen → Apps → App installieren** öffnen. Bei älteren Versionen: **Einstellungen → Add-ons → Add-on-Store**.
3. Die offizielle App **Samba share** installieren, falls sie noch nicht vorhanden ist. In ihrer Konfiguration einen eigenen Benutzernamen und ein Passwort vergeben, die Freigabe **`local_apps`** aktivieren und Samba share starten. Das sind die Zugangsdaten für die Dateifreigabe, nicht deine HA-Anmeldung.
4. Die Freigabe auf dem Computer öffnen:
   - **Windows:** Im Explorer `\\IP-DEINES-HA\local_apps`, beispielsweise `\\192.168.178.50\local_apps`.
   - **macOS:** Finder → **Gehe zu → Mit Server verbinden**, dann `smb://IP-DEINES-HA/local_apps`.
   - Ältere Samba-Versionen verwenden den Namen **`addons`**. Aktuelle Versionen unterstützen auch diesen alten Namen.
5. **Nur den Unterordner `bahnometer`** aus der entpackten ZIP in die Freigabe kopieren:

   ```text
   local_apps/
   └── bahnometer/
       ├── config.yaml
       ├── Dockerfile
       ├── addon.js
       ├── package.json
       ├── lib/
       └── public/
   ```

   Die Datei muss direkt unter `local_apps/bahnometer/config.yaml` liegen. Nicht den ganzen äußeren Ordner `Bahnometer-main` kopieren. Ein `node_modules`-Ordner wird nicht benötigt.
6. Im HA-App-Store über **⋮ → Nach Updates suchen / Neu laden** aktualisieren. Bahnometer erscheint unter **Lokale Apps** bzw. **Lokale Add-ons**; gegebenenfalls die Store-Seite neu laden.
7. **Bahnometer → Installieren** öffnen. Der erste Build benötigt einige Minuten. Den Fortschritt in Home Assistant verfolgen.
8. Standardkonfiguration beibehalten oder unten anpassen. **Beim Booten starten**, **Watchdog** und optional **In der Seitenleiste anzeigen** aktivieren.
9. **Starten → Weboberfläche öffnen** wählen. Im Protokoll muss `Version 2.1.0 · Datenquelle: transitous` stehen.

Danach kann dein Computer ausgeschaltet bleiben. Samba wird nur zum Kopieren bzw. Aktualisieren der Dateien benötigt.

## Alternative: Repository-URL im Store

Wenn das Repository **öffentlich ohne GitHub-Anmeldung erreichbar** ist:

1. Den HA-App-Store öffnen, **⋮ → Repositories** wählen und die folgende URL hinzufügen:

   ```text
   https://github.com/CommanderReiker/Bahnometer
   ```

2. Den Store aktualisieren und **Bahnometer → Installieren** auswählen.
3. Autostart, Watchdog und optional Seitenleiste aktivieren; starten und **Weboberfläche öffnen**.

Ein privates Repository kann HA so nicht ohne zusätzliche Authentifizierung klonen. Dafür ist die lokale Installation beschrieben; du musst es nicht öffentlich machen.

## Konfiguration

In der Home-Assistant-App-Konfiguration:

```yaml
data_source: transitous
default_origin: home
```

| Option | Werte | Bedeutung |
| --- | --- | --- |
| `data_source` | `transitous` | Empfohlener Standard: offene Fahrplan- und Echtzeitdaten. |
| | `bahn` | Optionaler direkter Bahn-Zugang; kann gesperrt werden. |
| | `auto` | Bahn versuchen, bei erkannter Sperre zu Transitous wechseln. |
| `default_origin` | `home` | Ohne gültige gespeicherte Auswahl oder erkannten Standort ab Ingolstadt Hbf starten. |
| | `work` | Unter denselben Bedingungen ab Pfaffenhofen (Ilm) starten. |

Nach Änderungen **speichern und Bahnometer neu starten**. Eine im Browser gespeicherte manuelle Auswahl bzw. ein erkannter Standort hat Vorrang vor dem Standard.

## Optionaler direkter LAN-Zugriff

Ab Version **2.1.0** ist Container-Port `8099/tcp` standardmäßig auf Host-Port **8099** abgebildet. Auf einem Gerät im selben lokalen Netzwerk öffnen:

```text
http://IP-DEINES-HA:8099/
```

Beispiel: `http://192.168.178.50:8099/`. Kein Ingress-Pfadpräfix hinzufügen. Oberfläche, API, Ressourcen und Navigation funktionieren direkt ab `/`.

Unter **Einstellungen → Apps → Bahnometer → Konfiguration → Netzwerk** lässt sich der Host-Port ändern oder das Portfeld leeren, um den direkten Zugriff abzuschalten. Falls nötig „Deaktivierte Ports anzeigen“ einblenden. Speichern und App neu starten. Bei einem Update die Portzuordnung dort prüfen; Supervisor kann bestehende Netzwerk-Einstellungen beibehalten. Ist 8099 bereits belegt, einen anderen freien Host-Port verwenden und die URL entsprechend anpassen.

**Weboberfläche öffnen**, Seitenleiste und Ingress funktionieren weiterhin über die bestehende HA-Anmeldung. Der direkte LAN-Zugang verwendet HTTP und hat **keine HA-Anmeldung**; er ist für ein vertrauenswürdiges Heimnetz gedacht. Der Server akzeptiert dafür private/lokale Quelladressen und vertraut keinen weitergeleiteten IP-Headern. Keine Router-Portweiterleitung oder öffentliche Proxy-/Tunnel-Freigabe für 8099 einrichten: Ein vorgeschalteter Proxy kann die ursprüngliche Quelladresse verdecken. Die App richtet keine Internetfreigabe ein.

Über die direkte HTTP-LAN-Adresse stehen Browser-Standortabfrage und Service Worker in der Regel nicht zur Verfügung. Zuhause/Arbeit manuell auswählen; für Standorterkennung weiterhin den bestehenden HA-Zugang über HTTPS nutzen.

## Bedienung und Standort

- **Zuhause:** 15 km um Ingolstadt; Ingolstadt Hbf → Pfaffenhofen (Ilm).
- **Arbeit:** 10 km um Pfaffenhofen; Fahrt in die Gegenrichtung.
- Nur direkte RE/RB, keine ICE/IC, S-Bahn, Busse oder Umstiege.
- **Jetzt aktualisieren** fragt erneut ab. Bei sichtbarer App erfolgt zusätzlich alle **60 Sekunden** ein Abruf.
- Im Hintergrund pausiert die Browser-Aktualisierung. Der Server und HA-Watchdog laufen weiter, fragen aber keine Abfahrten dauerhaft ab.

Auf dem Telefon über die **Home-Assistant-Companion-App** oder die HA-Weboberfläche öffnen. Für automatische Browser-Standortfreigabe muss HA über **HTTPS** erreichbar sein und der Zugriff erlaubt werden. Eine unverschlüsselte LAN-IP reicht auf iOS nicht aus. Je nach Browser, eingebetteter Ansicht und Berechtigung kann die Standortabfrage verweigert werden; **Zuhause/Arbeit bleiben manuell wählbar**.

Ermittelt wird die Position des gerade verwendeten Geräts. Auf einem Desktop ist das nicht automatisch die Position deines Telefons. Die HA-Companion-`device_tracker` werden bisher nicht ausgelesen. Exakte Koordinaten bleiben im Browser; an den Server geht nur die Fahrtrichtung.

Ingress verwendet die vorhandene HA-Anmeldung und deren HTTPS-/Remote-Zugang. Die optionale LAN-Portfreigabe ist davon unabhängig und kann abgeschaltet werden. Für unterwegs deinen bereits eingerichteten sicheren HA-Zugang verwenden. Eine Ingress-Sitzungsadresse ist kein dauerhafter öffentlicher PWA-Link; empfohlen ist der Zugriff über HA.

## Datenqualität

Transitous liefert eine Abfahrtstafel mit Folgehalten. Die App prüft den tatsächlichen Zielhalt; Quelle und Quellenhinweise stehen sichtbar in der Oberfläche.

- **Rot:** gemeldete Verspätung oder Ausfall, einschließlich entfallenem Zielhalt.
- **Nur Fahrplan:** keine Echtzeitprognose; wird nicht als „pünktlich“ ausgegeben.
- **Unbestätigt/veraltet:** Abruffehler oder Abruf älter als 90 Sekunden. Vorhandene Daten bleiben ausdrücklich als alter Stand sichtbar.
- API-Antworten werden nicht vom Service Worker gespeichert. Offline entsteht keine scheinbar aktuelle Zugliste.
- Die Abrufzeit ist keine garantierte Aktualisierungszeit des Feeds. Kurzfristige Ausfälle können fehlen oder verspätet eintreffen.

Windows-Tests bestätigten erreichbare Transitous-Routen RE1/RB16 mit `realTime: true` und Folgehalte in der Abfahrtstafel. Das ersetzt keine vollständige Live-Prüfung auf deinem Pi.

Die Einbindung dient zunächst dem privaten Prototypentest. Für weitergehenden Betrieb gelten die [Transitous-Nutzungsbedingungen](https://transitous.org/api/): nicht kommerziell, Kontaktkennung und Attribution (umgesetzt), geeignete Open-Source-Lizenz vor weitergehender Veröffentlichung und Abstimmung bei relevanter oder ressourcenintensiver Nutzung. Es wurde ohne Nutzerentscheidung keine Lizenz für dieses Repository vergeben.

## Updates

**Repository-Installation:** Im Store nach Updates suchen und die neue Bahnometer-Version installieren. HA baut das neue Image; Einstellungen bleiben erhalten.

**Lokale Installation:** Bahnometer stoppen, den neuen `bahnometer`-Unterordner über Samba an derselben Stelle ersetzen und den Store neu laden. Bei neuer Versionsnummer aktualisieren; bei ersetzt angepasstem Quellstand mit gleicher Version **Neu bauen / Rebuild** verwenden. Anschließend starten und Version im Protokoll prüfen. Home Assistants `/data`-Konfiguration nicht ersetzen.

## Weitere Dokumentation

- [App-Dokumentation und Fehlerbehebung](bahnometer/DOCS.md)
- [Änderungsprotokoll](bahnometer/CHANGELOG.md)
- [Entwicklung und Container-Tests](DEVELOPMENT.md)

Getestet sind Unit-/Browsertests einschließlich HA-Ingress-iframe sowie Container-Builds für AMD64 und ARM64. Der AMD64-Container wurde mit privater Supervisor-Konfiguration, Ingress-Gateway, Neustart und nicht privilegiertem Webprozess geprüft. **Eine Installation auf einem echten HA-OS/Pi-5-System wurde hier noch nicht ausgeführt.**
