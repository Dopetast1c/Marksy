<!-- source: README.md sha256:7a71e523a772 · machine -->
[English](README.md) · [Русский](README.ru.md) · [Беларуская](README.be.md) · [Українська](README.uk.md) · [Қазақша](README.kk.md) · [Polski](README.pl.md) · [Deutsch](README.de.md) · [Español](README.es.md) · [Português](README.pt.md) · [Français](README.fr.md) · **Nederlands** · [Română](README.ro.md)

> Deze pagina is een machinevertaling van de Engelse README; de Engelse tekst is bindend. Verbeteringen zijn welkom via het formulier [Vertaling van de documentatie](https://github.com/Dopetast1c/Marksy/issues/new?template=docs-translation.yml).

# Marksy

**Het schooljaar van je kinderen, op één rustige, overzichtelijke plek.**

Marksy is een gezinsapp voor schoolcijfers, met beschikbare broncode en gratis voor persoonlijk en ander niet-commercieel gebruik. De app koppelt met het schoolportaal dat de school al gebruikt, leest de cijfers, het rooster en het huiswerk via de eigen API van het portaal en bouwt daar een rijkere laag bovenop: gemiddelden en verloop voor elk vak en elke periode, de volledige geschiedenis van elk cijfer, een planning voor de komende dagen, een studietimer, meldingen en een eigen login voor elke ouder en elk kind. Marksy draait op je eigen computer, installeert zich op elke telefoon als app en spreekt twaalf talen.

[![License: PolyForm Noncommercial 1.0.0](https://img.shields.io/badge/license-PolyForm%20Noncommercial%201.0.0-blue.svg)](LICENSE)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6.svg)
![PWA](https://img.shields.io/badge/app-PWA-5a0fc8.svg)
![Self-hosted](https://img.shields.io/badge/data-self--hosted-2f7a4a.svg)

> **Status: 1.0, de eerste release.** Cijfers, eindcijfers, vakken, het rooster met huiswerk, het gezin en de weergave van de app werken en worden elke dag gebruikt, thuis op een computer die zichzelf bijwerkt. Labels, leertijd, de installeerbare app met offlinemodus en meldingen volgen, in deze volgorde ([`docs/build-plan.md`](docs/build-plan.md)). De onderdelen hieronder beschrijven het hele product.

## Het idee

Het schoolportaal is de bron van waarheid: docenten zetten er elke dag cijfers, lesonderwerpen, huiswerk en het rooster in, en het portaal stelt die beschikbaar via zijn API. Dat is veel waardevolle informatie, en veel van die waarde blijkt pas na verloop van tijd en over vakken heen: hoe het deze periode met een vak gaat, wat er sinds gisteren is veranderd, welke toets er dinsdag aankomt, of deze week beter ging dan de vorige.

Marksy neemt die gegevens en bouwt erop voort voor het gezin:

- **Het onthoudt.** Elk cijfer wordt bewaard met zijn volledige geschiedenis, zodat het gezin niet alleen ziet hoe het ervoor staat, maar ook hoe het zo gekomen is, inclusief cijfers die later zijn gecorrigeerd.
- **Het vat samen.** Gemiddelden per vak voor een week, maand, periode of jaar, vergeleken met de vorige periode, met de verdeling van de cijfers en een verloop.
- **Het kijkt vooruit.** De lessen van morgen met huiswerk, komende toetsen en dingen om uit het hoofd te leren, dagen van tevoren gemarkeerd.
- **Het brengt het gezin samen.** Eén account bij het schoolportaal dient het hele gezin; elke ouder en elk kind heeft een eigen login, eigen meldingen en een eigen weergave.
- **Het reist mee.** De koppeling met het schoolportaal is een plug-in. Al het andere, elk scherm en elk getal, is gedeeld, zodat een nieuw land, een nieuwe regio of school de hele app krijgt door één kleine provider toe te voegen.

## Wat je krijgt

### Start

De dag in één oogopslag. Twee getallen voor de gekozen periode, het gemiddelde en het aantal cijfers, elk met de waarde uit de vorige periode. Dan de cijfers van vandaag, de leertijd, het blok **Aandacht** (de paar dingen die nu een blik waard zijn: een laag cijfer, een toets die eraan komt, een gemiddelde dat zakt, iets om morgen mee te nemen) en de lessen van morgen met hun huiswerk. Daaronder de statistiek: cijfers per niveau, de verdeling per waarde en een verloop per week, maand, periode of jaar.

Elk scherm met getallen heeft dezelfde periodekeuze: kies een week, maand, periode of jaar en ga dan met pijlen, een veeg of een lijst terug naar elke eerdere.

### Cijfers

Alle cijfers in één overzicht, gegroepeerd per dag, met het vak, het soort werk, het lesonderwerp en de opmerking van de docent. Filter op labels zoals “Toets” of “Gedicht”, één of meerdere tegelijk. Eén tik verder staan de **eindcijfers**: een tabel met de resultaten per periode en per jaar voor elk vak, waarin een periode die nog loopt het huidige gemiddelde toont, zodat een trend nooit voor een eindresultaat wordt aangezien.

### Vakken

Elk vak van het kind, altijd: het gemiddelde voor de periode, de richting waarin het beweegt, wat het eerder was en de laatste paar cijfers. Sorteer op alfabet, zwakste of sterkste eerst, of op de grootste stijging of daling. In klassen waar nog geen cijfers worden gegeven, toont dezelfde lijst in plaats daarvan lessen, huiswerk en leertijd.

### Een vak van dichtbij

Elk vak heeft een eigen pagina in de kleur van het vak: het doel voor de periode (“voor een 8 heb je twee 9’s of één 10 nodig”), de dingen die aandacht verdienen, statistiek en verloop, elk cijfer met zijn opmerking, de volgende lessen, de resultaten per periode en de leertijd.

### Rooster en huiswerk

Eén dag of een hele week, terug en vooruit, één regel per les met de tijd, het lokaal, het onderwerp, het huiswerk en het cijfer van die les; vóór een les staan het gemiddelde en de laatste cijfers van het vak er direct onder. Lessen waarop een kind zich heeft voorbereid krijgen een vinkje **Klaar** dat het hele gezin ziet. Gezinnen kunnen zelf huiswerk toevoegen en aangeven dat een les niet doorgaat. Gaten in de dag worden als gaten getoond, zodat een late start meteen opvalt.

### Labels

Vertel Marksy wat belangrijk is, in de woorden van je eigen school: een gedicht om te leren, een toets, iets om mee te nemen. Een label is een paar trefwoorden waar Marksy naar zoekt in lesonderwerpen en huiswerk. Lessen met een label worden gemarkeerd in het rooster en verschijnen dagen van tevoren op het startscherm, met de precieze woorden die overeenkwamen. Kant-en-klare labels zitten bij elke taal en zijn vrij aan te passen.

### Leertijd

Een timer voor huiswerk, gestart vanuit een les of een vak, met pauzeren en stoppen, en een kleine balk die in beeld blijft zolang hij loopt. Een sessie afronden en een les als klaar markeren zijn twee aparte dingen, want een pauze is niet het einde. Als de timer niet is gebruikt, schat Marksy de tijd op basis van de vinkjes “klaar” van die avond en geeft de schatting ook als schatting aan. Tijd wordt per dag en per vak getoond, gewoon, zonder oordeel.

### Meldingen

Een pushmelding op de telefoon of een Telegram-bericht als er iets gebeurt: een nieuw cijfer, een cijfer onder een gekozen grens, een gecorrigeerd cijfer, een afwezigheid, een toets die eraan komt, een huiswerkoverzicht ’s avonds, een weekoverzicht. Elke regel wordt per persoon ingesteld, met stille uren. Alles wat is verstuurd blijft in een inbox in de app staan, zodat een weggeveegde melding nooit verloren gaat.

### Gezin

Het gezin koppelt het schoolportaal één keer. Elk lid krijgt via een uitnodiging een eigen Marksy-login: de andere ouder, de grootouders, elk kind. Kinderen hebben het wachtwoord van het schoolportaal nooit nodig. Vrienden kunnen hun eigen gezin op dezelfde server aanmaken; gezinnen zien nooit elkaars gegevens.

### Jouw stijl, jouw taal

Lichte en donkere thema’s, kleurpaletten, behang, vijf lettertypen voor tekst, een kleur voor elk vak. Twaalf interfacetalen: Russisch, Belarussisch, Oekraïens, Kazachs, Engels, Pools, Duits, Spaans, Portugees, Frans, Nederlands en Roemeens, te kiezen per persoon. Engels en Russisch zijn door mensen nagekeken; de andere tien zijn machinevertalingen, in de app als zodanig aangegeven, met een link naar een kort formulier voor verbeteringen. Een taal toevoegen is één JSON-bestand ([`docs/i18n.md`](docs/i18n.md)).

## Nu bekijken

Open [`docs/mockups.html`](docs/mockups.html) in een browser. Het is een klikbaar prototype, ontworpen voor mobiel, van elk scherm met fictieve gegevens: wissel tussen een ouder en een kind, tussen twee kinderen, tussen licht en donker. De app is gebouwd om ermee overeen te komen.

## Hoe het werkt

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

- **Provider.** Een kleine module per schoolportaal. Die logt in met de inloggegevens van het gezin en levert leerlingen, periodes, vakken, lessen met cijfers en huiswerk, en eindcijfers in het gemeenschappelijke formaat van Marksy. De provider geeft aan wat het systeem biedt (lestypen, opmerkingen, aanwezigheid, periodes, een rooster vooruit) en welke cijferschaal het gebruikt, en de app past zich daar precies op aan.
- **Collector.** Dezelfde voor elke provider. Een paar keer per schooldag haalt hij de recente weken van elk kind op, herkent nieuwe, gewijzigde en verwijderde cijfers, bewaart de geschiedenis van elke wijziging en leest eens per week de hele periode opnieuw, omdat docenten oudere cijfers aanpassen. Hij werkt als planner: stond de computer een weekend uit, dan haalt de eerste run daarna in wat er gemist is.
- **API.** Levert de opgeslagen gegevens aan de app, beperkt tot één gezin, en documenteert zichzelf met OpenAPI op `/api/docs`.
- **App.** Een React-PWA met een offline-shell, installeerbaar op iOS en Android, vanaf de eerste schermen getest op echte telefoons via het thuisnetwerk.

## Elke school, elke schaal

Marksy werkt met een gemeenschappelijk model (leerlingen, periodes, vakken, lessen, cijfers, eindcijfers) en met een beschrijving van de **cijferschaal** die de provider levert: het bereik en de richting, vier niveaus, grenzen, doelen, hoe gemiddelden worden berekend en getoond, hoe eindcijfers worden afgerond. Een schaal van 10, van 5 of van 12, 1 tot 6 waarbij 1 het best is, 0 tot 20, letters met GPA, percentages, voldaan of niet voldaan: dezelfde schermen, gemiddelden, filters, doelen en tips werken voor elke schaal, ook als de schaal verandert tussen schooljaren of vakken.

Alles wat een schoolportaal wel of niet kan hebben is optioneel: lestypen, cijfercategorieën, opmerkingen, aanwezigheid, periodes, officiële eindcijfers, zelfs een rooster. Een provider geeft aan wat er is, en elk scherm toont wat bestaat in plaats van lege kolommen.

Om een nieuw systeem te koppelen schrijf je één provider: een manifest (inloggegevens, schaal, mogelijkheden, limieten voor verzoeken), een inlogfunctie, een handvol ophaalfuncties die antwoorden omzetten naar de gemeenschappelijke typen, een `sanitize()` voor testgegevens, en de gedeelde conformiteitstest. [`docs/adding-a-diary.md`](docs/adding-a-diary.md) legt uit wat daarvoor nodig is en hoe je om het systeem van je school vraagt; het volledige contract en een controlelijst staan in [`docs/providers.md`](docs/providers.md), en `providers/_template` is een startpunt dat al compileert.

## Respectvol ontworpen

- **Alleen lezen.** Marksy leest alleen. De gedeelde HTTP-client weigert elk verzoek buiten de toegestane lijst van de provider, zodat er in het schoolportaal niets per ongeluk kan veranderen.
- **Behoedzaam.** Hoogstens één keer inloggen per uur per account, één verzoek tegelijk met pauzes, steeds langer wachten bij fouten, een maximum per run. Handmatig vernieuwen deelt hetzelfde budget.
- **Veerkrachtig.** Elke poging en elke gecontroleerde week wordt vastgelegd. Storingen aan beide kanten worden automatisch ingehaald; na herhaalde mislukkingen pauzeert de synchronisatie en krijgt de beheerder van het gezin één bericht. Een verkeerd wachtwoord stopt de synchronisatie tot het is verbeterd, zodat het echte account nooit wordt geblokkeerd.
- **Netwerkbewust.** Sommige schoolportalen antwoorden het best vanuit hun eigen regio of zonder VPN. Elke provider geeft zijn netwerkeisen aan, en de collector draait op een machine thuis die daaraan voldoet: een pc, een mini-pc, een Raspberry Pi, een NAS.
- **Opgeruimd.** Cijfers en hun geschiedenis worden bewaard zolang het kind bij het gezin hoort; operationele gegevens (synchronisatielogs, ruwe antwoorden, gebeurtenissenfeeds) worden weken of maanden bewaard en daarna samengevoegd. De limieten staan in `env.example` onder `RETENTION_*`.

## Privacy

Marksy werkt met gegevens over kinderen, en de standaardinstellingen houden daar rekening mee.

- **Je gegevens blijven bij jou.** Geen analytics, geen scripts of lettertypen van derden, niets verlaat je server.
- **Overal sessies.** Elke route behalve inloggen, health en API-documentatie vereist een sessie, en elke query is beperkt tot één gezin.
- **Geheimen beschermd.** Wachtwoorden voor het schoolportaal worden versleuteld opgeslagen (AES-256-GCM); Marksy-wachtwoorden worden gehasht met argon2id. Logs bevatten nooit wachtwoorden, tokens of volledige namen.
- **Niets echts in de repository.** Testgegevens zijn fictief of opgeschoond; `pnpm privacy` controleert op geheimen, persoonsgegevens en bestanden die nooit gecommit mogen worden.
- **Gezinnen zijn eigenaar van hun gegevens.** Een gezin kan alles als JSON exporteren en zichzelf volledig wissen; de bewaartermijn is een instelling. Host je Marksy voor andere gezinnen, lees dan eerst sectie 14.1 van `docs/design.md`.

## Vereisten

- Een account bij een ondersteund schoolportaal (van een ouder of een leerling).
- Een computer die tijdens de schooldag aan staat, met Docker en verder niets: een pc of laptop thuis, een mini-pc, een Raspberry Pi of een NAS.
- Optioneel: een domein bij Cloudflare, om de app buiten het thuisnetwerk te gebruiken via Cloudflare Tunnel, hem op telefoons te installeren en Web Push te gebruiken; een Telegram-bottoken voor meldingen via Telegram.
- Om aan Marksy te ontwikkelen: Node.js 22, pnpm en Docker.

## In productie draaien

Om Marksy elke dag voor je gezin te laten draaien, op een laptop, een Raspberry Pi of een NAS, met alleen Docker op die computer: [docs/running.md](docs/running.md). Daar staan de installatie, de manieren om de app thuis en van buitenaf te bereiken (Cloudflare Tunnel), back-ups, herstellen en verhuizen naar een andere computer, en updates. Bij elke release zitten de bestanden die een host nodig heeft, als `marksy-deploy-vX.Y.Z.zip`.

Releases zijn genummerd als MAJOR.MINOR.PATCH: MAJOR is een grondige vernieuwing van de app (zelden), MINOR brengt nieuwe functies, PATCH brengt correcties en reparaties. Een host installeert nieuwe releases zelf, binnen enkele minuten, na te hebben gecontroleerd dat dit project ze heeft ondertekend, met vooraf een back-up en een weg terug als er iets misgaat.

## Snel aan de slag voor ontwikkelaars

De werkruimte draait de hele app vanuit de broncode: de database, de collector met zijn planner, de API met zijn documentatie, de app, en een fictief demogezin om alles te verkennen zonder account bij een schoolportaal. Je hebt Node.js 22, pnpm (`npm install -g pnpm` of `corepack enable`) en Docker nodig.

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

Het demogezin hoort bij een fictief schoolportaal en heeft twee kinderen, van wie één in een klas zonder cijfers, zodat elk scherm te verkennen is zonder account bij een schoolportaal; de logins (`parent@example.com` en `student@example.com`, wachtwoord getoond door `pnpm db:seed`) werken zodra het inloggen er is. Omdat dat wachtwoord openbaar is, weigert de seed te draaien als `PUBLIC_URL` een openbaar adres is (`--allow-public` heft dat op). `pnpm db:studio` opent de database in Drizzle Studio. `pnpm db:backup` schrijft een dump van de lokale database naar `data/backups/` (de laatste vijf blijven bewaard) en controleert die door hem in een tijdelijke database terug te zetten; `pnpm db:restore <file> --yes` zet er een terug. Heb je een account bij een schoolportaal, open dan de app, kies “Schoolportaal koppelen”, selecteer je schoolportaal en log in: Marksy controleert de inloggegevens één keer, maakt je gezin aan en start de eerste synchronisatie. Nodig de rest van het gezin uit via Meer en dan Gezin.

Met een account bij een schoolportaal richt `pnpm dev:connect` je eigen gezin in vanaf de opdrachtregel: het leest de login voor het schoolportaal (`DIARY_LOGIN`, `DIARY_PASSWORD`) en de gewenste Marksy-login (`MARKSY_DEV_EMAIL`, `MARKSY_DEV_PASSWORD`) uit `.env` en voert dezelfde code uit als “Schoolportaal koppelen”; opnieuw gestart na een reset van de database voegt het alleen toe wat ontbreekt, en na `pnpm sync:once` neemt het dat gezin over zonder opnieuw in te loggen bij het schoolportaal. Daarvoor kan een ontwikkelaar de lokale database vullen vanaf de opdrachtregel: zet de login voor het schoolportaal in `DIARY_LOGIN` en `DIARY_PASSWORD` in `.env` en voer `pnpm sync:once` uit. Die opdracht praat alleen met schoolportalen die aan gezinnen worden aangeboden, maakt bij het eerste gebruik een minimaal gezin aan en voert één synchronisatie uit volgens dezelfde regels als elke andere run (het maximum aantal verzoeken, de offlinecontrole, één keer inloggen per account per interval: 10 minuten voor handmatige opdrachten in ontwikkeling, het eigen interval van het schoolportaal in productie); `pnpm probe` leest elk endpoint één keer en vernieuwt de opgeschoonde testgegevens van de provider, en `pnpm probe --offline` herhaalt de controles op de opgeslagen antwoorden zonder in te loggen (de testgegevens worden alleen met `--write-fixtures` herschreven). De drie opdrachten die bij een echt schoolportaal inloggen delen een inlogbewaking. De pre-commitbewaking weigert een commit met lokale gegevens, geheimen, databasedumps of ruwe antwoorden, of met een naam of id uit de laatste echte antwoorden. `pnpm sync:once` toont alleen aantallen en statussen, en eindigt ook met 0 als de regels de run tegenhouden. Zolang `SYNC_ENABLED` op `true` staat, houdt `pnpm dev` dat account vanzelf bij, alleen tijdens de schooldag van elk kind. `pnpm sync:plan` laat zien wat de planner nu zou doen (het venster van elk kind vandaag, wat er wacht, of er een run zou starten) zonder ergens in te loggen.

### Op een telefoon in het thuisnetwerk

```bash
pnpm dev:lan                    # like pnpm dev, and the app also listens on the local network
```

Vite toont een `Network:`-adres zoals `http://192.168.1.20:5173`; open dat op een telefoon op hetzelfde wifinetwerk. Alles loopt via die ene poort: de appserver stuurt `/api` door naar de API, die zelf alleen op `127.0.0.1` luistert, dus inloggen werkt zonder extra instellingen. Sta op Windows Node.js toe op **particuliere** netwerken als de firewall erom vraagt en controleer of het wifiprofiel op Particulier staat. Installeren van de app, offlinemodus en Web Push hebben op een telefoon HTTPS nodig; dat komt met de PWA-mijlpaal (`docs/build-plan.md` M8).

`pnpm smoke:lan` controleert de API zoals een telefoon die ziet, zonder telefoon: terwijl `pnpm dev:lan` draait, zoekt het het thuisnetwerkadres van deze computer, logt in op `http://<address>:5173/api` met `MARKSY_DEV_EMAIL` en `MARKSY_DEV_PASSWORD` uit `.env` en leest de gegevens van elk kind. Het toont statussen, aantallen en de vorm van elk antwoord (sleutels en typen, geen waarden) en faalt als een antwoord een wachtwoord of het sessietoken bevat, of als de sessiecookie niet over gewoon http zou werken. Met `--host <ip>` kies je het adres zelf.

`pnpm smoke:ui` doet hetzelfde voor de schermen: terwijl `pnpm dev:lan` draait, opent het de app via het thuisnetwerkadres in een headless browser op telefoonformaat (360 px, aanraking) en tabletformaat, logt in als de demo-ouder (en als jij, wanneer `MARKSY_DEV_EMAIL` is ingesteld), loopt elk scherm van elk kind door en legt dezelfde toestanden van het klikbare prototype (`docs/mockups.html`) vast ter vergelijking. De schermafbeeldingen komen in `data/ui/` (de laatste drie runs), dat nooit wordt gecommit. Het heeft één keer Chromium voor Playwright nodig: `pnpm exec playwright install chromium`.

## Configuratie

Voor ontwikkeling staat alle configuratie in `.env` (aangemaakt door `pnpm setup:env` uit `env.example`); een productiehost heeft een eigen `.env.production` ([docs/running.md](docs/running.md), sectie 3). Geheimen komen nooit in de repository.

| Variabele | Doel |
|---|---|
| `DATABASE_URL`, `TEST_DATABASE_URL` | PostgreSQL voor de app (`marksy`, poort 5432, bewaard in een Docker-volume) en voor `pnpm test` (`marksy_test` op een aparte server in het geheugen, poort 5434, leeg na elke herstart) |
| `PORT`, `HOST` | Poort van de API (3000) en bindadres (`127.0.0.1`; andere apparaten bereiken de API via de appserver) |
| `SESSION_SECRET` | Willekeurige tekenreeks voor sessiecookies (gegenereerd) |
| `CREDENTIALS_KEY` | Sleutel van 32 bytes (base64) waarmee wachtwoorden voor het schoolportaal versleuteld worden opgeslagen (gegenereerd) |
| `SYNC_ENABLED` | `true` op de machine die met het schoolportaal praat, `false` op een kopie met alleen de API |
| `SYNC_WINDOW` | Optioneel: een buitengrens voor het schooldagvenster van elk kind (kan het alleen versmallen) |
| `SYNC_JITTER_MIN`, `SYNC_MIN_LOGIN_INTERVAL` | Willekeurige vertraging voor geplande runs; minimale tijd tussen twee keer inloggen per account (kan alleen omhoog) |
| `SYNC_TICK_MIN`, `SYNC_CATCHUP_AFTER`, `SYNC_MAX_REQUESTS_PER_RUN` | Planner: hoe vaak hij beslist, wanneer een inhaalrun mag, hoeveel één run mag ophalen |
| `SYNC_FAILURES_BEFORE_PAUSE`, `SYNC_PAUSE_HOURS`, `SYNC_PAUSE_MAX_HOURS`, `SYNC_OFFLINE_RETRY_MIN` | Omgaan met fouten: mislukkingen vóór een pauze, de pauze (verdubbelend tot een week), opnieuw proberen als deze machine offline is |
| `RETENTION_*` | Hoe lang operationele gegevens bewaard blijven (synchronisatielog, ruwe antwoorden, gebeurtenissenfeeds, dekking) |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Sleutels voor Web Push |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` | Telegram-bot (optioneel) |
| `MARKSY_ENV`, `DEV_MIN_LOGIN_INTERVAL_MINUTES` | Limieten van de handmatige opdrachten voor het schoolportaal (`pnpm probe`, `pnpm sync:once`, `pnpm dev:connect`). `development` (ingesteld in `env.example`): één keer inloggen per account per 10 minuten of meer, op elk uur van de dag. Elke andere waarde, ook een ontbrekende, en elke build met `NODE_ENV=production`: het eigen interval van het schoolportaal (voor de meeste een uur). `pnpm env:dev` voegt de twee ontwikkelregels toe aan een oudere `.env` die ze mist, zonder al ingestelde waarden te wijzigen. Geplande synchronisaties volgen in beide gevallen de regels van de schooldag |
| `MARKSY_RUNNER` | Leeg laten. Wordt door `.claude/settings.json` op `claude` gezet voor Claude Code: in productie mag die hoogstens drie keer per dag echt inloggen, tijdens schooltijd |
| `DIARY_LOGIN`, `DIARY_PASSWORD`, `MARKSY_DEV_EMAIL`, `MARKSY_DEV_PASSWORD` | Alleen voor ontwikkeling: je eigen login voor het schoolportaal voor `pnpm probe`, `pnpm sync:once` en `pnpm dev:connect`, en de Marksy-login die `dev:connect` aanmaakt. De app zelf bewaart de inloggegevens van het schoolportaal versleuteld in de database |
| `TZ` | Tijdzone van de school (IANA-naam) |

## Indeling van de repository

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

Begin met `docs/running.md` om Marksy te draaien, `docs/ux-principles.md` om te zien waarom de interface is zoals hij is, `docs/design.md` om het product te begrijpen of te veranderen, en `docs/adding-a-diary.md` om een ander schoolportaal te koppelen.

## Routekaart

Het volledige plan met acceptatiecriteria staat in [`docs/build-plan.md`](docs/build-plan.md).

Gereed:

1. Kern: gemeenschappelijk model, cijferschalen, rekenen met cijfers, HTTP-client, talen.
2. De eerste provider en zijn conformiteitstests.
3. Server: database, collector, planner, fictieve seedgegevens.
4. Accounts, gezinnen, uitnodigingen en de lees-API.
5. De app: Start, Aandacht, cijfers, eindcijfers, vakken, vakpagina, rooster, instellingen, weergave; daarna vertalingen in de andere tien talen.
6. Thuis draaien (1.0): productie-images, back-ups, toegang op afstand, ondertekende automatische updates.

Hierna:

7. Labels.
8. Leertijd.
9. Installeerbare PWA met offlinemodus.
10. Meldingen: inbox, regels, Web Push, Telegram.

## Bijdragen

Pull requests worden niet geaccepteerd. Bugmeldingen, ideeën en vertaalcorrecties, van de app of van deze pagina in jouw taal, zijn heel welkom als [Issues](https://github.com/Dopetast1c/Marksy/issues), in het Engels of het Russisch.

Verandert de API van een schoolportaal, open dan een issue met een opgeschoond antwoord (namen, id’s en opmerkingen vervangen), de id van de provider en de datum.

Het project wordt gebouwd met Claude Code volgens `docs/build-plan.md`; de skills en agents die daarbij worden gebruikt staan in `.claude/`, en de regels die de code volgt staan in `CLAUDE.md`. Pas je Marksy aan voor je eigen niet-commerciële gebruik, dan legt `docs/providers.md` uit hoe je een schoolportaal toevoegt en `docs/i18n.md` hoe je een taal toevoegt.

## Disclaimer

Marksy is een onafhankelijk project met beschikbare broncode. Het is niet verbonden aan, goedgekeurd door of ondersteund door een school, onderwijsinstantie of leverancier van een schoolportaal. Het gebruikt de API van een schoolportaal namens een ouder of leerling die daar een account heeft, leest alleen gegevens en is bedoeld voor je eigen gezin.

## Licentie

Marksy valt onder de [PolyForm Noncommercial License 1.0.0](LICENSE).

**Je mag** het gebruiken, kopiëren en aanpassen voor elk niet-commercieel doel: thuis voor je eigen gezin, voor studie, onderzoek, hobbyprojecten en tests, en op scholen, andere onderwijsinstellingen, goede doelen, publieke onderzoeksorganisaties en overheidsinstellingen.

**Je mag het niet** commercieel gebruiken: niet verkopen, geen betaalde hosting of betaalde dienst die erop is gebouwd, niet opnemen in een betaald product, en geen gebruik door een bedrijf voor eigen doeleinden.

Heb je een commerciële licentie nodig, vraag het dan aan de auteur via een [issue](https://github.com/Dopetast1c/Marksy/issues). De [volledige tekst van de licentie](LICENSE) is bepalend; deze samenvatting is alleen een hulpmiddel.
