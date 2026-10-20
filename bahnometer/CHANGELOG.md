# Changelog

## 2.0.0

- Home Assistant OS App (früher Add-on), lokaler Container-Build für `aarch64` und `amd64`.
- HA-Ingress und optionaler Seitenleisteneintrag, ohne zusätzlichen Host-Port.
- HA-Einstellungen für `data_source` und `default_origin`, Autostart und Watchdog.
- Ingress-kompatible Assets, API, iframe-Freigabe und Service-Worker-Scope.
- Private Supervisor-Konfiguration wird vor dem Wechsel auf UID/GID 1000 gelesen; UI/API-Zugriff ist auf den Ingress-Gateway begrenzt.
- Installationsanleitung für lokale Apps über Samba und öffentlich erreichbare Repositories.
- Die Node-App liegt jetzt unter `bahnometer`; Entwicklungsbefehle in diesem Unterordner ausführen.
- Transitous, RE/RB-Filter, rote Verspätungen/Ausfälle und manuelle Fahrtrichtung bleiben erhalten.

## 1.1.0

- Transitous-Abfahrtstafel als Standard, sichtbare Datenquelle und Echtzeitkennzeichnung.

## 1.0.0

- Erste Web-App für Ingolstadt Hbf ↔ Pfaffenhofen (Ilm).
