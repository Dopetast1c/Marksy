<!-- source: README.md sha256:7a71e523a772 · machine -->
[English](README.md) · [Русский](README.ru.md) · [Беларуская](README.be.md) · [Українська](README.uk.md) · [Қазақша](README.kk.md) · [Polski](README.pl.md) · **Deutsch** · [Español](README.es.md) · [Português](README.pt.md) · [Français](README.fr.md) · [Nederlands](README.nl.md) · [Română](README.ro.md)

> Diese Seite ist eine maschinelle Übersetzung des englischen README; maßgeblich ist der englische Text. Korrekturen sind willkommen über das Formular [„Übersetzung der Dokumentation“](https://github.com/Dopetast1c/Marksy/issues/new?template=docs-translation.yml).

# Marksy

**Das Schuljahr Ihrer Kinder, an einem ruhigen, übersichtlichen Ort.**

Marksy ist eine Familien-App für Schulnoten, mit einsehbarem Quellcode und kostenlos für die private und jede andere nicht-kommerzielle Nutzung. Sie verbindet sich mit dem elektronischen Klassenbuch, das Ihre Schule bereits nutzt, liest Noten, Stundenplan und Hausaufgaben über die eigene API des Klassenbuchs und baut darauf eine reichere Ebene auf: Durchschnitte und Trends für jedes Fach und jeden Zeitraum, die vollständige Geschichte jeder Note, einen Plan für die kommenden Tage, einen Lern-Timer, Benachrichtigungen und eigene Zugänge für jedes Elternteil und jedes Kind. Marksy läuft auf Ihrem eigenen Computer, lässt sich auf jedem Handy als App installieren und spricht zwölf Sprachen.

[![License: PolyForm Noncommercial 1.0.0](https://img.shields.io/badge/license-PolyForm%20Noncommercial%201.0.0-blue.svg)](LICENSE)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6.svg)
![PWA](https://img.shields.io/badge/app-PWA-5a0fc8.svg)
![Self-hosted](https://img.shields.io/badge/data-self--hosted-2f7a4a.svg)

> **Stand: 1.0, die erste Version.** Noten, Endnoten, Fächer, der Stundenplan mit Hausaufgaben, die Familie und das Aussehen der App funktionieren und werden jeden Tag genutzt, zu Hause auf einem Computer, der sich selbst aktualisiert. Labels, Lernzeit, die installierbare App mit Offline-Modus und Benachrichtigungen folgen als Nächstes, in dieser Reihenfolge ([`docs/build-plan.md`](docs/build-plan.md)). Die folgenden Abschnitte beschreiben das ganze Produkt.

## Die Idee

Das Klassenbuch ist die maßgebliche Quelle: Lehrkräfte tragen dort jeden Tag Noten, Themen, Hausaufgaben und den Stundenplan ein, und das Klassenbuch stellt sie über seine API bereit. Das sind viele wertvolle Daten, und ein großer Teil ihres Werts zeigt sich erst mit der Zeit und über die Fächer hinweg: wie es in einem Fach in diesem Abschnitt läuft, was sich seit gestern geändert hat, welche Klassenarbeit am Dienstag ansteht, ob diese Woche besser lief als die letzte.

Marksy nimmt diese Daten und baut für die Familie darauf auf:

- **Marksy erinnert sich.** Jede Note wird mit ihrer vollständigen Geschichte gespeichert, sodass die Familie nicht nur sieht, wo es steht, sondern auch, wie es dazu kam, einschließlich Noten, die später korrigiert wurden.
- **Marksy fasst zusammen.** Durchschnitte pro Fach für eine Woche, einen Monat, einen Abschnitt oder ein Jahr, verglichen mit dem vorherigen Zeitraum, mit der Verteilung der Noten und einem Trend.
- **Marksy schaut voraus.** Die Stunden von morgen mit Hausaufgaben, anstehende Klassenarbeiten und Auswendiglernen, Tage im Voraus hervorgehoben.
- **Marksy bringt die Familie zusammen.** Ein Zugang zum Klassenbuch reicht für die ganze Familie; jedes Elternteil und jedes Kind hat einen eigenen Zugang, eigene Benachrichtigungen und eine eigene Ansicht.
- **Marksy reist mit.** Das Klassenbuch-System ist ein Plug-in. Alles andere, jeder Bildschirm und jede Zahl, ist gemeinsam, sodass ein neues Land, eine neue Region oder eine neue Schule die ganze App bekommt, indem ein kleiner Provider hinzukommt.

## Was Sie bekommen

### Start

Der Tag auf einen Blick. Zwei Zahlen für den gewählten Zeitraum, der Durchschnitt und die Anzahl der Noten, jeweils mit dem Wert aus dem vorherigen Zeitraum. Dann die Noten von heute, die Lernzeit, der Block **Wichtig** (die wenigen Dinge, die gerade einen Blick wert sind: eine niedrige Note, eine anstehende Klassenarbeit, ein sinkender Durchschnitt, etwas, das morgen mitzubringen ist) und die Stunden von morgen mit ihren Hausaufgaben. Darunter die Statistik: Noten nach Qualitätsstufen, die Verteilung nach Wert und ein Trend nach Woche, Monat, Abschnitt oder Jahr.

Jeder Bildschirm mit Zahlen hat dieselbe Zeitraumauswahl: Woche, Monat, Abschnitt oder Jahr wählen und dann mit Pfeilen, einer Wischgeste oder einer Liste zu jedem früheren Zeitraum zurückgehen.

### Noten

Alle Noten in einem Verlauf, nach Tagen gruppiert, mit Fach, Art der Arbeit, Stundenthema und dem Kommentar der Lehrkraft. Filtern nach Labels wie „Klassenarbeit“ oder „Gedicht“, nach einem oder mehreren zugleich. Einen Tipp entfernt liegen die **Endnoten**: eine Tabelle der Abschnitts- und Jahresergebnisse für jedes Fach, in der ein noch laufender Abschnitt seinen aktuellen Durchschnitt zeigt, damit ein Trend nie mit einem Endergebnis verwechselt wird.

### Fächer

Jedes Fach des Kindes, immer: sein Durchschnitt im Zeitraum, die Richtung, in die es sich bewegt, der vorherige Wert und die letzten Noten. Sortieren alphabetisch, nach den schwächsten oder stärksten zuerst oder nach dem größten Anstieg oder Rückgang. In Klassen, in denen noch keine Noten vergeben werden, zeigt dieselbe Liste stattdessen Stunden, Hausaufgaben und Lernzeit.

### Ein Fach im Detail

Jedes Fach hat eine eigene Seite, in der Farbe des Fachs getönt: das Ziel für den Abschnitt („für eine 8 braucht es zwei 9 oder eine 10“), die Dinge, die Aufmerksamkeit verdienen, Statistik und Trend, jede Note mit ihrem Kommentar, die nächsten Stunden, die Ergebnisse Abschnitt für Abschnitt und die Lernzeit.

### Stundenplan und Hausaufgaben

Ein Tag oder eine ganze Woche, zurück und voraus, eine Zeile pro Stunde mit Uhrzeit, Raum, Thema, Hausaufgabe und der Note aus dieser Stunde; vor einer Stunde stehen direkt darunter der Durchschnitt des Fachs und die letzten Noten. Stunden, auf die sich ein Kind vorbereitet hat, bekommen ein Häkchen **Fertig**, das die ganze Familie sieht. Familien können eigene Hausaufgaben hinzufügen und eine Stunde als ausgefallen markieren. Lücken im Tag werden als Lücken gezeigt, sodass ein späterer Beginn sofort auffällt.

### Labels

Sagen Sie Marksy in den Worten Ihrer Schule, was wichtig ist: ein Gedicht zum Auswendiglernen, eine Klassenarbeit, etwas zum Mitbringen. Ein Label besteht aus ein paar Stichwörtern, nach denen Marksy in Stundenthemen und Hausaufgaben sucht. Stunden mit Label werden im Stundenplan hervorgehoben und erscheinen Tage vorher auf dem Startbildschirm, mit genau den Wörtern, die gepasst haben. Fertige Labels gibt es für jede Sprache, und sie lassen sich frei bearbeiten.

### Lernzeit

Ein Timer für Hausaufgaben, gestartet aus einer Stunde oder einem Fach, mit Pause und Beenden, und eine kleine Leiste, die auf dem Bildschirm bleibt, solange er läuft. Eine Lerneinheit zu beenden und eine Stunde als fertig zu markieren sind zwei getrennte Schritte, denn eine Pause ist nicht das Ende. Wurde der Timer nicht benutzt, schätzt Marksy die Zeit aus den „Fertig“-Häkchen des Abends und kennzeichnet die Schätzung als solche. Die Zeit wird pro Tag und pro Fach gezeigt, schlicht und ohne Wertung.

### Benachrichtigungen

Eine Push-Benachrichtigung auf dem Handy oder eine Telegram-Nachricht, wenn etwas passiert: eine neue Note, eine Note unter einer gewählten Grenze, eine korrigierte Note, eine Abwesenheit, eine anstehende Klassenarbeit, ein abendlicher Überblick über die Hausaufgaben, eine Wochenzusammenfassung. Jede Regel wird pro Person eingestellt, mit Ruhezeiten. Alles, was gesendet wurde, bleibt in einem Posteingang in der App, sodass eine weggewischte Benachrichtigung nie verloren geht.

### Familie

Die Familie verbindet das Klassenbuch einmal. Jedes Mitglied bekommt über eine Einladung einen eigenen Marksy-Zugang: das zweite Elternteil, die Großeltern, jedes Kind. Kinder brauchen das Passwort des Klassenbuchs nie. Befreundete Familien können auf demselben Server ihre eigene Familie anlegen; Familien sehen die Daten der anderen nie.

### Ihr Aussehen, Ihre Sprache

Helles und dunkles Design, Farbpaletten, Hintergrundbilder, fünf Schriften für den Text, eine Farbe für jedes Fach. Zwölf Sprachen der Oberfläche: Russisch, Belarussisch, Ukrainisch, Kasachisch, Englisch, Polnisch, Deutsch, Spanisch, Portugiesisch, Französisch, Niederländisch und Rumänisch, für jede Person einzeln wählbar. Englisch und Russisch werden von Menschen geprüft; die anderen zehn sind maschinelle Übersetzungen, in der App als solche gekennzeichnet, mit einem Link zu einem kurzen Formular für Korrekturen. Eine Sprache hinzuzufügen ist eine einzige JSON-Datei ([`docs/i18n.md`](docs/i18n.md)).

## Gleich ansehen

Öffnen Sie [`docs/mockups.html`](docs/mockups.html) in einem Browser. Es ist ein klickbarer, für Mobilgeräte gestalteter Prototyp aller Bildschirme mit erfundenen Daten: wechseln Sie zwischen Elternteil und Kind, zwischen zwei Kindern, zwischen hell und dunkel. Die App ist danach gebaut.

## So funktioniert es

```
 ┌───────────────────┐  provider: students, calendar, lessons,  ┌──────────────────────────────┐
 │ school diary      │  marks, homework, final marks            │  Marksy server               │
 │ (through its API) │ <─────────────────────────────────────── │  Node.js + Express           │
 │                   │ ───────────────────────────────────────> │  collector, API, guidance    │
 └───────────────────┘  read-only, serial, gentle               │  PostgreSQL 16               │
                                                                └──────────────┬───────────────┘
                                                                               │ HTTPS, sessions
                                                                ┌──────────────┴───────────────┐
                                                                │  Marksy app (PWA, React)     │
                                                                │  parents and children        │
                                                                └──────────────────────────────┘
```

- **Provider.** Ein kleines Modul pro Klassenbuch-System. Es meldet sich mit den Zugangsdaten der Familie an und liefert Schulkinder, Abschnitte, Fächer, Stunden mit Noten und Hausaufgaben sowie Endnoten im gemeinsamen Format von Marksy. Es gibt an, was sein System bietet (Stundenarten, Kommentare, Anwesenheit, Abschnitte, einen künftigen Stundenplan) und welche Notenskala es hat, und die App passt sich genau daran an.
- **Collector.** Für jeden Provider derselbe. Ein paar Mal während des Schultags holt er die letzten Wochen für jedes Kind, erkennt neue, geänderte und entfernte Noten, bewahrt die Geschichte jeder Änderung auf und liest einmal pro Woche den ganzen Abschnitt neu, weil Lehrkräfte auch ältere Noten ändern. Er arbeitet als Planer: War der Computer übers Wochenende aus, holt der erste Lauf danach nach, was verpasst wurde.
- **API.** Liefert die gespeicherten Daten an die App, beschränkt auf eine Familie, und dokumentiert sich selbst mit OpenAPI unter `/api/docs`.
- **App.** Eine React-PWA mit Offline-Hülle, installierbar auf iOS und Android, von den ersten Bildschirmen an auf echten Handys im Heimnetz getestet.

## Jede Schule, jede Notenskala

Marksy arbeitet mit einem gemeinsamen Modell (Schulkinder, Abschnitte, Fächer, Stunden, Noten, Endnoten) und mit einer Beschreibung der **Notenskala**, die der Provider liefert: Bereich und Richtung, vier Qualitätsstufen, Schwellen, Ziele, wie Durchschnitte berechnet und angezeigt werden, wie Endnoten gerundet werden. Eine 10-Punkte-Skala, eine 5-Punkte-Skala, eine 12-Punkte-Skala, 1 bis 6, wobei 1 die beste ist, 0 bis 20, Buchstaben mit GPA, Prozente, bestanden oder nicht bestanden: Dieselben Bildschirme, Durchschnitte, Filter, Ziele und Hinweise funktionieren für jede davon, selbst wenn sich die Skala zwischen Schuljahren oder Fächern ändert.

Alles, was ein Klassenbuch haben kann oder nicht, ist optional: Stundenarten, Notenkategorien, Kommentare, Anwesenheit, Abschnitte, offizielle Endnoten, sogar ein Stundenplan. Ein Provider gibt an, was vorhanden ist, und jeder Bildschirm zeigt, was es gibt, statt leerer Spalten.

Um ein neues System anzubinden, schreibt man einen Provider: ein Manifest (Zugangsdaten, Skala, Fähigkeiten, Abfragegrenzen), eine Anmeldefunktion, eine Handvoll Abruffunktionen, die Antworten auf die gemeinsamen Typen abbilden, ein `sanitize()` für Test-Fixtures und den gemeinsamen Konformitätstest. [`docs/adding-a-diary.md`](docs/adding-a-diary.md) erklärt, was dafür nötig ist und wie man das System der eigenen Schule anfragt; der vollständige Vertrag und eine Checkliste für die Prüfung stehen in [`docs/providers.md`](docs/providers.md), und `providers/_template` ist ein kompilierbarer Ausgangspunkt.

## Respektvoll von Grund auf

- **Nur lesend.** Marksy liest nur. Der gemeinsame HTTP-Client lehnt jede Anfrage außerhalb der Erlaubnisliste des Providers ab, sodass im Klassenbuch nichts aus Versehen geändert werden kann.
- **Schonend.** Höchstens eine Anmeldung pro Stunde und Zugang, eine Anfrage nach der anderen mit Pausen, Zurückhaltung bei Fehlern, eine Obergrenze pro Lauf. Die manuelle Aktualisierung teilt sich dasselbe Budget.
- **Widerstandsfähig.** Jeder Versuch und jede geprüfte Woche wird festgehalten. Ausfälle auf beiden Seiten werden automatisch nachgeholt; nach wiederholten Fehlern pausiert der Abgleich, und die Admin-Person der Familie erhält einmal Bescheid. Ein falsches Passwort stoppt den Abgleich, bis es korrigiert ist, sodass der echte Zugang nie gesperrt wird.
- **Netzwerkbewusst.** Manche Klassenbuch-Systeme antworten am besten aus ihrer eigenen Region oder ohne VPN. Jeder Provider gibt an, was er vom Netzwerk braucht, und der Collector läuft auf einem Gerät zu Hause, das diese Anforderungen erfüllt: einem PC, einem Mini-PC, einem Raspberry Pi, einem NAS.
- **Aufgeräumt.** Noten und ihre Geschichte bleiben erhalten, solange das Kind zur Familie gehört; Betriebsdaten (Abgleichsprotokolle, Rohantworten, Ereignis-Feeds) werden Wochen oder Monate aufbewahrt und dann verdichtet. Die Grenzen stehen in `env.example` unter `RETENTION_*`.

## Datenschutz

Marksy verarbeitet Daten über Kinder, und die Voreinstellungen tragen dem Rechnung.

- **Ihre Daten bleiben bei Ihnen.** Keine Analyse, keine Skripte oder Schriften von Dritten, nichts verlässt Ihren Server.
- **Überall Sitzungen.** Jede Route außer Anmeldung, Health-Check und API-Dokumentation verlangt eine Sitzung, und jede Abfrage ist auf eine Familie beschränkt.
- **Geschützte Geheimnisse.** Die Passwörter für das Klassenbuch werden verschlüsselt gespeichert (AES-256-GCM); Marksy-Passwörter werden mit argon2id gehasht. Protokolle enthalten nie Passwörter, Tokens oder vollständige Namen.
- **Nichts Echtes im Repository.** Test-Fixtures sind erfunden oder bereinigt; `pnpm privacy` sucht nach Geheimnissen, personenbezogenen Daten und Dateien, die nie eingecheckt werden dürfen.
- **Die Daten gehören den Familien.** Eine Familie kann alles als JSON exportieren und sich vollständig löschen; die Aufbewahrungsdauer ist eine Einstellung. Wenn Sie Marksy für andere Familien betreiben, lesen Sie zuerst `docs/design.md`, Abschnitt 14.1.

## Voraussetzungen

- Ein Zugang zu einem unterstützten Klassenbuch (für ein Elternteil oder ein Schulkind).
- Ein Computer, der während des Schultags läuft, mit Docker und sonst nichts: ein PC oder Laptop zu Hause, ein Mini-PC, ein Raspberry Pi oder ein NAS.
- Optional: eine Domain bei Cloudflare, um die App über Cloudflare Tunnel auch außerhalb des Heimnetzes zu nutzen, sie auf Handys zu installieren und Web Push zu verwenden; ein Telegram-Bot-Token für Benachrichtigungen über Telegram.
- Für die Entwicklung an Marksy: Node.js 22, pnpm und Docker.

## Produktivbetrieb

Um Marksy jeden Tag für Ihre Familie zu betreiben, auf einem Laptop, einem Raspberry Pi oder einem NAS, mit nur Docker auf diesem Computer: [docs/running.md](docs/running.md). Dort geht es um die Installation, die Wege, die App zu Hause und von unterwegs zu erreichen (Cloudflare Tunnel), Sicherungen, Wiederherstellung und Umzug auf einen anderen Computer sowie Updates. Jeder Version sind die Dateien, die ein Host braucht, als `marksy-deploy-vX.Y.Z.zip` beigefügt.

Versionen sind nach dem Schema MAJOR.MINOR.PATCH nummeriert: MAJOR ist ein grundlegender Umbau der App (selten), MINOR bringt neue Funktionen, PATCH bringt Korrekturen und Fehlerbehebungen. Ein Host installiert neue Versionen selbstständig, innerhalb weniger Minuten, nachdem er geprüft hat, dass dieses Projekt sie signiert hat, mit einer Sicherung vorher und einem Weg zurück, falls etwas schiefgeht.

## Schnellstart für die Entwicklung

Der Workspace startet die ganze App aus dem Quellcode: die Datenbank, den Collector mit seinem Planer, die API mit ihrer Dokumentation, die App und eine erfundene Demo-Familie, um alles ohne Zugang zu einem Klassenbuch zu erkunden. Sie brauchen Node.js 22, pnpm (`npm install -g pnpm` oder `corepack enable`) und Docker.

```bash
git clone https://github.com/Dopetast1c/Marksy.git
cd Marksy
pnpm setup:env                  # creates .env and generates its secrets
pnpm install                    # also points git at .githooks/ (the pre-commit guard)
pnpm db:up                      # PostgreSQL 16 in Docker: the app database (5432) and an in-memory one for tests (5434)
pnpm db:migrate                 # creates the schema
pnpm db:seed                    # a fictional demo family with demo logins (--reset replaces it)
pnpm check                      # formatting, typecheck, lint, tests, privacy check
pnpm test:provider demo-minimal # the shared conformance suite for one provider
pnpm dev                        # API on :3000, app on :5173, API docs at /api/docs
```

Die Demo-Familie gehört zu einem erfundenen Klassenbuch und hat zwei Kinder, eines davon in einer Klasse ohne Noten, sodass sich jeder Bildschirm ohne Zugang zu einem Klassenbuch erkunden lässt; ihre Zugänge (`parent@example.com` und `student@example.com`, das Passwort gibt `pnpm db:seed` aus) funktionieren, sobald die Anmeldung da ist. Weil dieses Passwort öffentlich ist, verweigert der Seed den Start, wenn `PUBLIC_URL` eine öffentliche Adresse ist (`--allow-public` hebt das auf). `pnpm db:studio` öffnet die Datenbank in Drizzle Studio. `pnpm db:backup` schreibt einen Dump der lokalen Datenbank nach `data/backups/` (die letzten fünf werden behalten) und prüft ihn, indem er ihn in eine temporäre Datenbank einspielt; `pnpm db:restore <file> --yes` spielt einen zurück. Mit einem Zugang zum Klassenbuch öffnen Sie die App, wählen „Klassenbuch verbinden“, wählen Ihr Klassenbuch-System und melden sich an: Marksy prüft die Zugangsdaten einmal, legt Ihre Familie an und startet den ersten Abgleich. Den Rest der Familie laden Sie über „Mehr“ und dann „Familie“ ein.

Mit einem Zugang zum Klassenbuch richtet `pnpm dev:connect` Ihre eigene Familie über die Kommandozeile ein: Es liest den Zugang zum Klassenbuch (`DIARY_LOGIN`, `DIARY_PASSWORD`) und den gewünschten Marksy-Zugang (`MARKSY_DEV_EMAIL`, `MARKSY_DEV_PASSWORD`) aus `.env` und führt denselben Code aus wie „Klassenbuch verbinden“; nach dem Zurücksetzen der Datenbank erneut ausgeführt, ergänzt es nur, was fehlt, und nach `pnpm sync:once` übernimmt es diese Familie, ohne sich erneut beim Klassenbuch anzumelden. Davor lässt sich die lokale Datenbank über die Kommandozeile füllen: den Zugang zum Klassenbuch in `DIARY_LOGIN` und `DIARY_PASSWORD` in `.env` eintragen und `pnpm sync:once` ausführen. Es spricht nur mit Klassenbuch-Systemen, die Familien angeboten werden, legt beim ersten Mal eine minimale Familie an und führt einen Abgleich nach denselben Regeln aus wie jeder andere Lauf (die Obergrenze an Anfragen, die Offline-Prüfung, eine Anmeldung pro Zugang und Intervall: 10 Minuten für manuelle Befehle in der Entwicklung, das eigene Intervall des Klassenbuch-Systems im Produktivbetrieb); `pnpm probe` liest jeden Endpunkt einmal und erneuert die bereinigten Fixtures des Providers, und `pnpm probe --offline` wiederholt die Prüfungen an den gespeicherten Antworten, ohne sich anzumelden (die Fixtures schreibt es nur mit `--write-fixtures` neu). Die drei Befehle, die sich bei einem echten Klassenbuch anmelden, teilen sich eine Anmeldesperre. Der Pre-Commit-Wächter lehnt einen Commit ab, der lokale Daten, Geheimnisse, Datenbank-Dumps oder Rohantworten enthält oder irgendeinen Namen oder eine ID aus den letzten echten Antworten. Ausgegeben werden nur Zahlen und Status, und der Exit-Code ist auch dann 0, wenn die Regeln den Lauf zurückhalten. Solange `SYNC_ENABLED` auf `true` steht, hält `pnpm dev` diesen Zugang von selbst aktuell, nur während des Schultags jedes Kindes. `pnpm sync:plan` zeigt, was der Planer jetzt tun würde (das Zeitfenster jedes Kindes heute, was wartet, ob ein Lauf starten würde), ohne sich irgendwo anzumelden.

### Auf dem Handy im Heimnetz

```bash
pnpm dev:lan                    # like pnpm dev, and the app also listens on the local network
```

Vite gibt eine `Network:`-Adresse aus, etwa `http://192.168.1.20:5173`; öffnen Sie sie auf einem Handy im selben WLAN. Alles läuft über diesen einen Port: Der App-Server leitet `/api` an die API weiter, die selbst nur auf `127.0.0.1` lauscht, sodass die Anmeldung ohne weitere Einrichtung funktioniert. Unter Windows erlauben Sie Node.js in **privaten** Netzwerken, wenn die Firewall fragt, und achten darauf, dass das WLAN-Profil auf „Privat“ steht. Die Installation der App, der Offline-Modus und Web Push brauchen auf einem Handy HTTPS; das kommt mit dem PWA-Meilenstein (`docs/build-plan.md` M8).

`pnpm smoke:lan` prüft die API so, wie ein Handy sie sieht, nur ohne Handy: Während `pnpm dev:lan` läuft, ermittelt es die Heimnetz-Adresse dieses Computers, meldet sich unter `http://<address>:5173/api` mit `MARKSY_DEV_EMAIL` und `MARKSY_DEV_PASSWORD` aus `.env` an und liest die Daten jedes Kindes. Es gibt Status, Anzahlen und die Form jeder Antwort aus (Schlüssel und Typen, keine Werte) und schlägt fehl, wenn eine Antwort ein Passwort oder das Sitzungstoken enthält oder wenn das Sitzungs-Cookie über einfaches http nicht funktionieren würde. Mit `--host <ip>` wählen Sie die Adresse selbst.

`pnpm smoke:ui` tut dasselbe für die Bildschirme: Während `pnpm dev:lan` läuft, öffnet es die App über die Heimnetz-Adresse in einem Headless-Browser in Handygröße (360 px, Touch) und in Tabletgröße, meldet sich als Demo-Elternteil an (und als Sie selbst, wenn `MARKSY_DEV_EMAIL` gesetzt ist), geht jeden Bildschirm jedes Kindes durch und nimmt dieselben Zustände des klickbaren Prototyps (`docs/mockups.html`) zum Vergleich auf. Die Screenshots landen in `data/ui/` (die letzten drei Läufe), das nie eingecheckt wird. Einmalig wird Chromium für Playwright gebraucht: `pnpm exec playwright install chromium`.

## Konfiguration

Für die Entwicklung steht die ganze Konfiguration in `.env` (von `pnpm setup:env` aus `env.example` erzeugt); ein Host im Produktivbetrieb hat eine eigene `.env.production` ([docs/running.md](docs/running.md), Abschnitt 3). Geheimnisse kommen nie ins Repository.

| Variable | Zweck |
|---|---|
| `DATABASE_URL`, `TEST_DATABASE_URL` | PostgreSQL für die App (`marksy`, Port 5432, in einem Docker-Volume gespeichert) und für `pnpm test` (`marksy_test` auf einem separaten In-Memory-Server, Port 5434, nach jedem Neustart leer) |
| `PORT`, `HOST` | Port der API (3000) und Bind-Adresse (`127.0.0.1`; andere Geräte erreichen die API über den App-Server) |
| `SESSION_SECRET` | Zufällige Zeichenkette für Sitzungs-Cookies (erzeugt) |
| `CREDENTIALS_KEY` | 32-Byte-Schlüssel (base64), der die Passwörter für das Klassenbuch im Ruhezustand verschlüsselt (erzeugt) |
| `SYNC_ENABLED` | `true` auf dem Gerät, das mit dem Klassenbuch spricht, `false` auf einer Kopie nur mit API |
| `SYNC_WINDOW` | Optional: eine äußere Grenze für das Schultag-Zeitfenster jedes Kindes (sie kann es nur verengen) |
| `SYNC_JITTER_MIN`, `SYNC_MIN_LOGIN_INTERVAL` | Zufällige Verzögerung für geplante Läufe; Mindestabstand zwischen Anmeldungen pro Zugang (kann nur erhöht werden) |
| `SYNC_TICK_MIN`, `SYNC_CATCHUP_AFTER`, `SYNC_MAX_REQUESTS_PER_RUN` | Planer: wie oft er entscheidet, wann ein Nachhol-Lauf erlaubt ist, wie viel ein Lauf abrufen darf |
| `SYNC_FAILURES_BEFORE_PAUSE`, `SYNC_PAUSE_HOURS`, `SYNC_PAUSE_MAX_HOURS`, `SYNC_OFFLINE_RETRY_MIN` | Umgang mit Fehlern: Fehlversuche vor einer Pause, die Pause (verdoppelt sich bis zu einer Woche), erneuter Versuch, wenn dieses Gerät offline ist |
| `RETENTION_*` | Wie lange Betriebsdaten aufbewahrt werden (Abgleichsprotokoll, Rohantworten, Ereignis-Feeds, Abdeckung) |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Schlüssel für Web Push |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` | Telegram-Bot (optional) |
| `MARKSY_ENV`, `DEV_MIN_LOGIN_INTERVAL_MINUTES` | Grenzen der manuellen Klassenbuch-Befehle (`pnpm probe`, `pnpm sync:once`, `pnpm dev:connect`). `development` (in `env.example` gesetzt): eine Anmeldung pro Zugang alle 10 Minuten oder seltener, zu jeder Uhrzeit. Alles andere, auch ein fehlender Wert, und jeder Build mit `NODE_ENV=production`: das eigene Intervall des Klassenbuch-Systems (meist eine Stunde). `pnpm env:dev` ergänzt die beiden Entwicklungszeilen in einer älteren `.env`, der sie fehlen, ohne bereits gesetzte Werte anzurühren. Geplante Abgleiche folgen in beiden Fällen den Schultag-Regeln |
| `MARKSY_RUNNER` | Leer lassen. Wird von `.claude/settings.json` für Claude Code auf `claude` gesetzt: Im Produktivbetrieb sind dessen echte Anmeldungen auf drei pro Tag während der Schulzeit begrenzt |
| `DIARY_LOGIN`, `DIARY_PASSWORD`, `MARKSY_DEV_EMAIL`, `MARKSY_DEV_PASSWORD` | Nur für die Entwicklung: Ihr eigener Zugang zum Klassenbuch für `pnpm probe`, `pnpm sync:once` und `pnpm dev:connect` sowie der Marksy-Zugang, den `dev:connect` anlegt. Die App selbst bewahrt die Zugangsdaten zum Klassenbuch verschlüsselt in der Datenbank auf |
| `TZ` | Zeitzone der Schule (IANA-Name) |

## Aufbau des Repositorys

```
packages/core/          common types, provider interface, grading scales, marks math,
                        guidance rules, throttled HTTP client, provider conformance suite
packages/i18n/          interface languages: en.json as the source of truth, ru reviewed, ten machine translations
packages/registry/      the list of providers the app offers
providers/_template/    starting point for a new provider
providers/demo-minimal/ a fictional diary with the fewest features, served from fixtures
providers/demo-full/    a fictional diary with many features: the demo family and the collector tests use it
providers/demo-lite/    the same fictional diary with fewer features: the demo family's second school
packages/demo-diary/    the fictional diary and school behind the demo providers and the demo family
providers/<id>/         one folder per diary system: manifest, schemas, mapper, fixtures
server/                 Express API, collector, backups, Drizzle schema and migrations, the production command line
web/                    React + Vite PWA, Tailwind driven by docs/tokens.json
updater/                automatic updates: channels, signature checks, rollback, the Docker socket guard
docker/                 the reverse proxy's and the web server's configuration
scripts/                checks (privacy, language, documentation, migrations, commits), releases, .env setup
docs/                   running.md         running Marksy at home
                        adding-a-diary.md  what connecting another diary system takes
                        ux-principles.md   why the interface is the way it is
                        design.md          product and technical design
                        build-plan.md      milestones and how the project is built
                        providers.md       the provider contract
                        i18n.md            how to add a language
                        api-spec.md        notes on the first provider's API
                        tokens.json        design tokens
                        mockups.html       clickable prototype
```

Beginnen Sie mit `docs/running.md`, um Marksy zu betreiben, mit `docs/ux-principles.md`, um zu sehen, warum die Oberfläche so ist, wie sie ist, mit `docs/design.md`, um das Produkt zu verstehen oder zu ändern, und mit `docs/adding-a-diary.md`, um ein weiteres Klassenbuch-System anzubinden.

## Fahrplan

Der vollständige Plan mit Abnahmekriterien steht in [`docs/build-plan.md`](docs/build-plan.md).

Erledigt:

1. Kern: gemeinsames Modell, Notenskalen, Notenberechnung, HTTP-Client, Sprachen.
2. Der erste Provider und seine Konformitätstests.
3. Server: Datenbank, Collector, Planer, erfundene Seed-Daten.
4. Zugänge, Familien, Einladungen und die Lese-API.
5. Die App: Start, Wichtig, Noten, Endnoten, Fächer, Fachseite, Stundenplan, Einstellungen, Aussehen; danach die Übersetzungen in die anderen zehn Sprachen.
6. Betrieb zu Hause (1.0): Images für den Produktivbetrieb, Sicherungen, Fernzugriff, signierte automatische Updates.

Als Nächstes:

7. Labels.
8. Lernzeit.
9. Installierbare PWA mit Offline-Modus.
10. Benachrichtigungen: Posteingang, Regeln, Web Push, Telegram.

## Mitwirken

Pull Requests werden nicht angenommen. Fehlerberichte, Ideen und Korrekturen an Übersetzungen, der App oder dieser Seite in Ihrer Sprache, sind als [Issues](https://github.com/Dopetast1c/Marksy/issues) sehr willkommen, auf Englisch oder Russisch.

Wenn sich die API eines Klassenbuchs ändert, eröffnen Sie ein Issue mit einer bereinigten Antwort (Namen, IDs und Kommentare ersetzt), der ID des Providers und dem Datum.

Das Projekt wird mit Claude Code nach `docs/build-plan.md` gebaut; die Skills und Agenten, die dabei zum Einsatz kommen, liegen in `.claude/`, und die Regeln, denen der Code folgt, stehen in `CLAUDE.md`. Wenn Sie Marksy für Ihre eigene nicht-kommerzielle Nutzung ändern, erklärt `docs/providers.md`, wie man ein Klassenbuch-System hinzufügt, und `docs/i18n.md`, wie man eine Sprache hinzufügt.

## Haftungsausschluss

Marksy ist ein unabhängiges Projekt mit einsehbarem Quellcode. Es steht in keiner Verbindung zu einer Schule, einer Bildungsbehörde oder einem Anbieter von Klassenbüchern und wird von keiner dieser Stellen empfohlen oder unterstützt. Es nutzt die API eines Klassenbuchs im Auftrag eines Elternteils oder Schulkinds mit eigenem Zugang dort, liest nur Daten und ist für Ihre eigene Familie gedacht.

## Lizenz

Marksy steht unter der [PolyForm Noncommercial License 1.0.0](LICENSE).

**Sie dürfen** es für jeden nicht-kommerziellen Zweck nutzen, kopieren und ändern: zu Hause für Ihre eigene Familie, zum Lernen, für Forschung, Hobbyprojekte und Tests sowie in Schulen, anderen Bildungseinrichtungen, gemeinnützigen Organisationen, öffentlichen Forschungseinrichtungen und staatlichen Institutionen.

**Nicht erlaubt** ist die kommerzielle Nutzung: kein Verkauf, kein bezahltes Hosting und kein bezahlter Dienst auf seiner Grundlage, keine Aufnahme in ein bezahltes Produkt und keine Nutzung durch ein Unternehmen für eigene Zwecke.

Wenn Sie eine kommerzielle Lizenz brauchen, fragen Sie über ein [Issue](https://github.com/Dopetast1c/Marksy/issues) an. Maßgeblich ist der [vollständige Lizenztext](LICENSE); diese Zusammenfassung dient nur der Orientierung.
