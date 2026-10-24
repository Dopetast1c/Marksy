# Marksy

**Your children's school year, in one calm, clear place.**

Marksy is a family app for school marks, source-available and free for personal and other non-commercial use. It connects to the electronic diary your school already uses, reads the marks, timetable and homework through the diary's own API, and builds a richer layer on top: averages and trends for every subject and period, a full history of every mark, a plan for the days ahead, a study timer, notifications, and separate logins for every parent and child. It runs on your own computer, installs on any phone as an app, and speaks twelve languages.

[![License: PolyForm Noncommercial 1.0.0](https://img.shields.io/badge/license-PolyForm%20Noncommercial%201.0.0-blue.svg)](LICENSE)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6.svg)
![PWA](https://img.shields.io/badge/app-PWA-5a0fc8.svg)
![Self-hosted](https://img.shields.io/badge/data-self--hosted-2f7a4a.svg)

> **Status: early development.** The product design, the data model, the API contract and a clickable prototype of every screen are finished and live in `docs/`. The code is being built from them milestone by milestone (`docs/build-plan.md`).

## The idea

A school diary is the source of truth: teachers put marks, topics, homework and the timetable there every day, and the diary makes them available through its API. That is a lot of valuable data, and much of its value appears over time and across subjects: how a subject is going this term, what changed since yesterday, which test is coming on Tuesday, whether this week went better than the last one.

Marksy takes that data and builds on it for the family:

- **It remembers.** Every mark is stored with its full history, so the family sees not only where things stand but how they got there, including marks a teacher corrected later.
- **It summarises.** Averages per subject for a week, month, term or year, compared with the previous period, with the distribution of marks and a trend.
- **It looks ahead.** Tomorrow's lessons with homework, upcoming tests and things to learn by heart, highlighted days in advance.
- **It brings the family together.** One diary account serves the whole family; each parent and child has their own login, their own notifications and their own view.
- **It travels.** The diary system is a plug-in. Everything else, every screen and every number, is shared, so a new country, region or school gets the whole app by adding one small provider.

## What you get

### Home

The day at a glance. Two numbers for the chosen period, the average and the number of marks, each with what it was in the previous period. Then today's marks, study time, the **Attention** block (the few things worth a look right now: a low mark, a test coming up, an average that is slipping, something to bring tomorrow) and tomorrow's lessons with their homework. Below, the statistics: marks by quality band, the distribution by value and a trend by week, month, term or year.

Every screen with numbers has the same period control: pick a week, month, term or year, then step back to any earlier one with arrows, a swipe or a list.

### Marks

Every mark in one feed, grouped by day, with the subject, the kind of work, the lesson topic and the teacher's comment. Filter by tags such as "Test" or "Poem", one or several at once. One tap away are the **final marks**: a table of term and year results for every subject, where a term that is still running shows its current average, so a trend is never mistaken for a final result.

### Subjects

Every subject of the child, always: its average for the period, the direction it is moving, what it was before and the last few marks. Sort alphabetically, weakest or strongest first, or by the biggest rise or fall. In classes where marks are not given yet, the same list shows lessons, homework and study time instead.

### A subject up close

Each subject has its own page, tinted in the subject's colour: the goal for the term ("for an 8 you need two 9s or one 10"), the things worth attention, statistics and trend, every mark with its comment, the next lessons, the term-by-term results and study time.

### Timetable and homework

Today, tomorrow or the whole week, one row per lesson with the time, topic, homework and the mark from that lesson. Lessons a child has prepared for get a **ready** tick that the whole family sees. Families can add homework of their own and mark a lesson as cancelled. Gaps in the day are shown as gaps, so a late start is visible at once.

### Tags

Tell Marksy what matters in your school's own words: a poem to learn, a test, something to bring. A tag is a few keywords that Marksy looks for in lesson topics and homework. Tagged lessons are highlighted in the timetable and appear on the home screen days ahead, with the exact words that matched. Ready-made tags come with every language and can be edited freely.

### Study time

A timer for homework, started from a lesson or a subject, with pause and finish, and a small bar that stays on screen while it runs. Finishing a session and marking a lesson ready are separate, because a break is not the end. When the timer was not used, Marksy estimates time from the ready ticks of the evening and labels the estimate as such. Time is shown per day and per subject, plainly, without judgement.

### Notifications

A push notification on the phone or a Telegram message when something happens: a new mark, a mark below a chosen level, a corrected mark, an absence, a test coming up, an evening homework digest, a weekly summary. Every rule is set per person, with quiet hours. Everything that was sent stays in an inbox in the app, so a notification swiped away is never lost.

### Family

The family connects the diary once. Each member gets their own Marksy login through an invite: the second parent, grandparents, each child. Children never need the diary password. Friends can create their own family on the same server; families never see each other's data.

### Your look, your language

Light and dark themes, colour palettes, wallpapers, five body fonts, a colour for every subject. Twelve interface languages: Russian, Belarusian, Ukrainian, Kazakh, English, Polish, German, Spanish, Portuguese, French, Dutch and Romanian, chosen per person. Adding a language is one JSON file ([`docs/i18n.md`](docs/i18n.md)).

## See it now

Open [`docs/mockups.html`](docs/mockups.html) in a browser. It is a clickable, mobile-first prototype of every screen with fictional data: switch between a parent and a child, between two children, between light and dark. The app is built to match it.

## How it works

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

- **Provider.** A small module per diary system. It signs in with the family's credentials and returns students, terms, subjects, lessons with marks and homework, and final marks in Marksy's common format. It declares what its system offers (lesson types, comments, attendance, terms, a future timetable) and its grading scale, and the app adapts to exactly that.
- **Collector.** The same for every provider. A few times during the school day it fetches the recent weeks for each child, detects new, changed and removed marks, keeps the history of every change and re-reads the whole term once a week, because teachers edit older marks. It works as a planner: if the computer was off for a weekend, the first run afterwards catches up on what was missed.
- **API.** Serves stored data to the app, scoped to one family, and documents itself with OpenAPI at `/api/docs`.
- **App.** A React PWA with an offline shell, installable on iOS and Android, tested on real phones over the home network from the first screens on.

## Any school, any scale

Marksy works on a common model (students, terms, subjects, lessons, marks, final marks) and on a **grading scale** description supplied by the provider: the range and direction, four quality bands, thresholds, goals, how averages are computed and shown, how finals are rounded. A 10-point scale, a 5-point scale, a 12-point scale, 1 to 6 where 1 is best, 0 to 20, letters with GPA, percentages, pass or fail: the same screens, averages, filters, goals and guidance work for each, even when the scale changes between school years or subjects.

Everything a diary may or may not have is optional: lesson types, mark categories, comments, attendance, terms, official finals, even a timetable. A provider declares what is there, and every screen shows what exists instead of empty columns.

To connect a new system you write one provider: a manifest (credentials, scale, capabilities, rate limits), a sign-in function, a handful of fetch functions that map responses to the common types, a `sanitize()` for test fixtures, and the shared conformance test. The contract, a step-by-step guide and a review checklist are in [`docs/providers.md`](docs/providers.md); `providers/_template` is a compiling starting point. If you would like Marksy to support your school's system, open an issue describing it.

## Respectful by design

- **Read-only.** Marksy only reads. The shared HTTP client refuses any request outside the provider's allow-list, so nothing in the diary can be changed by accident.
- **Gentle.** One sign-in per hour per account at most, one request at a time with pauses, backoff on errors, a cap per run. Manual refresh shares the same budget.
- **Resilient.** Every attempt and every verified week is recorded. Outages on either side are caught up automatically; after repeated failures syncing pauses and the family admin is told once. A wrong password stops syncing until it is fixed, so the real account is never locked.
- **Network-aware.** Some diary systems answer best from their own region or without a VPN. Each provider declares its network needs, and the collector runs on a machine at home that meets them: a PC, a mini PC, a Raspberry Pi, a NAS.
- **Tidy.** Marks and their history are kept for as long as the child is in the family; operational data (sync logs, raw responses, event feeds) is kept for weeks or months and then compacted. Limits are in `.env.example` under `RETENTION_*`.

## Privacy

Marksy handles data about children, and its defaults reflect that.

- **Your data stays with you.** No analytics, no third-party scripts except fonts, nothing leaves your server.
- **Sessions everywhere.** Every route except sign-in, health and API docs requires a session, and every query is scoped to one family.
- **Secrets protected.** Diary passwords are encrypted at rest (AES-256-GCM); Marksy passwords are hashed with argon2id. Logs never contain passwords, tokens or full names.
- **Nothing real in the repository.** Test fixtures are fictional or sanitised; `pnpm privacy` checks for secrets, personal data and files that must never be committed.
- **Families own their data.** A family can export everything as JSON and erase itself completely; retention is a setting. If you host Marksy for other families, read `docs/design.md` section 14.1 first.

## Requirements

- An account on a supported school diary (a parent's or a student's).
- A computer that is on during the school day, with Docker and Node.js 22: a home PC, a mini PC, a Raspberry Pi or a NAS.
- Optional: a Telegram bot token for Telegram notifications, and a public HTTPS address (Cloudflare Tunnel or Tailscale work well) for using the app outside the home network and for Web Push.

## Quick start

The workspace runs today: the database schema, the collector with its planner, a fictional demo family, the API health route and API docs, and a placeholder app. The screens arrive milestone by milestone, see `docs/build-plan.md`. You need Node.js 22, pnpm (`npm install -g pnpm` or `corepack enable`) and Docker.

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

The demo family belongs to a fictional diary and has two children, one of them in a class without marks, so every screen can be explored without a diary account; its logins (`parent@example.com` and `student@example.com`, password printed by `pnpm db:seed`) work once sign-in arrives. Because that password is published, the seed refuses to run when `PUBLIC_URL` is a public address (`--allow-public` overrides it). `pnpm db:studio` opens the database in Drizzle Studio. `pnpm db:backup` writes a dump of the local database to `data/backups/` (the last five are kept) and checks it by restoring it into a temporary database; `pnpm db:restore <file> --yes` puts one back. With a diary account, open the app, choose "Connect a diary", pick your diary system and sign in: Marksy checks the credentials once, creates your family and starts the first sync. Invite the rest of the family from More, then Family.

With a diary account, `pnpm dev:connect` sets up your own family from the command line: it reads the diary login (`DIARY_LOGIN`, `DIARY_PASSWORD`) and the Marksy login you want (`MARKSY_DEV_EMAIL`, `MARKSY_DEV_PASSWORD`) from `.env` and runs the same code as «Connect a diary»; run again after a database reset, it only adds what is missing, and on top of `pnpm sync:once` it takes over that family without signing in to the diary again. Before that, a developer can fill the local database from the command line: put the diary login into `DIARY_LOGIN` and `DIARY_PASSWORD` in `.env` and run `pnpm sync:once`. It only talks to diary systems offered to families, creates a minimal family on first use and runs one sync under the same rules as every other run (one sign-in per hour, the request cap, the offline check); `pnpm probe` reads every endpoint once and refreshes the provider's sanitised fixtures, and `pnpm probe --offline` repeats that on its saved responses without signing in. Both real commands share a sign-in guard. The pre-commit guard refuses a commit that stages local data, secrets, database dumps or raw responses, or any name or id from the latest real responses. It prints counts and statuses only, and exits with 0 also when the rules hold the run back. While `SYNC_ENABLED` is `true`, `pnpm dev` keeps that account in sync on its own, only during each child's school day. `pnpm sync:plan` shows what the planner would do now (each child's window today, what is waiting, whether a run would start) without logging in anywhere.

### On a phone in the home network

```bash
pnpm dev:lan                    # like pnpm dev, and the app also listens on the local network
```

Vite prints a `Network:` address such as `http://192.168.1.20:5173`; open it on a phone on the same Wi-Fi. Everything goes through that one port: the app server forwards `/api` to the API, which itself listens only on `127.0.0.1`, so sign-in works without extra setup. On Windows, allow Node.js on **private** networks when the firewall asks and make sure the Wi-Fi profile is Private. Installing the app, offline mode and Web Push need HTTPS on a phone; that comes with the PWA milestone (`docs/build-plan.md` M8).

## Configuration

All configuration is in `.env` (created by `pnpm setup:env` from `.env.example`). Secrets never go into the repository.

| Variable | Purpose |
|---|---|
| `DATABASE_URL`, `TEST_DATABASE_URL` | PostgreSQL for the app (`marksy`, port 5432, kept in a Docker volume) and for `pnpm test` (`marksy_test` on a separate in-memory server, port 5434, empty after every restart) |
| `PORT`, `HOST` | API port (3000) and bind address (`127.0.0.1`; other devices reach the API through the app server) |
| `SESSION_SECRET` | Random string for session cookies (generated) |
| `CREDENTIALS_KEY` | 32-byte key (base64) that encrypts diary passwords at rest (generated) |
| `SYNC_ENABLED` | `true` on the machine that talks to the diary, `false` on an API-only copy |
| `SYNC_WINDOW` | Optional: an outer bound on every child's school-day window (it can only narrow it) |
| `SYNC_JITTER_MIN`, `SYNC_MIN_LOGIN_INTERVAL` | Random delay for scheduled runs; minimum time between sign-ins per account (can only be raised) |
| `SYNC_TICK_MIN`, `SYNC_CATCHUP_AFTER`, `SYNC_MAX_REQUESTS_PER_RUN` | Planner: how often it decides, when a catch-up run is allowed, how much one run may fetch |
| `SYNC_FAILURES_BEFORE_PAUSE`, `SYNC_PAUSE_HOURS`, `SYNC_PAUSE_MAX_HOURS`, `SYNC_OFFLINE_RETRY_MIN` | Failure handling: failures before a pause, the pause (doubling up to a week), retry when this machine is offline |
| `RETENTION_*` | How long operational data is kept (sync log, raw responses, event feeds, coverage) |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Web Push keys |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` | Telegram bot (optional) |
| `MARKSY_RUNNER` | Leave empty. Set to `claude` for Claude Code by `.claude/settings.json`: its real sign-ins are limited to three a day in school hours |
| `DIARY_LOGIN`, `DIARY_PASSWORD`, `MARKSY_DEV_EMAIL`, `MARKSY_DEV_PASSWORD` | Development only: your own diary login for `pnpm probe`, `pnpm sync:once` and `pnpm dev:connect`, and the Marksy login `dev:connect` creates. The app itself keeps diary credentials in the database, encrypted |
| `TZ` | Time zone of the school (IANA name) |

## Repository layout

```
packages/core/          common types, provider interface, grading scales, marks math,
                        guidance rules, throttled HTTP client, provider conformance suite
packages/i18n/          interface languages: en.json as the source of truth, ru complete, ten more planned
packages/registry/      the list of providers the app offers
providers/_template/    starting point for a new provider
providers/demo-minimal/ a fictional diary with the fewest features, served from fixtures
providers/demo-full/    a fictional diary with many features: the demo family and the collector tests use it
providers/demo-lite/    the same fictional diary with fewer features: the demo family's second school
packages/demo-diary/    the fictional diary and school behind the demo providers and the demo family
providers/<id>/         one folder per diary system: manifest, schemas, mapper, fixtures
server/                 Express API, collector, Drizzle schema and migrations
web/                    React + Vite PWA, Tailwind driven by docs/tokens.json
scripts/                privacy check, .env setup
docs/                   ux-principles.md   why the interface is the way it is
                        design.md          product and technical design
                        build-plan.md      milestones and how the project is built
                        providers.md       how to connect a diary system
                        i18n.md            how to add a language
                        api-spec.md        notes on the first provider's API
                        tokens.json        design tokens
                        mockups.html       clickable prototype
```

Start with `docs/ux-principles.md` to see why the interface is the way it is, `docs/design.md` to understand or change the product, and `docs/providers.md` to connect another diary system.

## Roadmap

The full plan with acceptance criteria is in [`docs/build-plan.md`](docs/build-plan.md).

1. Core: common model, grading scales, marks math, HTTP client, languages.
2. The first provider and its conformance tests.
3. Server: database, collector, planner, fictional seed data.
4. Accounts, families, invites and the read API.
5. The app: home, attention, marks, finals, subjects, subject page, timetable, settings, appearance; then translations into the other ten languages.
6. Tags.
7. Study time.
8. Installable PWA with offline mode.
9. Notifications: inbox, rules, Web Push, Telegram.
10. Running at home: production setup, backups, remote access.

## Contributing

Pull requests are not accepted. Bug reports, ideas and translation fixes are very welcome as [Issues](https://github.com/Dopetast1c/Marksy/issues), in English or Russian.

If a diary API changes, open an issue with a sanitised response (names, ids and comments replaced), the provider id and the date.

The project is built with Claude Code following `docs/build-plan.md`; the skills and agents it uses are in `.claude/`, and the rules the codebase follows are in `CLAUDE.md`. If you change Marksy for your own non-commercial use, `docs/providers.md` explains how to add a diary system and `docs/i18n.md` how to add a language.

## Disclaimer

Marksy is an independent, source-available project. It is not affiliated with, endorsed by or supported by any school, education authority or diary vendor. It uses a diary's API on behalf of a parent or student who has an account there, only reads data, and is meant for your own family.

## По-русски

Marksy: семейное приложение для школьных оценок, бесплатное для личного и любого некоммерческого использования; исходный код доступен для чтения. Оно подключается к электронному дневнику, которым уже пользуется школа, получает через его API оценки, расписание и домашние задания и строит поверх них то, что удобно семье: средние баллы по предметам за неделю, месяц, четверть и год со сравнением с прошлым периодом, полную историю каждой оценки, план на ближайшие дни с контрольными и тем, что выучить или принести, таймер занятий, уведомления в телефон и Telegram и отдельные входы для каждого родителя и ребёнка. Приложение работает на вашем компьютере, ставится на телефон как приложение и говорит на двенадцати языках. Подключить другую систему дневников можно отдельным модулем по инструкции в `docs/providers.md`, весь интерфейс при этом общий. Проект независимый и ни с одной школой или дневником не связан. Лицензия PolyForm Noncommercial 1.0.0: пользоваться можно семье, для учёбы и хобби, школам, некоммерческим и государственным организациям; коммерческое использование (продажа, платный хостинг, включение в платный продукт) не разрешено, коммерческую лицензию можно запросить у автора. Пул-реквесты не принимаются; ошибки, идеи и изменения API дневника присылайте через [Issues](https://github.com/Dopetast1c/Marksy/issues).

## License

Marksy is licensed under the [PolyForm Noncommercial License 1.0.0](LICENSE).

**You may** use, copy and change it for any non-commercial purpose: at home for your own family, for study, research, hobby projects and testing, and in schools, other educational institutions, charities, public research organisations and government institutions.

**You may not** use it commercially: no selling it, no paid hosting or paid service built on it, no including it in a paid product, and no use by a business for its own purposes.

If you need a commercial licence, ask the author through an [issue](https://github.com/Dopetast1c/Marksy/issues). The [full text of the licence](LICENSE) is what counts; this summary is only a guide.
