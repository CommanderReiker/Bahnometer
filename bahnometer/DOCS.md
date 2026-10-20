# Bahnometer – Home Assistant App

## Installation

Bahnometer wird im HA-App-Store installiert und über „Weboberfläche öffnen“ oder den optionalen Seitenleisteneintrag geöffnet. „Beim Booten starten“ und „Watchdog“ aktivieren. Optional ist zusätzlich HTTP im LAN über Host-Port 8099 verfügbar.

Bei einem privaten Repository den Ordner `bahnometer` aus der GitHub-ZIP in die Samba-Freigabe `local_apps` (älter: `addons`) kopieren, sodass `local_apps/bahnometer/config.yaml` vorhanden ist. Store neu laden, unter „Lokale Apps“ installieren. Eine vollständige Anleitung steht in der [Repository-README](https://github.com/CommanderReiker/Bahnometer#readme).

Voraussetzungen: aktueller Supervisor ab 2026.04 und `aarch64` (Pi 5, 64 Bit) oder `amd64`. Kein Node.js auf dem HA-OS-Host installieren. Die App benötigt keine Supervisor-/HA-API-Berechtigungen, Host-Netzwerkfreigaben oder privilegierten Fähigkeiten.

## Konfiguration

```yaml
data_source: transitous
default_origin: home
```

- `data_source`: `transitous` wird empfohlen. `bahn` verwendet die direkten Bahn-Zugänge; `auto` versucht Bahn und wechselt bei einer erkannten Sperre zu Transitous.
- `default_origin`: `home` = Ingolstadt Hbf → Pfaffenhofen (Ilm), `work` = Gegenrichtung. Gilt ohne gültige gespeicherte Auswahl oder erkannten Standort.

Konfiguration speichern und App neu starten. Manuelle Browserauswahl und Standorterkennung haben Vorrang vor dem Standard.

## Optionaler direkter LAN-Zugriff

Ab Version **2.1.0** ist Container-Port `8099/tcp` standardmäßig auf Host-Port **8099** abgebildet. Auf einem Gerät im selben lokalen Netzwerk öffnen:

```text
http://IP-DEINES-HA:8099/
```

Beispiel: `http://192.168.178.50:8099/`. Kein Ingress-Pfadpräfix hinzufügen. Oberfläche, API, Ressourcen und Navigation funktionieren direkt ab `/`.

Unter **Einstellungen → Apps → Bahnometer → Konfiguration → Netzwerk** lässt sich der Host-Port ändern oder das Portfeld leeren, um den direkten Zugriff abzuschalten. Falls nötig „Deaktivierte Ports anzeigen“ einblenden. Speichern und App neu starten. Bei einem Update die Portzuordnung dort prüfen; Supervisor kann bestehende Netzwerk-Einstellungen beibehalten. Ist 8099 bereits belegt, einen anderen freien Host-Port verwenden und die URL entsprechend anpassen.

**Weboberfläche öffnen**, Seitenleiste und Ingress funktionieren weiterhin über die bestehende HA-Anmeldung. Der direkte LAN-Zugang verwendet HTTP und hat **keine HA-Anmeldung**; er ist für ein vertrauenswürdiges Heimnetz gedacht. Der Server akzeptiert dafür private/lokale Quelladressen und vertraut keinen weitergeleiteten IP-Headern. Keine Router-Portweiterleitung oder öffentliche Proxy-/Tunnel-Freigabe für 8099 einrichten: Ein vorgeschalteter Proxy kann die ursprüngliche Quelladresse verdecken. Die App richtet keine Internetfreigabe ein.

Über die direkte HTTP-LAN-Adresse stehen Browser-Standortabfrage und Service Worker in der Regel nicht zur Verfügung. Zuhause/Arbeit manuell auswählen; für Standorterkennung weiterhin den bestehenden HA-Zugang über HTTPS nutzen.

## Telefon und Standort

Über Home Assistant oder dessen Companion-App öffnen. Browser-Standortzugriff braucht HTTPS und eine Berechtigung. Bei verweigerter Abfrage in der eingebetteten Ansicht Zuhause/Arbeit manuell wählen. Es gibt keine automatische Verknüpfung mit Companion-Standortsensoren.

Zuhause erkennt 15 km um Ingolstadt, Arbeit 10 km um Pfaffenhofen. Ungenaue Positionen und Orte außerhalb dieser Bereiche bestimmen die Richtung nicht. Ermittelt wird der Standort des gerade verwendeten Geräts; exakte Koordinaten bleiben dort.

## Fehlerbehebung

### App erscheint nicht im Store

`config.yaml` muss direkt in `local_apps/bahnometer/` liegen. Eine zusätzliche Ebene `local_apps/Bahnometer-main/bahnometer/` ist falsch. Die Samba-Freigabe `local_apps` aktivieren, Store über das Menü nach Updates suchen lassen und Seite neu laden.

Bei Repository-Installation muss die GitHub-URL für HA erreichbar sein. Ein privates Repository erscheint ohne Anmeldung als nicht gefunden. Dann lokal installieren. Ein GitHub-Token gehört nicht in die Bahnometer-Konfiguration.

### Installation schlägt fehl

Supervisor-/Installationsprotokoll prüfen. Der Build benötigt Docker Hub und `registry.npmjs.org`, verwendet ein festgelegtes offizielles Node-Image und gesperrte Paketversionen. Aktueller Supervisor mit BuildKit erforderlich. Auf HA OS kein npm, Docker oder Node.js von Hand installieren.

### Start schlägt fehl

App-Protokolle prüfen. Ungültige Optionswerte verhindern den Start mit einer konkreten Meldung. Supervisor erzeugt `/data/options.json` als root mit Modus 0600. Die App liest diese Datei und wechselt danach für den Server auf UID/GID 1000. Optionen über HA ändern, nicht per Hand im Container.

### Oberfläche bleibt leer

„Weboberfläche öffnen“ oder im LAN `http://PI-IP:8099/` benutzen. Bei direktem Zugriff die Netzwerk-Portzuordnung der App, Neustart und freien Host-Port prüfen. Nach Updates die Ansicht vollständig neu laden. Assets und API verwenden jeweils die Basis des Zugriffswegs; unter Ingress bleiben sie im Ingress-Unterpfad.

### Keine Daten oder keine Verbindungen

App-Protokolle und angezeigte Meldung prüfen. Der Pi muss `api.transitous.org` über HTTPS erreichen können. Ein Watchdog-/Health-Erfolg bestätigt den Webserver, nicht die externe Datenquelle.

„Keine passenden Verbindungen“ bedeutet: im abgefragten Fenster keine direkte RE/RB-Verbindung mit tatsächlichem Zielhalt gefunden. Andere Regionalzüge und falsche Richtungen werden ausgeschlossen. Fehlende Folgehalte oder Ankunftszeiten werden als Fehler gemeldet. Die bewusst aktivierbare Demo ist immer als Beispiel gekennzeichnet.

### OPS_BLOCKED / HTTP 403, 452 oder 466

Das betrifft den optionalen direkten Bahn-Zugang. `data_source: transitous` einstellen, speichern und neu starten. Wiederholte Installation hebt eine Bahn-Sperre nicht auf. Schutzmodus und TLS-Prüfung bleiben aktiviert.

### Standort fehlt

HTTPS, Browser-/App-Berechtigungen und die Einbettung prüfen. Auf dem Computer wird dessen Position verwendet. Zuhause/Arbeit können immer manuell gewählt werden.

## Daten und Aktualität

Aktualisierung alle 60 Sekunden bei sichtbarer App oder per Button. Nach Fehlern oder über 90 Sekunden alten Daten erscheint eine Warnung; fehlende Prognosen heißen „Nur Fahrplan“. Der Server-Healthcheck fragt keine Fahrpläne ab. Nach dem Schließen der Oberfläche gibt es kein regelmäßiges Bahn-Polling.

Datenquelle ist standardmäßig [Transitous](https://transitous.org/) mit [offenen Fahrplan-/Echtzeitquellen](https://transitous.org/sources/) und [OpenStreetMap](https://www.openstreetmap.org/copyright). Die Abrufzeit ist nicht das garantierte Alter eines Feeds. Kurzfristige Ausfälle können fehlen oder verspätet eintreffen.

Zunächst privater Prototypentest; vor weitergehendem Betrieb die [Transitous-Nutzungsbedingungen](https://transitous.org/api/) beachten. Die Lizenzierung des eigenen Codes und gegebenenfalls eine Abstimmung der Nutzung sind vom Eigentümer zu entscheiden.

## Validierung

Container-Builds für ARM64/AMD64, Browser-/Ingress-Tests und AMD64-Start/Neustart sind geprüft. Ein physischer Pi 5 mit HA OS stand hier nicht zur End-to-End-Installation zur Verfügung.
