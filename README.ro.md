<!-- source: README.md sha256:7a71e523a772 · machine -->
[English](README.md) · [Русский](README.ru.md) · [Беларуская](README.be.md) · [Українська](README.uk.md) · [Қазақша](README.kk.md) · [Polski](README.pl.md) · [Deutsch](README.de.md) · [Español](README.es.md) · [Português](README.pt.md) · [Français](README.fr.md) · [Nederlands](README.nl.md) · **Română**

> Această pagină este o traducere automată a README-ului în engleză, care rămâne textul ce face fe. Corecturile sunt binevenite prin formularul [Traducerea documentației](https://github.com/Dopetast1c/Marksy/issues/new?template=docs-translation.yml).

# Marksy

**Anul școlar al copiilor voștri, într-un singur loc, liniștit și clar.**

Marksy este o aplicație de familie pentru notele școlare, cu cod sursă disponibil și gratuită pentru uz personal și alte utilizări necomerciale. Se conectează la catalogul electronic pe care școala îl folosește deja, citește notele, orarul și temele prin API-ul propriu al catalogului și construiește deasupra un strat mai bogat: medii și tendințe pentru fiecare materie și perioadă, istoricul complet al fiecărei note, un plan pentru zilele următoare, un cronometru pentru studiu, notificări și conturi separate pentru fiecare părinte și fiecare copil. Rulează pe propriul calculator, se instalează pe orice telefon ca aplicație și vorbește douăsprezece limbi.

[![License: PolyForm Noncommercial 1.0.0](https://img.shields.io/badge/license-PolyForm%20Noncommercial%201.0.0-blue.svg)](LICENSE)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6.svg)
![PWA](https://img.shields.io/badge/app-PWA-5a0fc8.svg)
![Self-hosted](https://img.shields.io/badge/data-self--hosted-2f7a4a.svg)

> **Stare: 1.0, prima versiune.** Notele, notele finale, materiile, orarul cu temele, familia și aspectul aplicației funcționează și sunt folosite zilnic, acasă, pe un calculator care se actualizează singur. Urmează etichetele, timpul de studiu, aplicația instalabilă cu mod offline și notificările, în această ordine ([`docs/build-plan.md`](docs/build-plan.md)). Secțiunile de mai jos descriu produsul întreg.

## Ideea

Catalogul școlar este sursa adevărului: profesorii pun acolo în fiecare zi note, subiectele lecțiilor, teme și orarul, iar catalogul le pune la dispoziție prin API-ul său. Sunt multe date valoroase, iar o bună parte din valoarea lor apare în timp și de la o materie la alta: cum merge o materie în această perioadă, ce s-a schimbat de ieri, ce test vine marți, dacă săptămâna aceasta a mers mai bine decât cea trecută.

Marksy preia aceste date și construiește pe ele pentru familie:

- **Ține minte.** Fiecare notă este păstrată cu întregul ei istoric, așa că familia vede nu doar unde se află lucrurile, ci și cum s-a ajuns acolo, inclusiv notele corectate mai târziu de profesor.
- **Rezumă.** Medii pe materie pentru o săptămână, o lună, o perioadă școlară sau un an, comparate cu perioada anterioară, cu distribuția notelor și o tendință.
- **Privește înainte.** Lecțiile de mâine cu temele lor, testele care urmează și ce e de învățat pe de rost, evidențiate cu zile înainte.
- **Adună familia.** Un singur cont de catalog servește întreaga familie; fiecare părinte și fiecare copil are propriul cont, propriile notificări și propria vedere.
- **Călătorește.** Sistemul de catalog este un modul care se conectează. Tot restul, fiecare ecran și fiecare cifră, este comun, așa că o țară, o regiune sau o școală nouă primește aplicația întreagă adăugând un singur provider mic.

## Ce primiți

### Acasă

Ziua dintr-o privire. Două cifre pentru perioada aleasă, media și numărul de note, fiecare cu valoarea din perioada anterioară. Apoi notele de azi, timpul de studiu, blocul **Atenție** (puținele lucruri care merită o privire chiar acum: o notă mică, un test care se apropie, o medie care scade, ceva de adus mâine) și lecțiile de mâine cu temele lor. Mai jos, statisticile: notele pe niveluri de calitate, distribuția pe valori și o tendință pe săptămână, lună, perioadă școlară sau an.

Fiecare ecran cu cifre are același control de perioadă: alegeți o săptămână, o lună, o perioadă școlară sau un an, apoi mergeți înapoi la oricare dintre cele anterioare cu săgeți, cu un gest de glisare sau dintr-o listă.

### Note

Toate notele într-un singur flux, grupate pe zile, cu materia, tipul de lucrare, subiectul lecției și comentariul profesorului. Filtrați după etichete precum „Test” sau „Poezie”, una sau mai multe deodată. La o atingere distanță sunt **notele finale**: un tabel cu rezultatele pe perioade și pe an pentru fiecare materie, în care o perioadă încă în desfășurare arată media curentă, astfel încât o tendință nu este niciodată confundată cu un rezultat final.

### Materii

Toate materiile copilului, mereu: media pentru perioadă, direcția în care evoluează, cât era înainte și ultimele note. Sortați alfabetic, de la cele mai slabe sau de la cele mai bune, ori după cea mai mare creștere sau scădere. În clasele în care încă nu se dau note, aceeași listă arată în schimb lecțiile, temele și timpul de studiu.

### O materie de aproape

Fiecare materie are propria pagină, colorată în culoarea materiei: obiectivul pentru perioadă („pentru un 8 ai nevoie de doi de 9 sau de un 10”), lucrurile care merită atenție, statistici și tendință, fiecare notă cu comentariul ei, lecțiile următoare, rezultatele pe perioade și timpul de studiu.

### Orar și teme

O zi sau o săptămână întreagă, înapoi și înainte, câte un rând pe lecție cu ora, sala, subiectul, tema și nota de la acea lecție; înaintea unei lecții, media materiei și ultimele note chiar sub ea. Lecțiile pentru care copilul s-a pregătit primesc o bifă **Gata** pe care o vede toată familia. Familiile pot adăuga teme proprii și pot marca o lecție ca anulată. Golurile din zi apar ca goluri, așa că un început mai târziu se vede imediat.

### Etichete

Spuneți-i lui Marksy ce contează, cu cuvintele școlii voastre: o poezie de învățat, un test, ceva de adus. O etichetă înseamnă câteva cuvinte-cheie pe care Marksy le caută în subiectele lecțiilor și în teme. Lecțiile etichetate sunt evidențiate în orar și apar pe ecranul principal cu zile înainte, împreună cu exact cuvintele care s-au potrivit. Fiecare limbă vine cu etichete gata făcute, care pot fi modificate liber.

### Timp de studiu

Un cronometru pentru teme, pornit de la o lecție sau de la o materie, cu pauză și încheiere, și o bară mică ce rămâne pe ecran cât timp rulează. Încheierea unei sesiuni și marcarea unei lecții ca gata sunt acțiuni separate, pentru că o pauză nu înseamnă sfârșitul. Când cronometrul nu a fost folosit, Marksy estimează timpul din bifele „Gata” ale serii și marchează estimarea ca atare. Timpul este afișat pe zi și pe materie, simplu, fără judecăți.

### Notificări

O notificare push pe telefon sau un mesaj în Telegram când se întâmplă ceva: o notă nouă, o notă sub un nivel ales, o notă corectată, o absență, un test care se apropie, un rezumat al temelor seara, un rezumat săptămânal. Fiecare regulă se stabilește pentru fiecare persoană în parte, cu ore de liniște. Tot ce s-a trimis rămâne într-o căsuță de mesaje din aplicație, așa că o notificare închisă din greșeală nu se pierde niciodată.

### Familie

Familia conectează catalogul o singură dată. Fiecare membru primește propriul cont Marksy printr-o invitație: celălalt părinte, bunicii, fiecare copil. Copiii nu au nevoie niciodată de parola catalogului. Prietenii își pot crea propria familie pe același server; familiile nu văd niciodată datele celorlalte.

### Aspectul vostru, limba voastră

Teme luminoase și întunecate, palete de culori, imagini de fundal, cinci fonturi pentru text, o culoare pentru fiecare materie. Douăsprezece limbi ale interfeței: rusă, belarusă, ucraineană, kazahă, engleză, poloneză, germană, spaniolă, portugheză, franceză, neerlandeză și română, alese de fiecare persoană. Engleza și rusa sunt verificate de oameni; celelalte zece sunt traduceri automate, marcate ca atare în aplicație, care trimite la un formular scurt pentru corecturi. Adăugarea unei limbi înseamnă un singur fișier JSON ([`docs/i18n.md`](docs/i18n.md)).

## Vedeți-o acum

Deschideți [`docs/mockups.html`](docs/mockups.html) într-un browser. Este un prototip interactiv, gândit întâi pentru mobil, al fiecărui ecran, cu date fictive: comutați între un părinte și un copil, între doi copii, între temele luminoasă și întunecată. Aplicația este construită după el.

## Cum funcționează

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

- **Providerul.** Un modul mic pentru fiecare sistem de catalog. Se autentifică cu datele de acces ale familiei și returnează elevii, perioadele, materiile, lecțiile cu note și teme și notele finale în formatul comun al lui Marksy. Declară ce oferă sistemul său (tipuri de lecții, comentarii, prezență, perioade, un orar pentru zilele viitoare) și scala sa de notare, iar aplicația se adaptează exact la acestea.
- **Colectorul.** Același pentru toți providerii. De câteva ori în timpul zilei de școală aduce ultimele săptămâni pentru fiecare copil, detectează notele noi, modificate și șterse, păstrează istoricul fiecărei schimbări și recitește întreaga perioadă o dată pe săptămână, pentru că profesorii modifică și note mai vechi. Funcționează ca un planificator: dacă calculatorul a fost oprit în weekend, prima rulare de după recuperează ce s-a pierdut.
- **API-ul.** Servește aplicației datele salvate, limitate la o singură familie, și se documentează singur cu OpenAPI la `/api/docs`.
- **Aplicația.** O PWA în React cu o structură care funcționează offline, care se instalează pe iOS și Android și este testată pe telefoane reale în rețeaua de acasă încă de la primele ecrane.

## Orice școală, orice scală

Marksy lucrează pe un model comun (elevi, perioade, materii, lecții, note, note finale) și pe o descriere a **scalei de notare** furnizată de provider: intervalul și sensul, patru niveluri de calitate, praguri, obiective, cum se calculează și se afișează mediile, cum se rotunjesc notele finale. O scală de 10 puncte, una de 5, una de 12, de la 1 la 6 unde 1 e cea mai bună, de la 0 la 20, litere cu GPA, procente, admis sau respins: aceleași ecrane, medii, filtre, obiective și sfaturi funcționează pentru fiecare, chiar și când scala se schimbă de la un an școlar la altul sau de la o materie la alta.

Tot ce un catalog poate avea sau nu este opțional: tipuri de lecții, categorii de note, comentarii, prezență, perioade, note finale oficiale, chiar și orarul. Un provider declară ce există, iar fiecare ecran arată ce există, în loc de coloane goale.

Pentru a conecta un sistem nou, scrieți un singur provider: un manifest (date de acces, scală, capabilități, limite de cereri), o funcție de autentificare, câteva funcții de citire care transformă răspunsurile în tipurile comune, o funcție `sanitize()` pentru datele de test și testul comun de conformitate. [`docs/adding-a-diary.md`](docs/adding-a-diary.md) explică ce presupune acest lucru și cum puteți cere sistemul școlii voastre; contractul complet și o listă de verificare sunt în [`docs/providers.md`](docs/providers.md), iar `providers/_template` este un punct de pornire care se compilează.

## Respectuos prin construcție

- **Doar citire.** Marksy doar citește. Clientul HTTP comun refuză orice cerere din afara listei permise a providerului, așa că nimic din catalog nu poate fi schimbat din greșeală.
- **Blând.** Cel mult o autentificare pe oră pentru fiecare cont, o singură cerere odată, cu pauze, așteptare tot mai lungă la erori, o limită pe rulare. Reîmprospătarea manuală folosește același buget.
- **Rezistent.** Fiecare încercare și fiecare săptămână verificată sunt înregistrate. Întreruperile de pe oricare parte sunt recuperate automat; după eșecuri repetate, sincronizarea se oprește temporar, iar administratorul familiei este anunțat o singură dată. O parolă greșită oprește sincronizarea până când este corectată, așa că adevăratul cont nu este niciodată blocat.
- **Atent la rețea.** Unele sisteme de catalog răspund cel mai bine din propria regiune sau fără VPN. Fiecare provider își declară nevoile de rețea, iar colectorul rulează acasă, pe un dispozitiv care le îndeplinește: un PC, un mini PC, un Raspberry Pi, un NAS.
- **Ordonat.** Notele și istoricul lor sunt păstrate cât timp copilul face parte din familie; datele operaționale (jurnalele de sincronizare, răspunsurile brute, fluxurile de evenimente) sunt păstrate săptămâni sau luni, apoi comprimate. Limitele sunt în `env.example`, la `RETENTION_*`.

## Confidențialitate

Marksy lucrează cu date despre copii, iar setările sale implicite țin cont de asta.

- **Datele rămân la voi.** Fără analitică, fără scripturi sau fonturi de la terți, nimic nu iese de pe serverul vostru.
- **Sesiuni peste tot.** Fiecare rută, cu excepția autentificării, a verificării stării și a documentației API, cere o sesiune, iar fiecare interogare este limitată la o singură familie.
- **Secrete protejate.** Parolele catalogului sunt păstrate criptat (AES-256-GCM); parolele Marksy sunt stocate ca hash cu argon2id. Jurnalele nu conțin niciodată parole, tokenuri sau nume complete.
- **Nimic real în depozit.** Datele de test sunt fictive sau curățate; `pnpm privacy` caută secrete, date personale și fișiere care nu trebuie trimise niciodată în depozit.
- **Familiile își dețin datele.** O familie poate exporta totul în JSON și se poate șterge complet; perioada de păstrare este o setare. Dacă găzduiți Marksy pentru alte familii, citiți mai întâi secțiunea 14.1 din `docs/design.md`.

## Cerințe

- Un cont într-un catalog școlar acceptat (al unui părinte sau al unui elev).
- Un calculator pornit în timpul zilei de școală, cu Docker și nimic altceva: un PC sau un laptop de acasă, un mini PC, un Raspberry Pi sau un NAS.
- Opțional: un domeniu pe Cloudflare, pentru a folosi aplicația în afara rețelei de acasă prin Cloudflare Tunnel, a o instala pe telefoane și pentru Web Push; un token de bot Telegram pentru notificările în Telegram.
- Pentru a dezvolta Marksy: Node.js 22, pnpm și Docker.

## Rularea în producție

Pentru a rula Marksy zilnic pentru familia voastră, pe un laptop, un Raspberry Pi sau un NAS, cu doar Docker pe acel calculator: [docs/running.md](docs/running.md). Ghidul acoperă instalarea, modurile de a ajunge la aplicație acasă și din afară (Cloudflare Tunnel), copiile de rezervă, restaurarea și mutarea pe alt calculator, precum și actualizările. Fiecare versiune are atașate fișierele de care are nevoie un server, ca `marksy-deploy-vX.Y.Z.zip`.

Versiunile sunt numerotate MAJOR.MINOR.PATCH: MAJOR înseamnă o refacere globală a aplicației (rar), MINOR aduce funcții noi, PATCH aduce corecturi și remedieri. Un server instalează singur versiunile noi, în câteva minute, după ce verifică faptul că sunt semnate de acest proiect, cu o copie de rezervă înainte și o cale de întoarcere dacă ceva nu merge bine.

## Pornire rapidă pentru dezvoltatori

Spațiul de lucru rulează întreaga aplicație din codul sursă: baza de date, colectorul cu planificatorul său, API-ul cu documentația lui, aplicația și o familie demonstrativă fictivă, pentru a o explora fără un cont de catalog. Aveți nevoie de Node.js 22, pnpm (`npm install -g pnpm` sau `corepack enable`) și Docker.

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

Familia demonstrativă aparține unui catalog fictiv și are doi copii, unul dintre ei într-o clasă fără note, așa că fiecare ecran poate fi explorat fără un cont de catalog; conturile ei (`parent@example.com` și `student@example.com`, cu parola afișată de `pnpm db:seed`) funcționează odată ce apare autentificarea. Pentru că această parolă este publică, datele demonstrative refuză să se încarce când `PUBLIC_URL` este o adresă publică (`--allow-public` trece peste asta). `pnpm db:studio` deschide baza de date în Drizzle Studio. `pnpm db:backup` scrie o copie a bazei de date locale în `data/backups/` (se păstrează ultimele cinci) și o verifică restaurând-o într-o bază de date temporară; `pnpm db:restore <file> --yes` pune una înapoi. Cu un cont de catalog, deschideți aplicația, alegeți „Conectează un catalog”, selectați sistemul vostru de catalog și autentificați-vă: Marksy verifică datele de acces o singură dată, creează familia și pornește prima sincronizare. Restul familiei îl invitați din „Mai mult”, apoi „Familie”.

Cu un cont de catalog, `pnpm dev:connect` configurează propria familie din linia de comandă: citește din `.env` datele de acces la catalog (`DIARY_LOGIN`, `DIARY_PASSWORD`) și contul Marksy dorit (`MARKSY_DEV_EMAIL`, `MARKSY_DEV_PASSWORD`) și rulează același cod ca „Conectează un catalog”; rulată din nou după resetarea bazei de date, adaugă doar ce lipsește, iar peste `pnpm sync:once` preia acea familie fără o nouă autentificare în catalog. Înainte de asta, un dezvoltator poate umple baza de date locală din linia de comandă: puneți datele de acces la catalog în `DIARY_LOGIN` și `DIARY_PASSWORD` din `.env` și rulați `pnpm sync:once`. Comanda comunică doar cu sistemele de catalog oferite familiilor, creează o familie minimă la prima folosire și rulează o sincronizare după aceleași reguli ca orice altă rulare (limita de cereri, verificarea conexiunii, o autentificare pe cont pe interval: 10 minute pentru comenzile manuale în dezvoltare, intervalul propriu al sistemului de catalog în producție); `pnpm probe` citește fiecare endpoint o dată și reîmprospătează datele de test curățate ale providerului, iar `pnpm probe --offline` repetă verificările pe răspunsurile salvate, fără autentificare (rescrie datele de test doar cu `--write-fixtures`). Cele trei comenzi care se autentifică într-un catalog real împart o protecție comună pentru autentificare. Protecția de dinaintea commit-ului refuză un commit care include date locale, secrete, copii ale bazei de date sau răspunsuri brute, ori orice nume sau id din cele mai recente răspunsuri reale. Afișează doar numere și stări și se încheie cu 0 și atunci când regulile amână rularea. Cât timp `SYNC_ENABLED` este `true`, `pnpm dev` ține singur acel cont sincronizat, doar în timpul zilei de școală a fiecărui copil. `pnpm sync:plan` arată ce ar face planificatorul acum (intervalul de azi al fiecărui copil, ce așteaptă, dacă ar porni o rulare) fără să se autentifice nicăieri.

### Pe un telefon din rețeaua de acasă

```bash
pnpm dev:lan                    # like pnpm dev, and the app also listens on the local network
```

Vite afișează o adresă `Network:`, de exemplu `http://192.168.1.20:5173`; deschideți-o pe un telefon conectat la aceeași rețea Wi-Fi. Totul trece prin acest singur port: serverul aplicației trimite `/api` mai departe către API, care ascultă doar pe `127.0.0.1`, așa că autentificarea funcționează fără configurări suplimentare. Pe Windows, permiteți Node.js în rețelele **private** când întreabă firewallul și asigurați-vă că profilul Wi-Fi este Privat. Instalarea aplicației, modul offline și Web Push au nevoie de HTTPS pe telefon; acestea vin odată cu etapa PWA (`docs/build-plan.md` M8).

`pnpm smoke:lan` verifică API-ul așa cum îl vede un telefon, fără telefon: cât timp rulează `pnpm dev:lan`, găsește adresa acestui calculator în rețeaua de acasă, se autentifică la `http://<address>:5173/api` cu `MARKSY_DEV_EMAIL` și `MARKSY_DEV_PASSWORD` din `.env` și citește datele fiecărui copil. Afișează stările, numerele și forma fiecărui răspuns (chei și tipuri, fără valori) și eșuează când un răspuns conține o parolă sau tokenul sesiunii, ori când cookie-ul de sesiune nu ar funcționa prin http simplu. Cu `--host <ip>` alegeți singuri adresa.

`pnpm smoke:ui` face același lucru pentru ecrane: cu `pnpm dev:lan` pornit, deschide aplicația la adresa din rețeaua de acasă într-un browser fără interfață, la dimensiunea unui telefon (360 px, atingere) și a unei tablete, se autentifică drept părintele demonstrativ (și drept voi, când `MARKSY_DEV_EMAIL` este setat), parcurge fiecare ecran al fiecărui copil și fotografiază aceleași stări ale prototipului interactiv (`docs/mockups.html`) pentru comparație. Capturile de ecran ajung în `data/ui/` (ultimele trei rulări), care nu intră niciodată în depozit. Are nevoie o singură dată de Chromium pentru Playwright: `pnpm exec playwright install chromium`.

## Configurare

Pentru dezvoltare, toată configurarea este în `.env` (creat de `pnpm setup:env` din `env.example`); un server de producție are propriul `.env.production` ([docs/running.md](docs/running.md), secțiunea 3). Secretele nu ajung niciodată în depozit.

| Variabilă | Rol |
|---|---|
| `DATABASE_URL`, `TEST_DATABASE_URL` | PostgreSQL pentru aplicație (`marksy`, portul 5432, păstrat într-un volum Docker) și pentru `pnpm test` (`marksy_test` pe un server separat, în memorie, portul 5434, gol după fiecare repornire) |
| `PORT`, `HOST` | Portul API-ului (3000) și adresa pe care ascultă (`127.0.0.1`; celelalte dispozitive ajung la API prin serverul aplicației) |
| `SESSION_SECRET` | Șir aleatoriu pentru cookie-urile de sesiune (generat) |
| `CREDENTIALS_KEY` | Cheie de 32 de octeți (base64) care criptează parolele catalogului salvate (generată) |
| `SYNC_ENABLED` | `true` pe dispozitivul care comunică cu catalogul, `false` pe o copie doar cu API |
| `SYNC_WINDOW` | Opțional: o limită exterioară pentru intervalul zilei de școală al fiecărui copil (îl poate doar îngusta) |
| `SYNC_JITTER_MIN`, `SYNC_MIN_LOGIN_INTERVAL` | Întârziere aleatorie pentru rulările programate; timpul minim între autentificări pentru fiecare cont (poate fi doar mărit) |
| `SYNC_TICK_MIN`, `SYNC_CATCHUP_AFTER`, `SYNC_MAX_REQUESTS_PER_RUN` | Planificatorul: cât de des decide, când este permisă o rulare de recuperare, cât poate aduce o rulare |
| `SYNC_FAILURES_BEFORE_PAUSE`, `SYNC_PAUSE_HOURS`, `SYNC_PAUSE_MAX_HOURS`, `SYNC_OFFLINE_RETRY_MIN` | Tratarea eșecurilor: eșecuri înainte de o pauză, pauza (care se dublează până la o săptămână), reîncercarea când acest dispozitiv este offline |
| `RETENTION_*` | Cât timp se păstrează datele operaționale (jurnalul de sincronizare, răspunsurile brute, fluxurile de evenimente, acoperirea) |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Cheile Web Push |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` | Botul Telegram (opțional) |
| `MARKSY_ENV`, `DEV_MIN_LOGIN_INTERVAL_MINUTES` | Limitele comenzilor manuale pentru catalog (`pnpm probe`, `pnpm sync:once`, `pnpm dev:connect`). `development` (setat în `env.example`): o autentificare pe cont la cel puțin 10 minute, la orice oră. Orice altă valoare, inclusiv lipsa ei, și orice build cu `NODE_ENV=production`: intervalul propriu al sistemului de catalog (o oră pentru cele mai multe). `pnpm env:dev` adaugă cele două rânduri pentru dezvoltare într-un `.env` mai vechi care nu le are, fără să atingă valorile deja setate. Sincronizările programate respectă regulile zilei de școală în ambele cazuri |
| `MARKSY_RUNNER` | Lăsați gol. Setat la `claude` pentru Claude Code de `.claude/settings.json`: în producție, autentificările sale reale sunt limitate la trei pe zi, în orele de școală |
| `DIARY_LOGIN`, `DIARY_PASSWORD`, `MARKSY_DEV_EMAIL`, `MARKSY_DEV_PASSWORD` | Doar pentru dezvoltare: propriile date de acces la catalog pentru `pnpm probe`, `pnpm sync:once` și `pnpm dev:connect` și contul Marksy pe care îl creează `dev:connect`. Aplicația însăși păstrează datele de acces la catalog în baza de date, criptate |
| `TZ` | Fusul orar al școlii (nume IANA) |

## Structura depozitului

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

Începeți cu `docs/running.md` pentru a rula Marksy, cu `docs/ux-principles.md` pentru a vedea de ce interfața este așa cum este, cu `docs/design.md` pentru a înțelege sau a schimba produsul și cu `docs/adding-a-diary.md` pentru a conecta un alt sistem de catalog.

## Plan de dezvoltare

Planul complet, cu criteriile de acceptare, este în [`docs/build-plan.md`](docs/build-plan.md).

Gata:

1. Nucleul: modelul comun, scalele de notare, calculele pentru note, clientul HTTP, limbile.
2. Primul provider și testele lui de conformitate.
3. Serverul: baza de date, colectorul, planificatorul, datele demonstrative fictive.
4. Conturile, familiile, invitațiile și API-ul de citire.
5. Aplicația: Acasă, Atenție, Note, Note finale, Materii, pagina materiei, Orar, setări, Aspect; apoi traducerile în celelalte zece limbi.
6. Rularea acasă (1.0): imagini de producție, copii de rezervă, acces de la distanță, actualizări automate semnate.

Urmează:

7. Etichete.
8. Timp de studiu.
9. PWA instalabilă cu mod offline.
10. Notificări: căsuța de mesaje, reguli, Web Push, Telegram.

## Contribuții

Pull requesturile nu sunt acceptate. Rapoartele de erori, ideile și corecturile de traducere, ale aplicației sau ale acestei pagini în limba voastră, sunt foarte binevenite ca [Issues](https://github.com/Dopetast1c/Marksy/issues), în engleză sau în rusă.

Dacă API-ul unui catalog se schimbă, deschideți un issue cu un răspuns curățat (nume, id-uri și comentarii înlocuite), id-ul providerului și data.

Proiectul este construit cu Claude Code după `docs/build-plan.md`; skill-urile și agenții pe care îi folosește sunt în `.claude/`, iar regulile pe care le respectă codul sunt în `CLAUDE.md`. Dacă modificați Marksy pentru propriul uz necomercial, `docs/providers.md` explică cum se adaugă un sistem de catalog, iar `docs/i18n.md` cum se adaugă o limbă.

## Declinarea responsabilității

Marksy este un proiect independent, cu cod sursă disponibil. Nu este afiliat cu, aprobat de sau susținut de nicio școală, autoritate din educație sau furnizor de catalog. Folosește API-ul unui catalog în numele unui părinte sau al unui elev care are cont acolo, doar citește date și este gândit pentru propria familie.

## Licență

Marksy este licențiat sub [PolyForm Noncommercial License 1.0.0](LICENSE).

**Aveți voie** să îl folosiți, să îl copiați și să îl modificați în orice scop necomercial: acasă pentru propria familie, pentru studiu, cercetare, proiecte de hobby și testare, precum și în școli, alte instituții de învățământ, organizații caritabile, organizații publice de cercetare și instituții guvernamentale.

**Nu aveți voie** să îl folosiți comercial: fără vânzarea lui, fără găzduire plătită sau servicii plătite construite pe el, fără includerea lui într-un produs plătit și fără folosirea lui de către o firmă în scopuri proprii.

Dacă aveți nevoie de o licență comercială, întrebați autorul printr-un [issue](https://github.com/Dopetast1c/Marksy/issues). Contează [textul complet al licenței](LICENSE); acest rezumat este doar un ghid.
