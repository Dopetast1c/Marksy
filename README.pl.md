<!-- source: README.md sha256:7a71e523a772 · machine -->
[English](README.md) · [Русский](README.ru.md) · [Беларуская](README.be.md) · [Українська](README.uk.md) · [Қазақша](README.kk.md) · **Polski** · [Deutsch](README.de.md) · [Español](README.es.md) · [Português](README.pt.md) · [Français](README.fr.md) · [Nederlands](README.nl.md) · [Română](README.ro.md)

> Ta strona jest tłumaczeniem maszynowym angielskiego README; wiążący jest tekst angielski. Poprawki są mile widziane przez formularz [„Tłumaczenie dokumentacji”](https://github.com/Dopetast1c/Marksy/issues/new?template=docs-translation.yml).

# Marksy

**Rok szkolny waszych dzieci w jednym spokojnym, przejrzystym miejscu.**

Marksy to rodzinna aplikacja do ocen szkolnych, z dostępnym kodem źródłowym, bezpłatna do użytku osobistego i każdego innego niekomercyjnego. Łączy się z dziennikiem elektronicznym, którego szkoła już używa, odczytuje oceny, plan lekcji i zadania domowe przez własne API dziennika i buduje na tym bogatszą warstwę: średnie i trendy dla każdego przedmiotu i okresu, pełną historię każdej oceny, plan na najbliższe dni, stoper do nauki, powiadomienia oraz osobne loginy dla każdego rodzica i każdego dziecka. Działa na waszym własnym komputerze, instaluje się na każdym telefonie jako aplikacja i mówi w dwunastu językach.

[![License: PolyForm Noncommercial 1.0.0](https://img.shields.io/badge/license-PolyForm%20Noncommercial%201.0.0-blue.svg)](LICENSE)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6.svg)
![PWA](https://img.shields.io/badge/app-PWA-5a0fc8.svg)
![Self-hosted](https://img.shields.io/badge/data-self--hosted-2f7a4a.svg)

> **Stan: 1.0, pierwsze wydanie.** Oceny, oceny końcowe, przedmioty, plan lekcji z zadaniami domowymi, rodzina i wygląd aplikacji działają i są używane na co dzień, w domu, na komputerze, który sam się aktualizuje. Tagi, czas nauki, instalowalna aplikacja z trybem offline i powiadomienia są następne, w tej kolejności ([`docs/build-plan.md`](docs/build-plan.md)). Poniższe sekcje opisują cały produkt.

## Pomysł

Dziennik szkolny jest źródłem prawdy: nauczyciele codziennie wpisują tam oceny, tematy, zadania domowe i plan lekcji, a dziennik udostępnia je przez swoje API. To mnóstwo cennych danych, a duża część ich wartości ujawnia się z czasem i w zestawieniu przedmiotów: jak idzie dany przedmiot w tym okresie, co zmieniło się od wczoraj, jaki sprawdzian czeka we wtorek, czy ten tydzień poszedł lepiej niż poprzedni.

Marksy bierze te dane i buduje na nich coś dla rodziny:

- **Pamięta.** Każda ocena jest zapisywana z pełną historią, więc rodzina widzi nie tylko, jak jest, ale i jak do tego doszło, łącznie z ocenami poprawionymi później.
- **Podsumowuje.** Średnie z każdego przedmiotu za tydzień, miesiąc, okres lub rok, w porównaniu z poprzednim okresem, z rozkładem ocen i trendem.
- **Patrzy w przyszłość.** Jutrzejsze lekcje z zadaniami domowymi, nadchodzące sprawdziany i rzeczy do nauczenia się na pamięć, wyróżnione z kilkudniowym wyprzedzeniem.
- **Łączy rodzinę.** Jedno konto w dzienniku obsługuje całą rodzinę; każdy rodzic i każde dziecko ma własny login, własne powiadomienia i własny widok.
- **Podróżuje.** System dziennika to wtyczka. Wszystko inne, każdy ekran i każda liczba, jest wspólne, więc nowy kraj, region czy szkoła dostaje całą aplikację po dodaniu jednego małego dostawcy (providera).

## Co dostajecie

### Start

Dzień w jednym spojrzeniu. Dwie liczby za wybrany okres, średnia i liczba ocen, każda z wartością z poprzedniego okresu. Dalej dzisiejsze oceny, czas nauki, blok **Ważne** (kilka rzeczy, na które warto teraz spojrzeć: niska ocena, zbliżający się sprawdzian, spadająca średnia, coś do przyniesienia jutro) i jutrzejsze lekcje z zadaniami domowymi. Niżej statystyki: oceny według przedziałów jakości, rozkład według wartości i trend w ujęciu tygodnia, miesiąca, okresu lub roku.

Każdy ekran z liczbami ma ten sam wybór okresu: tydzień, miesiąc, okres lub rok, a potem powrót do dowolnego wcześniejszego strzałkami, przesunięciem palca lub z listy.

### Oceny

Wszystkie oceny w jednym strumieniu, pogrupowane według dni, z przedmiotem, rodzajem pracy, tematem lekcji i komentarzem nauczyciela. Filtrowanie według tagów, takich jak „Sprawdzian” czy „Wiersz”, jednego lub kilku naraz. Jedno dotknięcie dalej są **oceny końcowe**: tabela wyników za okresy i rok dla każdego przedmiotu, w której trwający jeszcze okres pokazuje bieżącą średnią, więc trendu nigdy nie da się pomylić z wynikiem końcowym.

### Przedmioty

Każdy przedmiot dziecka, zawsze: jego średnia za okres, kierunek, w którym zmierza, poprzednia wartość i kilka ostatnich ocen. Sortowanie alfabetyczne, od najsłabszych lub najmocniejszych albo według największego wzrostu lub spadku. W klasach, w których oceny nie są jeszcze wystawiane, ta sama lista pokazuje zamiast nich lekcje, zadania domowe i czas nauki.

### Przedmiot z bliska

Każdy przedmiot ma własną stronę w kolorze przedmiotu: cel na okres („na 8 potrzeba dwóch 9 lub jednej 10”), rzeczy warte uwagi, statystyki i trend, każdą ocenę z komentarzem, najbliższe lekcje, wyniki okres po okresie i czas nauki.

### Plan lekcji i zadania domowe

Jeden dzień lub cały tydzień, wstecz i naprzód, jeden wiersz na lekcję z godziną, salą, tematem, zadaniem domowym i oceną z tej lekcji; przed lekcją tuż pod nią średnia z przedmiotu i ostatnie oceny. Lekcje, do których dziecko jest przygotowane, dostają znacznik **Gotowe** widoczny dla całej rodziny. Rodziny mogą dodawać własne zadania domowe i oznaczać lekcję jako odwołaną. Przerwy w ciągu dnia są pokazane jako przerwy, więc późniejsze rozpoczęcie widać od razu.

### Tagi

Powiedzcie Marksy, co jest ważne, słowami waszej szkoły: wiersz do nauczenia, sprawdzian, coś do przyniesienia. Tag to kilka słów kluczowych, których Marksy szuka w tematach lekcji i zadaniach domowych. Lekcje z tagiem są wyróżnione w planie lekcji i pojawiają się na ekranie startowym z kilkudniowym wyprzedzeniem, razem z dokładnymi słowami, które pasowały. Gotowe tagi są dostępne w każdym języku i można je dowolnie edytować.

### Czas nauki

Stoper do zadań domowych, uruchamiany z lekcji lub przedmiotu, z pauzą i zakończeniem, oraz mały pasek, który zostaje na ekranie, dopóki stoper działa. Zakończenie sesji i oznaczenie lekcji jako gotowej to osobne kroki, bo przerwa to jeszcze nie koniec. Gdy stoper nie był używany, Marksy szacuje czas na podstawie wieczornych znaczników „gotowe” i oznacza szacunek jako szacunek. Czas jest pokazywany dla każdego dnia i przedmiotu, po prostu, bez oceniania.

### Powiadomienia

Powiadomienie push na telefonie albo wiadomość w Telegramie, gdy coś się dzieje: nowa ocena, ocena poniżej wybranego progu, poprawiona ocena, nieobecność, zbliżający się sprawdzian, wieczorne zestawienie zadań domowych, podsumowanie tygodnia. Każdą regułę ustawia się osobno dla każdej osoby, z godzinami ciszy. Wszystko, co zostało wysłane, zostaje w skrzynce w aplikacji, więc odrzucone powiadomienie nigdy nie przepada.

### Rodzina

Rodzina podłącza dziennik jeden raz. Każdy członek rodziny dostaje własny login do Marksy przez zaproszenie: drugi rodzic, dziadkowie, każde dziecko. Dzieci nigdy nie potrzebują hasła do dziennika. Znajomi mogą założyć własną rodzinę na tym samym serwerze; rodziny nigdy nie widzą swoich danych nawzajem.

### Wasz wygląd, wasz język

Jasny i ciemny motyw, palety kolorów, tapety, pięć czcionek tekstu, kolor dla każdego przedmiotu. Dwanaście języków interfejsu: rosyjski, białoruski, ukraiński, kazachski, angielski, polski, niemiecki, hiszpański, portugalski, francuski, niderlandzki i rumuński, wybierane osobno przez każdą osobę. Angielski i rosyjski są sprawdzane przez ludzi; pozostałe dziesięć to tłumaczenia maszynowe, oznaczone tak w aplikacji, która prowadzi do krótkiego formularza na poprawki. Dodanie języka to jeden plik JSON ([`docs/i18n.md`](docs/i18n.md)).

## Zobaczcie od razu

Otwórzcie [`docs/mockups.html`](docs/mockups.html) w przeglądarce. To klikalny prototyp każdego ekranu, projektowany najpierw na telefon, z fikcyjnymi danymi: można przełączać się między rodzicem a dzieckiem, między dwojgiem dzieci, między jasnym a ciemnym motywem. Aplikacja jest zbudowana zgodnie z nim.

## Jak to działa

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

- **Provider.** Mały moduł dla każdego systemu dziennika. Loguje się danymi rodziny i zwraca uczniów, okresy, przedmioty, lekcje z ocenami i zadaniami domowymi oraz oceny końcowe we wspólnym formacie Marksy. Deklaruje, co oferuje jego system (rodzaje lekcji, komentarze, frekwencję, okresy, przyszły plan lekcji) i jaką ma skalę ocen, a aplikacja dopasowuje się dokładnie do tego.
- **Collector.** Ten sam dla każdego providera. Kilka razy w ciągu dnia szkolnego pobiera ostatnie tygodnie dla każdego dziecka, wykrywa nowe, zmienione i usunięte oceny, przechowuje historię każdej zmiany i raz w tygodniu odczytuje ponownie cały okres, bo nauczyciele poprawiają też starsze oceny. Działa jak planista: jeśli komputer był wyłączony przez weekend, pierwszy przebieg potem nadrabia to, co zostało pominięte.
- **API.** Udostępnia aplikacji zapisane dane, zawsze w obrębie jednej rodziny, i dokumentuje się samo przez OpenAPI pod `/api/docs`.
- **Aplikacja.** PWA w React z powłoką offline, instalowalna na iOS i Androidzie, testowana na prawdziwych telefonach w sieci domowej od pierwszych ekranów.

## Każda szkoła, każda skala

Marksy działa na wspólnym modelu (uczniowie, okresy, przedmioty, lekcje, oceny, oceny końcowe) i na opisie **skali ocen** dostarczanym przez providera: zakres i kierunek, cztery przedziały jakości, progi, cele, sposób liczenia i pokazywania średnich, sposób zaokrąglania ocen końcowych. Skala 10-punktowa, 5-punktowa, 12-punktowa, od 1 do 6, gdzie 1 jest najlepsza, od 0 do 20, litery z GPA, procenty, zaliczone lub niezaliczone: te same ekrany, średnie, filtry, cele i wskazówki działają dla każdej z nich, nawet gdy skala zmienia się między latami szkolnymi lub przedmiotami.

Wszystko, co dziennik może mieć albo nie, jest opcjonalne: rodzaje lekcji, kategorie ocen, komentarze, frekwencja, okresy, oficjalne oceny końcowe, a nawet plan lekcji. Provider deklaruje, co jest dostępne, a każdy ekran pokazuje to, co istnieje, zamiast pustych kolumn.

Aby podłączyć nowy system, pisze się jednego providera: manifest (dane logowania, skala, możliwości, limity zapytań), funkcję logowania, kilka funkcji pobierających, które przekładają odpowiedzi na wspólne typy, `sanitize()` dla fixtures testowych i wspólny test zgodności. [`docs/adding-a-diary.md`](docs/adding-a-diary.md) wyjaśnia, czego to wymaga i jak poprosić o system waszej szkoły; pełny kontrakt i lista kontrolna do przeglądu są w [`docs/providers.md`](docs/providers.md), a `providers/_template` to kompilujący się punkt wyjścia.

## Z szacunkiem z założenia

- **Tylko odczyt.** Marksy tylko czyta. Wspólny klient HTTP odrzuca każde zapytanie spoza listy dozwolonych providera, więc w dzienniku nic nie może zostać zmienione przypadkiem.
- **Delikatnie.** Najwyżej jedno logowanie na godzinę na konto, jedno zapytanie naraz z przerwami, wydłużanie odstępów przy błędach, limit na przebieg. Ręczne odświeżanie korzysta z tej samej puli.
- **Odporność.** Każda próba i każdy sprawdzony tydzień są zapisywane. Przerwy po obu stronach są nadrabiane automatycznie; po powtarzających się błędach synchronizacja się wstrzymuje, a administrator rodziny dostaje jedną wiadomość. Błędne hasło zatrzymuje synchronizację do czasu poprawki, więc prawdziwe konto nigdy nie zostaje zablokowane.
- **Świadomość sieci.** Niektóre systemy dzienników odpowiadają najlepiej z własnego regionu albo bez VPN. Każdy provider deklaruje swoje wymagania sieciowe, a collector działa na domowym urządzeniu, które je spełnia: na PC, mini PC, Raspberry Pi albo NAS.
- **Porządek.** Oceny i ich historia są przechowywane tak długo, jak dziecko należy do rodziny; dane operacyjne (logi synchronizacji, surowe odpowiedzi, strumienie zdarzeń) są trzymane przez tygodnie lub miesiące, a potem kompaktowane. Limity są w `env.example` pod `RETENTION_*`.

## Prywatność

Marksy przetwarza dane o dzieciach, a ustawienia domyślne to uwzględniają.

- **Dane zostają u was.** Bez analityki, bez skryptów i czcionek z zewnątrz, nic nie opuszcza waszego serwera.
- **Sesje wszędzie.** Każda ścieżka poza logowaniem, sprawdzaniem stanu i dokumentacją API wymaga sesji, a każde zapytanie jest ograniczone do jednej rodziny.
- **Chronione sekrety.** Hasła do dziennika są przechowywane w postaci zaszyfrowanej (AES-256-GCM); hasła do Marksy są haszowane algorytmem argon2id. Logi nigdy nie zawierają haseł, tokenów ani pełnych imion i nazwisk.
- **Nic prawdziwego w repozytorium.** Fixtures testowe są fikcyjne lub oczyszczone; `pnpm privacy` szuka sekretów, danych osobowych i plików, które nigdy nie mogą trafić do commita.
- **Dane należą do rodzin.** Rodzina może wyeksportować wszystko jako JSON i całkowicie się usunąć; okres przechowywania to ustawienie. Jeśli udostępniacie Marksy innym rodzinom, najpierw przeczytajcie `docs/design.md`, sekcję 14.1.

## Wymagania

- Konto w obsługiwanym dzienniku szkolnym (rodzica lub ucznia).
- Komputer włączony w ciągu dnia szkolnego, z Dockerem i niczym więcej: domowy PC lub laptop, mini PC, Raspberry Pi albo NAS.
- Opcjonalnie: domena w Cloudflare, aby korzystać z aplikacji poza siecią domową przez Cloudflare Tunnel, instalować ją na telefonach i używać Web Push; token bota Telegram do powiadomień w Telegramie.
- Do rozwijania Marksy: Node.js 22, pnpm i Docker.

## Uruchomienie produkcyjne

Aby codziennie uruchamiać Marksy dla rodziny, na laptopie, Raspberry Pi albo NAS, mając na tym komputerze tylko Dockera: [docs/running.md](docs/running.md). Opisuje instalację, sposoby dostępu do aplikacji w domu i z zewnątrz (Cloudflare Tunnel), kopie zapasowe, przywracanie i przenoszenie na inny komputer oraz aktualizacje. Do każdego wydania są dołączone pliki potrzebne hostowi jako `marksy-deploy-vX.Y.Z.zip`.

Wydania są numerowane MAJOR.MINOR.PATCH: MAJOR to gruntowna przebudowa aplikacji (rzadko), MINOR przynosi nowe funkcje, PATCH przynosi poprawki i naprawy błędów. Host sam instaluje nowe wydania, w ciągu kilku minut, po sprawdzeniu, że podpisał je ten projekt, z kopią zapasową przed aktualizacją i drogą powrotu, jeśli coś pójdzie nie tak.

## Szybki start dla programistów

Workspace uruchamia całą aplikację z kodu źródłowego: bazę danych, collector z planistą, API z dokumentacją, aplikację i fikcyjną rodzinę demo, by wszystko poznać bez konta w dzienniku. Potrzebne są Node.js 22, pnpm (`npm install -g pnpm` lub `corepack enable`) i Docker.

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

Rodzina demo należy do fikcyjnego dziennika i ma dwoje dzieci, jedno z nich w klasie bez ocen, więc każdy ekran można poznać bez konta w dzienniku; jej loginy (`parent@example.com` i `student@example.com`, hasło wypisuje `pnpm db:seed`) działają, gdy pojawi się logowanie. Ponieważ to hasło jest publiczne, seed odmawia uruchomienia, gdy `PUBLIC_URL` jest adresem publicznym (`--allow-public` to zmienia). `pnpm db:studio` otwiera bazę danych w Drizzle Studio. `pnpm db:backup` zapisuje zrzut lokalnej bazy do `data/backups/` (zachowywanych jest pięć ostatnich) i sprawdza go, odtwarzając go w tymczasowej bazie; `pnpm db:restore <file> --yes` przywraca zrzut. Mając konto w dzienniku, wystarczy otworzyć aplikację, wybrać „Podłącz dziennik”, wskazać swój system dziennika i się zalogować: Marksy raz sprawdza dane logowania, tworzy rodzinę i uruchamia pierwszą synchronizację. Resztę rodziny zaprasza się z „Więcej”, potem „Rodzina”.

Mając konto w dzienniku, `pnpm dev:connect` konfiguruje własną rodzinę z wiersza poleceń: odczytuje login do dziennika (`DIARY_LOGIN`, `DIARY_PASSWORD`) i wybrany login do Marksy (`MARKSY_DEV_EMAIL`, `MARKSY_DEV_PASSWORD`) z `.env` i wykonuje ten sam kod co „Podłącz dziennik”; uruchomione ponownie po wyczyszczeniu bazy dodaje tylko to, czego brakuje, a po `pnpm sync:once` przejmuje tę rodzinę bez ponownego logowania do dziennika. Wcześniej bazę lokalną można wypełnić z wiersza poleceń: wpisać login do dziennika w `DIARY_LOGIN` i `DIARY_PASSWORD` w `.env` i uruchomić `pnpm sync:once`. Polecenie rozmawia tylko z systemami dzienników oferowanymi rodzinom, przy pierwszym użyciu tworzy minimalną rodzinę i wykonuje jedną synchronizację według tych samych zasad co każdy inny przebieg (limit zapytań, sprawdzenie połączenia, jedno logowanie na konto na interwał: 10 minut dla ręcznych poleceń w trybie deweloperskim, własny interwał systemu dziennika w trybie produkcyjnym); `pnpm probe` odczytuje każdy endpoint raz i odświeża oczyszczone fixtures providera, a `pnpm probe --offline` powtarza sprawdzenia na zapisanych odpowiedziach bez logowania (fixtures nadpisuje tylko z `--write-fixtures`). Trzy polecenia, które logują się do prawdziwego dziennika, mają wspólną blokadę logowań. Strażnik pre-commit odrzuca commit, który zawiera lokalne dane, sekrety, zrzuty bazy danych lub surowe odpowiedzi albo jakiekolwiek imię czy identyfikator z ostatnich prawdziwych odpowiedzi. Wypisywane są tylko liczby i statusy, a kod wyjścia to 0 także wtedy, gdy zasady wstrzymują przebieg. Dopóki `SYNC_ENABLED` ma wartość `true`, `pnpm dev` sam utrzymuje synchronizację tego konta, tylko w czasie dnia szkolnego każdego dziecka. `pnpm sync:plan` pokazuje, co planista zrobiłby teraz (dzisiejsze okno każdego dziecka, co czeka, czy przebieg by wystartował), bez logowania się gdziekolwiek.

### Na telefonie w sieci domowej

```bash
pnpm dev:lan                    # like pnpm dev, and the app also listens on the local network
```

Vite wypisuje adres `Network:`, na przykład `http://192.168.1.20:5173`; wystarczy otworzyć go na telefonie w tej samej sieci Wi-Fi. Wszystko idzie przez ten jeden port: serwer aplikacji przekazuje `/api` do API, które samo nasłuchuje tylko na `127.0.0.1`, więc logowanie działa bez dodatkowej konfiguracji. W Windows, gdy zapyta zapora, należy zezwolić Node.js na sieci **prywatne** i upewnić się, że profil Wi-Fi jest ustawiony jako prywatny. Instalacja aplikacji, tryb offline i Web Push wymagają na telefonie HTTPS; to przyjdzie z etapem PWA (`docs/build-plan.md` M8).

`pnpm smoke:lan` sprawdza API tak, jak widzi je telefon, tylko bez telefonu: gdy działa `pnpm dev:lan`, znajduje adres tego komputera w sieci domowej, loguje się pod `http://<address>:5173/api` z `MARKSY_DEV_EMAIL` i `MARKSY_DEV_PASSWORD` z `.env` i odczytuje dane każdego dziecka. Wypisuje statusy, liczby i kształt każdej odpowiedzi (klucze i typy, bez wartości) i kończy się błędem, gdy odpowiedź zawiera hasło lub token sesji albo gdy ciasteczko sesji nie działałoby przez zwykłe http. `--host <ip>` pozwala wskazać adres samodzielnie.

`pnpm smoke:ui` robi to samo dla ekranów: gdy działa `pnpm dev:lan`, otwiera aplikację pod adresem w sieci domowej w przeglądarce bez interfejsu w rozmiarze telefonu (360 px, dotyk) i tabletu, loguje się jako rodzic demo (oraz jako wy, gdy ustawiono `MARKSY_DEV_EMAIL`), przechodzi przez każdy ekran każdego dziecka i robi zrzuty tych samych stanów klikalnego prototypu (`docs/mockups.html`) do porównania. Zrzuty ekranu trafiają do `data/ui/` (trzy ostatnie przebiegi), który nigdy nie trafia do commita. Jednorazowo potrzebny jest Chromium dla Playwright: `pnpm exec playwright install chromium`.

## Konfiguracja

W trybie deweloperskim cała konfiguracja jest w `.env` (tworzonym przez `pnpm setup:env` z `env.example`); host produkcyjny ma własny `.env.production` ([docs/running.md](docs/running.md), sekcja 3). Sekrety nigdy nie trafiają do repozytorium.

| Zmienna | Przeznaczenie |
|---|---|
| `DATABASE_URL`, `TEST_DATABASE_URL` | PostgreSQL dla aplikacji (`marksy`, port 5432, w wolumenie Dockera) i dla `pnpm test` (`marksy_test` na osobnym serwerze w pamięci, port 5434, pusty po każdym restarcie) |
| `PORT`, `HOST` | Port API (3000) i adres nasłuchiwania (`127.0.0.1`; inne urządzenia łączą się z API przez serwer aplikacji) |
| `SESSION_SECRET` | Losowy ciąg znaków dla ciasteczek sesji (generowany) |
| `CREDENTIALS_KEY` | 32-bajtowy klucz (base64), którym szyfrowane są przechowywane hasła do dziennika (generowany) |
| `SYNC_ENABLED` | `true` na urządzeniu, które łączy się z dziennikiem, `false` na kopii tylko z API |
| `SYNC_WINDOW` | Opcjonalnie: zewnętrzna granica okna dnia szkolnego każdego dziecka (może je tylko zawęzić) |
| `SYNC_JITTER_MIN`, `SYNC_MIN_LOGIN_INTERVAL` | Losowe opóźnienie zaplanowanych przebiegów; minimalny odstęp między logowaniami na konto (można go tylko zwiększyć) |
| `SYNC_TICK_MIN`, `SYNC_CATCHUP_AFTER`, `SYNC_MAX_REQUESTS_PER_RUN` | Planista: jak często podejmuje decyzję, kiedy dozwolony jest przebieg nadrabiający, ile może pobrać jeden przebieg |
| `SYNC_FAILURES_BEFORE_PAUSE`, `SYNC_PAUSE_HOURS`, `SYNC_PAUSE_MAX_HOURS`, `SYNC_OFFLINE_RETRY_MIN` | Obsługa błędów: liczba błędów przed pauzą, pauza (podwajana aż do tygodnia), ponowna próba, gdy to urządzenie jest offline |
| `RETENTION_*` | Jak długo przechowywane są dane operacyjne (log synchronizacji, surowe odpowiedzi, strumienie zdarzeń, pokrycie) |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Klucze Web Push |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` | Bot Telegram (opcjonalnie) |
| `MARKSY_ENV`, `DEV_MIN_LOGIN_INTERVAL_MINUTES` | Limity ręcznych poleceń dziennika (`pnpm probe`, `pnpm sync:once`, `pnpm dev:connect`). `development` (ustawione w `env.example`): jedno logowanie na konto co 10 minut lub rzadziej, o dowolnej porze. Cokolwiek innego, łącznie z brakiem wartości, i każdy build z `NODE_ENV=production`: własny interwał systemu dziennika (zwykle godzina). `pnpm env:dev` dopisuje dwie linie deweloperskie do starszego `.env`, w którym ich brakuje, nie zmieniając już ustawionych wartości. Zaplanowane synchronizacje w obu przypadkach przestrzegają zasad dnia szkolnego |
| `MARKSY_RUNNER` | Zostawić puste. Ustawiane na `claude` dla Claude Code przez `.claude/settings.json`: w trybie produkcyjnym jego prawdziwe logowania są ograniczone do trzech dziennie w godzinach szkolnych |
| `DIARY_LOGIN`, `DIARY_PASSWORD`, `MARKSY_DEV_EMAIL`, `MARKSY_DEV_PASSWORD` | Tylko w trybie deweloperskim: własny login do dziennika dla `pnpm probe`, `pnpm sync:once` i `pnpm dev:connect` oraz login do Marksy, który tworzy `dev:connect`. Sama aplikacja przechowuje dane logowania do dziennika w bazie danych, zaszyfrowane |
| `TZ` | Strefa czasowa szkoły (nazwa IANA) |

## Struktura repozytorium

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

Na początek: `docs/running.md`, aby uruchomić Marksy, `docs/ux-principles.md`, aby zobaczyć, dlaczego interfejs jest taki, jaki jest, `docs/design.md`, aby zrozumieć lub zmienić produkt, i `docs/adding-a-diary.md`, aby podłączyć inny system dziennika.

## Plan rozwoju

Pełny plan z kryteriami odbioru jest w [`docs/build-plan.md`](docs/build-plan.md).

Gotowe:

1. Rdzeń: wspólny model, skale ocen, obliczenia ocen, klient HTTP, języki.
2. Pierwszy provider i jego testy zgodności.
3. Serwer: baza danych, collector, planista, fikcyjne dane startowe.
4. Konta, rodziny, zaproszenia i API do odczytu.
5. Aplikacja: start, ważne, oceny, oceny końcowe, przedmioty, strona przedmiotu, plan lekcji, ustawienia, wygląd; potem tłumaczenia na pozostałe dziesięć języków.
6. Działanie w domu (1.0): obrazy produkcyjne, kopie zapasowe, dostęp zdalny, podpisane automatyczne aktualizacje.

Dalej:

7. Tagi.
8. Czas nauki.
9. Instalowalna PWA z trybem offline.
10. Powiadomienia: skrzynka, reguły, Web Push, Telegram.

## Współtworzenie

Pull requesty nie są przyjmowane. Zgłoszenia błędów, pomysły i poprawki tłumaczeń, aplikacji lub tej strony w waszym języku, są bardzo mile widziane jako [Issues](https://github.com/Dopetast1c/Marksy/issues), po angielsku lub po rosyjsku.

Jeśli API dziennika się zmieni, warto założyć issue z oczyszczoną odpowiedzią (imiona, identyfikatory i komentarze zastąpione), identyfikatorem providera i datą.

Projekt jest budowany z Claude Code według `docs/build-plan.md`; używane przy tym skille i agenci są w `.claude/`, a zasady, których przestrzega kod, w `CLAUDE.md`. Jeśli zmieniacie Marksy na własny niekomercyjny użytek, `docs/providers.md` wyjaśnia, jak dodać system dziennika, a `docs/i18n.md`, jak dodać język.

## Zastrzeżenie

Marksy to niezależny projekt z dostępnym kodem źródłowym. Nie jest powiązany z żadną szkołą, władzami oświatowymi ani dostawcą dziennika, ani przez nie popierany czy wspierany. Korzysta z API dziennika w imieniu rodzica lub ucznia, który ma tam konto, tylko odczytuje dane i jest przeznaczony dla waszej własnej rodziny.

## Licencja

Marksy jest udostępniany na licencji [PolyForm Noncommercial License 1.0.0](LICENSE).

**Wolno** go używać, kopiować i zmieniać w dowolnym celu niekomercyjnym: w domu dla własnej rodziny, do nauki, badań, projektów hobbystycznych i testów, a także w szkołach, innych instytucjach edukacyjnych, organizacjach charytatywnych, publicznych instytucjach badawczych i instytucjach rządowych.

**Nie wolno** używać go komercyjnie: żadnej sprzedaży, żadnego płatnego hostingu ani płatnej usługi na jego podstawie, żadnego włączania do płatnego produktu i żadnego użycia przez firmę do jej własnych celów.

Jeśli potrzebna jest licencja komercyjna, można o nią zapytać przez [issue](https://github.com/Dopetast1c/Marksy/issues). Wiążący jest [pełny tekst licencji](LICENSE); to streszczenie służy tylko jako wskazówka.
