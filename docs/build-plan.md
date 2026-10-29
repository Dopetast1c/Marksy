# Marksy build plan

The order in which Marksy is built with Claude Code, what each milestone must deliver and how to tell it is done. `docs/design.md` says what the product is; this file says in which order to make it. When a milestone is finished, tick it here and write one line under "Notes" if something was decided on the way.

## Status

| | Milestone | Branch | Status |
|---|---|---|---|
| M0 | Workspace scaffold, first run (`docs/first-run.md`) | `main` | done |
| M1 | Core: canonical model, grading scales, marks math, HTTP client, i18n package | `m1-core` | done |
| M2 | Provider `by-eschools` and the probe | `m2-eschools` | done |
| M3 | Server: schema, collector, planner, seed data | `m3-server` | done |
| M3a | School details (teachers, subgroups, rooms, bells, the regular week), children across families and systems, the per-child sync window | `m3a-school` | done |
| M4 | Accounts, families and the read API | `m4-api` | done |
| M5a | Web: tokens, shell, login, student pick, Главная, Внимание | `m5a-shell` | done |
| M5b | Web: Оценки, Итоги, Предметы, Предмет | `m5b-marks` | done |
| M5c | Web: Расписание, lesson menu, ready ticks, own homework | `m5c-schedule` | done |
| M5d | Web: Ещё, Семья, Синхронизация, Оформление | `m5d-more` | done |
| M5e | Translations: the ten other interface languages | `m5e-i18n` | done |
| M6 | Tags | `m6-tags` | todo |
| M7 | Study time | `m7-study` | todo |
| M8 | PWA: install, offline, service worker | `m8-pwa` | todo |
| M9 | Notifications: inbox, rules, Web Push, Telegram | `m9-notify` | todo |
| M10 | Running at home: production build, backups, remote access | `m10-run` | todo |

M9 and M10 come last on purpose: the app is complete and usable without them (Внимание on Главная already shows what matters), so they can wait until everything else works.

## How to work with Claude Code

- **One milestone, one branch.** Start a session in VS Code on the milestone branch and type `/next` (or `/next M3`). The skill reads this file, the doc sections listed for the milestone and `CLAUDE.md`, proposes a plan and waits for approval before writing code. Large milestones take several sessions; each ends with green checks and a commit.
- **Plan first.** For anything bigger than a small fix, ask for the plan in plan mode (Shift+Tab) and read it. A good plan names the files, the tests and the doc sections it relies on, and lists the questions it could not answer from the docs.
- **Checks before every commit.** `/check` runs formatting, typecheck, lint, tests and the privacy check, and fixes what fails. `/privacy-check` adds a review of the diff by the privacy reviewer agent; run it before merging a milestone and whenever fixtures, logging, auth or queries changed.
- **UI against the prototype.** `/ui-check <screen>` compares a screen with `docs/mockups.html` and the invariants in `docs/ux-principles.md`. The prototype is the reference for layout, order of blocks and copy; the docs win when they disagree with it.
- **Docs move with the code.** When a decision changes, the doc is edited in place in the same commit (design.md, ux-principles.md decision log, providers.md, api-spec.md). No changelog sections.
- **Git is Claude Code's job.** It commits after each green step, pushes the milestone branch, and when the acceptance list is met and `/check` and `/privacy-check` are green, merges the branch into `main` (`--no-ff`) and pushes. Force-push is forbidden in `.claude/settings.json`. The first run on a new machine (`docs/first-run.md`) also sets up git and makes the first push.
- **Runs on a phone from M5a.** From M5a on, every milestone ends with the app working on the owner's own data (and on the seed) in a desktop browser and on a phone in the home network (`pnpm dev:lan`, README "Testing on a phone"). The browser only ever talks to the PWA origin (relative `/api`), the API stays on 127.0.0.1 behind the proxy, cookies are `Secure` only under https. A milestone that breaks phone access is not done.
- **Product questions go to the owner.** If the docs do not answer a product question, Claude Code asks instead of guessing, and the answer goes into the docs.

### Data for testing

Two kinds of data, kept apart:

- **The owner's own family (real).** The diary login lives in `.env` (`DIARY_LOGIN`, `DIARY_PASSWORD`, plus `MARKSY_DEV_EMAIL` and `MARKSY_DEV_PASSWORD` for the Marksy account), which is gitignored, flagged by `pnpm privacy` if it is ever added, and not readable by Claude Code. The data lands only in the local `marksy` database inside the Docker volume. It is used as soon as it makes sense: the probe in M2, the first real sync in M3 (`pnpm sync:once`), and from M4 on the owner's daily testing (`pnpm dev:connect` creates the family through the same code as «Подключить дневник» and starts the sync). These commands talk to the real diary: `pnpm probe`, `pnpm sync:once` and `pnpm dev:connect` are run by Claude Code within the limits of CLAUDE.md "Real diary runs", or by the owner.
- **A fictional family (seed and fixtures).** Used by automated tests (in the separate `marksy_test` database), by anyone who clones the public repo without a diary account, and for cases the real family does not have (a class without marks, a missing capability, an empty period). `pnpm db:seed` creates it with demo logins at example.com.

Claude Code builds and tests with the fictional data. It may read the real family's raw responses and rows to debug, and run `pnpm probe` and `pnpm sync:once` within the budget of CLAUDE.md "Real diary runs"; real values never go into anything git tracks, and a bug seen on real data is reproduced in a test with fictional data.

### Definition of done (every milestone)

- `pnpm check` is green: formatting, typecheck, lint, tests, privacy check.
- New code has tests: units for logic, Supertest for every route, the conformance suite for providers.
- No real data anywhere: fixtures are sanitised and fictional, examples use example.com, nothing personal in logs.
- Every user-facing string is an i18n key with `en` and `ru` values (from M1 on); from M5e on, the new and changed keys are translated into all twelve languages and stamped, and `pnpm i18n:check --strict` is green (no missing or stale translation, `docs/i18n.md` 5).
- `env.example` lists every variable the code reads.
- The docs listed for the milestone still describe what the code does.
- From M5a on: the app starts with `pnpm dev:lan` and the milestone's screens work on a phone over the home network, on the owner's family and on the seed.

## M0. Workspace scaffold (done)

pnpm workspace (`packages/*`, `providers/*`, `server`, `web`), TypeScript 6 strict, ESLint with a few codebase rules (no `getDay() === N`, no `fetch` in providers, no hex colours in `web`), Prettier, Vitest in every package, Docker Compose with PostgreSQL 16 and a separate `marksy_test` database, `scripts/privacy-check.mjs`, Claude Code skills and agents in `.claude/`, VS Code recommendations in `.vscode/`. `server` answers `GET /api/health`; `web` renders a placeholder; `pnpm dev` runs both with `/api` proxied; `pnpm dev:lan` also opens the PWA to the home network (the API stays on 127.0.0.1 behind the proxy).

Local check: `pnpm install`, `pnpm db:up`, `pnpm check`, `pnpm dev`, then open http://localhost:5173 and http://localhost:5173/api/health. Phone check: `pnpm dev:lan`, then open the `Network:` address Vite prints, plus `/api/health`, on the phone.

## M1. Core

**Read:** `docs/providers.md` (all), `docs/design.md` 6, 6.1, 6.2, 6.4, `docs/i18n.md`, `CLAUDE.md` "Provider boundary".

**Deliver:**
- `packages/core`: canonical types with Zod schemas (student, subject, lesson, mark, homework, term, final mark, attendance), the `DiaryProvider` interface and manifest type with capabilities, provider registry.
- `GradingScale` model and helpers (bands, thresholds, compare, rounding, finals projection, `neededAverage`, `targetPlan`, `keepMark`), the `by-10` scale and its snapshot test (`docs/providers.md` 5.4).
- Marks math: averages per period, previous-period comparison with the four missing-data cases (design 6.1), trend, movers, period ranges and instance navigation (current instance to date for marks, whole period for lessons).
- Guidance rules as pure functions that return facts and optional advice separately (design 6.2), so advice can be switched off.
- Throttled HTTP client: serial queue, randomised delays and backoff from the manifest, `readOnlyAllowList` enforced (anything else throws), one login per run.
- Conformance test harness (`pnpm test:provider <id>`), `providers/_template`, `providers/demo-minimal` with fictional fixtures passing the harness.
- `packages/i18n`: `en.json` (source) and `ru.json`, typed `t()` with plural rules, a test that every key exists in both files.

**Done when:** the `by-10` snapshot, the marks math tests and the conformance suite for `demo-minimal` pass; core has no import of anything provider-specific.

**Prompt:**
```
/next M1
```

## M2. Provider by-eschools

**Read:** `docs/api-spec.md` (all, section 10 for the probe), `docs/providers.md`, `CLAUDE.md` "Hard rules".

**Deliver:** `providers/by-eschools`: manifest (limits, window, allow-list, capabilities, `network.regionHint`), passthrough schemas that record drift instead of failing, mapper to canonical types, `sanitize()`, the probe script `pnpm probe` (logs in once, calls each read endpoint once, saves sanitised responses as fixtures, prints which open checklist items it confirmed), fixtures, green conformance suite.

**Important:** the probe uses the owner's login from `.env` and needs a Belarusian IP. Claude Code never reads `.env`; it runs `pnpm probe` within the budget of CLAUDE.md "Real diary runs" (or the owner does) and commits only what `sanitize()` produced, after `pnpm privacy` and the pre-commit guard pass. Until then the mapper is built and tested against fictional fixtures shaped from `docs/api-spec.md`.

**Done when:** conformance passes on fixtures, drift on an unknown field is recorded and does not throw, a non-allow-listed URL throws, the privacy check passes on the fixtures.

## M3. Server: schema, collector, planner, seed

**Read:** `docs/design.md` 8, 10 (all subsections), 14.1, `CLAUDE.md` "Hard rules".

**Deliver:**
- Drizzle schema and migrations for every table in design 8; `pnpm db:migrate`, `pnpm db:studio`.
- Collector over the provider interface: upsert with change and removal detection, `mark_history`, `mark_events`, `sync_runs`, `sync_coverage`, drift events, raw responses with retention. Lesson identity: by `external_id`, and when that finds nothing by `(student, date, slot, subject)`, so a lesson whose id changes (e-schools: `lesson_uuid` null, then a real one) keeps its row, ticks and history (design.md 8, api-spec 7.5); tested with a fixture week fetched twice.
- Planner (design 10.4): tick, window and jitter from the manifest, catch-up after downtime, request cap per run, pause and doubling after failures, offline detection, weekly re-scan, backfill. Retention janitor.
- `pnpm sync:once`: one collector run for the owner's account from `.env` into the local database (creates a minimal family on first run), so the schema and the mapper meet real data early. Run by the owner.
- `pnpm db:seed`: a fictional family matching the prototype (two children, one in a class without marks), a school year of marks, lessons, homework, tags and study sessions, so every screen can be built without the diary. It creates demo logins (a parent and a student, e-mails at example.com, a fixed demo password printed by the command) and is safe to re-run (`pnpm db:seed --reset`). Its diary logins (from M5e: one per child, with a run log, verified weeks and a drift notice) have no credentials: the planner takes only accounts that have them, and «Обновить сейчас» answers that it is a demo.
- Swagger skeleton at `/api/docs` generated from Zod.

**Done when:** collector tests run against `demo-minimal` and the test database, a re-fetched week with a changed mark produces `mark_history` and `mark_events(changed)`, the planner tests cover window, catch-up, cap and pause, `pnpm db:seed` runs on an empty database, and the owner's `pnpm sync:once` fills the local database without drift errors.

## M3a. School details, shared children, per-child sync window

**Read:** `docs/providers.md` 3 and 4 (capabilities, `getBellSchedule`, `getWeekTemplate`, the per-student rule, `Lesson` and `Subject` fields), `docs/api-spec.md` 6.4, 6.7a, 6.10 and 7.5, `docs/design.md` 2, 7.1, 7.2, 8, 10.2 and 10.4 (new tables, the child/family split, the window, retention), `docs/ux-principles.md` D51, D53, D54, D55.

**Deliver:**
- Core: the new canonical fields and types with Zod schemas, the five capabilities, `getBellSchedule?` and `getWeekTemplate?` in the interface, conformance checks for them (optional methods, per student, no teacher of another group).
- `providers/by-eschools`: the reads of 6.7a and 6.10.1 to 6.10.4 in the allow-list and the mapping of 7.5, fetched once a day and cached for the run; ADDITIONAL_HOLIDAYS only for grades 1 and 2; sanitised fixtures (teacher names replaced) and tests. `pnpm probe` reads them too, so the owner refreshes fixtures with one run.
- Server: `bell_schedules`, `week_templates`, the new columns on `subjects` and `lessons`, migration, collector (once a day, replace on fetch), retention rows.
- Real diary runs by Claude Code (CLAUDE.md): `probe` and `sync:once` share one login guard (`diary_accounts.last_login_at` and the manifest's login interval; a cap of three runs a day with trigger `cli-claude`, set by `MARKSY_RUNNER=claude`; 07:00 to 20:00 in the school's timezone; a refusal prints the next allowed time and exits non-zero); `pnpm probe --offline [run]` on the saved raw responses without a login; `data/probe/` keeps the last three runs and deletes older ones; deny rules for `.env*` (Read, Grep, and `cat`/`type` in Bash) in `.claude/settings.json` (`data/` stays readable); the pre-commit guard of CLAUDE.md (`.githooks/pre-commit`, `core.hooksPath` set by the `prepare` script) with the local deny-list built by `probe` from the latest raw responses. Tests: the login guard refuses inside the hour, over the cap and at night; offline mode imports nothing that can log in; the pre-commit guard refuses a staged `data/` file, a dump and a file that contains a deny-listed value, and names the file and line only.
- `pnpm db:backup`: `pg_dump` of `marksy` through the Docker container into `data/backups/<timestamp>.sql.gz` (gitignored with `data/`), keeping the last five; `pnpm db:restore <file>` for the owner. Run it before the tenancy migration below (CLAUDE.md, migrations).
- Server, tenancy split (do it now, while the data is small): `students` lose `family_id` and `diary_account_id`; new `family_students`, `student_sources`, `memberships`; `student_identities` without `family_id`, unique per `(provider_id, external_id)`; `users` lose `family_id` and `role`; `user_student_access` gains `family_id`; child-owned tables (design 7.1) lose `family_id`; `families.settings` loses `sync_window`, `low_mark`, `drop_step`, which move to `family_students.settings`; `students.timezone`, `users.timezone`. One migration that carries the existing rows over (each student gets one active link and one active source, each user one membership), with a test on a copy of the seed. Queries of child-owned data go through `family_students`; a helper makes "the children this family may see" the only way in.
- Collector: the per-child window of 10.2 from the stored timetable and bells (unit tests: two children with different days and shifts, a holiday, a day without times falls back to the manifest), the account window as their union, one read per child through the `active` source with failover, and the daily `getAccount()` check of the other sources that suspends a link when a login no longer shows the child.
- `demo-full` and `pnpm db:seed`: the same details for the fictional family (two bell schedules, a split subject, rooms, a regular week), matching the prototype; Марк on a second fictional provider with fewer capabilities, and a second fictional family that also follows Марк, so both cases can be built and tested without real data.

**Done when:** conformance passes for every provider with and without the new capabilities; `pnpm probe` and `pnpm sync:once` (run by Claude Code under the budget, or by the owner) fill the new tables for both children (counts only) with different bells for the two classes; no teacher of another subgroup is stored; the privacy check passes on the new fixtures; the migration keeps every existing row reachable for the owner's family (counts before and after); the planner's dry run on the owner's data shows today's window per child and no run outside it except catch-up.

## M4. Accounts, families and the read API

**Read:** `docs/design.md` 7 (all), 9, 14.1.

**Deliver:** read routes include the school details of M3a (lesson end time, room and group; the subject's teacher, group, level and lessons per week; the child's bells and regular week). `pnpm dev:connect` (reads the owner's logins from `.env`, runs the same service as «Подключить дневник», idempotent after a database reset), connect a diary with the provider picker (creates the family) and add another one from Семья, with the join / follow choice for a child already followed by another family (design 7.2), membership switching for a person in several families, Marksy login with argon2id and session cookies, invites with a 48-hour code, roles and student access, family management; credentials encrypted with AES-256-GCM; read routes for providers, overview, marks feed, subjects, subject, schedule, finals, attention, sync status; everything in Swagger.

**Done when:** every route has Supertest tests including "another family's data is not reachable", "a shared child's data is reachable from both families but neither family's tags, rules, members or author names are", "a suspended link serves nothing" and "no session, no data"; no route returns or logs a credential; after `pnpm dev:connect`, `pnpm smoke:lan` (with `pnpm dev:lan` running) signs in through the home-network address of the app server and reads `/auth/me`, `/students` and every read route of each child with no failure, no password or token in any response, and a session cookie that works over http (`SameSite=Lax`, `HttpOnly`, `Secure` only when `PUBLIC_URL` is https). The check of the screens on a phone starts with M5a.

## M5a. Web: tokens, shell, login, pick, Главная, Внимание

**Read:** `docs/ux-principles.md` (all), `docs/design.md` 4, 5.1, 5.2, 5.2a, 6, 12, 13, 13.1, the prototype screens Вход, С кого начнём, Главная, Внимание.

**Deliver:** tokens pipeline (`docs/tokens.json` to CSS variables and Tailwind theme, light and dark), i18n wiring, app shell (ScreenHeader with StudentBar and bell, tab bar, PeriodBar plus PeriodNav with swipe, bottom sheets), API client from OpenAPI, `useScale`, `useCapabilities`, login (three paths), «С кого начнём?» with the rule that child screens need a pick, Главная including the class-without-marks variant, the Внимание block and the Внимание screen (design 5.2a, computed on read). The bell in the header and the inbox come with M9; until then the header has no bell.

**Done when:** `/ui-check` on these screens reports no differences that matter, the shell works at 360 px and on a tablet, no hex colours and no literal strings in components; `pnpm smoke:ui` (with `pnpm dev:lan` running) walks the login, the student pick, Главная and Внимание over the home-network address on a phone and a tablet size, on the owner's family and on the seed, with no failure, and each screen's pair with the prototype shows no difference that matters; today, now and period edges follow the child's school timezone, not the device's (a test with the device in another zone); and at the end the owner opens the login, the pick, Главная and Внимание once on their own phone.

**Split (approved):** session A, the shell (tokens, i18n, API types and client, state, ScreenHeader, StudentBar, TabBar, PeriodBar and PeriodNav with swipe, BottomSheet, FreshnessBanner, `smoke:ui`); session B, the login's three paths and «С кого начнём?»; session C, Главная, Внимание and the server additions they need. Until M6 the pick card has no tag line at all; until M5d the freshness banner has no chevron (the Sync screen it opens comes then).

## M5b. Web: Оценки, Итоги, Предметы, Предмет

**Read:** `docs/design.md` 5.3, 5.3a, 5.3b, 5.4, 6.1, 6.6; prototype screens Оценки, Итоговые отметки, Предметы, Предмет.

**Deliver:** MarkFilter (Все and Теги with any/all, one shared state), StatBlock, TrendCard, distribution, finals table, subject list with sorting, subject screen with accent colour, settings sheet (goal, colour), «Обратить внимание», «Ближайшие уроки», the class-without-marks variants. Work and lesson types are almost never set in real data (1 mark of 72, 3 lessons of 306, api-spec 7.3): a work type label appears under a mark only when the diary has one, with no placeholder; the test pencil on chips and every "is this a test" come from the tag «Контрольная» (design.md 6, D50); test with fixtures where every type is null and check that no screen has an empty slot or a dangling separator. The Оценки feed loads its next page by itself when about two screens are left (IntersectionObserver); «Показать ещё» stays as the fallback. Once the diary posts the first term's finals (after 31 October 2026): one real `pnpm probe`, the mapping of the finals response checked against its real shape, and Итоги checked on the owner's family; if M5b is done by then, this moves to the milestone in progress.

**Done when:** the whole read side of the app (login, pick, Главная, Внимание, Оценки, Итоги, Предметы, Предмет, every child, every period) runs locally on the owner's family and on the seed in a desktop browser and on a phone over the home network with `pnpm dev:lan`. This is the first milestone the owner uses day to day for testing.

## M5c. Web: Расписание

**Read:** `docs/design.md` 5.5, 6.5; prototype screen Расписание.

**Deliver:** day and week views with the period navigator, LessonRow with пометки, LessonMenu (готово first, задание, урока не будет), ready ticks with `lesson_prep_events`, own homework items, missing slots, «Обратить внимание» for the selected range (read from `lesson_tag_hits`, hidden until M6 fills them; the seed gets no hits before M6). One rule for "the lesson has passed" in core (`lessonPassed`) behind the server's 409, the ⋯ menu and the «сейчас» tint. The teacher's comment row in Оценки opens its lesson in Расписание.

**Moved on (owner, 2026-10-24):** the finals check carried over from M5b (one real `pnpm probe` once the diary posts the first term's finals after 31 October 2026, the mapping of the finals response checked against its real shape, Итоги checked on the owner's family) belongs to whichever milestone is in progress after 31 October; M5c is not held open for it.

## M5d. Web: Ещё and settings screens

**Read:** `docs/design.md` 5.6, 5.6a, 5.7; prototype screens Ещё, Семья, Синхронизация, Оформление, Аватар.

**Deliver:** Ещё in the documented order (the row «Настройки уведомлений» comes with M9), Семья (members, invites, diary accounts, students), avatars, Синхронизация (status, history, manual refresh within the login limit), Оформление (theme, palette, wallpaper, font, subject colours), student mode and simple mode, manual entry of past years' finals (`PUT /api/students/:id/final-marks`, the button «Ввести итоги прошлого года» on Итоги → Годы for admin and parents; moved here from M5b).

**Moved on (owner, 2026-10-25):** M5d is merged before 31 October; the finals check (one real `pnpm probe` once the diary posts the first term's finals, `mapFinals` checked against the real shape of `final/whole`, Итоги checked on the owner's family) belongs to the first milestone that starts after 31 October 2026, and is part of its Done when.

## M5e. Translations

**Read:** `docs/i18n.md` (all).

**Why here:** the interface strings keep changing until the screens of M5a to M5d are done; translating earlier would mean translating twice. Until M5e only `en` and `ru` exist and every other language falls back to English key by key; `ru` is reviewed by the owner.

**Deliver:** machine translations of `en.json` into `be`, `uk`, `kk`, `pl`, `de`, `es`, `pt`, `fr`, `nl`, `ro`, each marked `machine` in `locales/STATUS.md` (the app shows "help improve this translation" for them); every plural category each language needs; placeholders identical to the source; Russian copy rules (`беларуский`) and the no-gender rule (`docs/i18n.md` 4) kept in every language; the tab bar and chips fit at 360 px in all twelve. Also (owner, 2026-10-25, from the M5d review): a fictional demo diary account in `pnpm db:seed` (with sync runs, a plan and a drift notice) so that `pnpm smoke:ui` shoots Синхронизация (the state card, the plan, the run log) and Семья's diaries next to the prototype, plus a typed-in past year and a wallpaper state.

**Done when:** `pnpm i18n:check` reports no errors and no warnings for all twelve files, and the pseudo-locale and the longest languages (de, fr) fit every screen without ellipsis. `pnpm smoke:ui` has app and prototype pairs of Синхронизация and Семья with the demo diary.

## M6. Tags

**Read:** `docs/design.md` 6.3; prototype screens Теги, Тег, Расписание, Главная.

**First (owner, 2026-10-29):**
1. The flaky `web/src/features/subjects/subjects.test.tsx` («switching the child opens their subject of the same name»: the tab «Милена» was not found once in a full run, most likely looked for before the screen rendered after loading): find the cause, fix it (wait for the element, never a longer timeout or a retry), then run the full `pnpm check` five times in a row, all green.
2. `pnpm dev:connect` and `pnpm sync:once` refuse a demo provider («это демо-дневник»), so a seed login can never be taken over or given credentials from the command line (privacy review of M5e).
3. `pnpm dev` and `pnpm dev:lan` check ports 5173 and 3000 before starting. When our own app already answers there (the PWA, and `/api/health` through it), they print «dev:lan уже запущен: http://<ip>:5173» (the address `smoke:lan` uses) and exit with 0 instead of a stack trace; when another program holds a port, they say which port and the process id that holds it, and exit non-zero. Tested without starting a server (the check as a pure function over what the ports answer).

**Deliver:** presets, matching at sync into `lesson_tag_hits`, recompute on tag change, the Теги screen and editor with the live check (its entry «Уведомления по тегам» comes with M9), the тег пометка in the schedule, tags on marks for the filter, tag hits in «Обратить внимание» and «С кого начнём?».

**Done when:** matching, recompute and the screens have tests; a Supertest test shows that a child shared by two families never shows the other family's tags (not on lessons, marks, the filter, «Обратить внимание» or «С кого начнём?», and not in the live check), while a student who is a member of both families sees the tags of both on every one of these surfaces (design.md 7.1; until M6 the schedule reads only the current family's hits).

## M7. Study time

**Read:** `docs/design.md` 5.8, 6.7; prototype screens Занятия, Главная, Предмет.

**Deliver:** sessions and events, timer endpoints, StudyBar, the two-step start sheet, estimates from ticks (gaps 3 to 90 minutes, batches), Занятия screen, «Занятия сегодня», the subject's Занятия section. Time is neutral and never compared with marks.

## M8. PWA

**Read:** `docs/design.md` 13, 14.

**Deliver:** manifest and icons, service worker with an offline shell and cached last data, install prompt, update flow. Push handling is added with M9.

**HTTPS on the phone.** Browsers allow a service worker, installation and push only on https (or localhost), so plain `http://<ip>:5173` is not enough here. Add `pnpm dev:lan:https` with a locally trusted certificate (mkcert: its root installed on the phone once) and document it in README; or use the remote-access route chosen for M10 if it is ready. **Done when:** the PWA installs on the phone from the home network and opens offline with the last data.

## M9. Notifications

**Read:** `docs/design.md` 5.2b, 11, 6.4; prototype screens Уведомления, Настройки уведомлений, Правило уведомления, Внимание (the «пришло …» line).

**Deliver:** the bell in every header (and on «С кого начнём?»), the `notifications` inbox with unread count and deep links, «пришло …» on Внимание rows, alert rules and the rule editor with the live check, quiet hours and grouping, Web Push (VAPID), Telegram (link code, webhook), digests, tag reminders at their moments, drift and auth alerts for the admin, push handling in the service worker (deep links on tap).

**Done when:** rules, quiet hours, grouping and every channel have tests; Supertest tests show that a child shared by two families never shows the other family's rules or inbox notifications (not in the inbox, the unread count, «пришло …» or a push or Telegram message), and that an event about the shared child notifies each family by its own rules only.

## M10. Running at home

**Read:** `docs/design.md` 10.1, 14, 17 (hosting question).

**Decide first:** how the app is reached from outside the home network (Cloudflare Tunnel or Tailscale, design 17). **Deliver:** production Docker Compose for API, web and database, daily `pg_dump` to a local folder outside the repo with rotation, restore instructions in README, health monitoring of the collector.

## Notes

- M0: TypeScript is pinned to 6.0 because typescript-eslint does not support TypeScript 7 yet. Raise it when typescript-eslint does.
- M1: the provider list lives in `packages/registry`, not in core (core must not import providers, and providers depend on core). A grading scale is plain data sent to the web app; formatting is `formatValue/formatAverage/formatFinal(scale, v, locale)`. The trend tolerance is `0.3 × (max − min) / 9`, exactly 0.3 on by-10. The manifest has `network.baseUrl`; the client takes paths only. Guidance gets `isTest` per lesson from the server (the tag «Контрольная», M6) and returns facts with optional advice as i18n keys. `neededAverage` is `null` for final rules that cannot be inverted, which hides the goal card. A year without marks is a student year without a scale (`gradingScaleId = null`), never a grade number (ux-principles D49). Movers: core returns every subject with a trend sorted by the size of the change; screens apply their limits (design.md 6.1). The ten other languages moved to a milestone of their own, M5e. Fixed on the way: the prototype's `band()` puts averages between two bands (6.5, 8.5) into `top`; core puts them in the band whose edge they have reached.
- M2: the allow-list names the login and nine reads exactly, no `**`. Two canonical fields were added: `StudentRef.classExternalId` and `Lesson.attendance` (derived attendance, an ABSENT cell is never a mark). A 401 after login is an expired token (`ProviderUnavailableError`), not a bad password. The User-Agent is `network.userAgent` in the manifest. The probe replaces topics, homework, messages and comments with placeholders, prints counts only and writes fixtures only when nothing of the raw ids, names and texts survived. Final marks are parsed provisionally (`marks[subject][period]`) until a real sample exists.
- M3: a second fictional provider, `demo-full` (rich capabilities, by-10, Monday week), carries the seeded demo family and the lesson-based collector tests, so nothing outside `providers/by-eschools` names the real system. Backfill is the lowest-priority set of any allowed run (no night window); the weekly re-scan takes the term's weeks not verified for 6 days, in the weekly slot or anywhere once older than 8 days; every run fetches the standing weeks again. Raw bodies come from an `onResponse` hook of the HTTP client, named by allow-list entry; the login response is never stored. Every family's diary credentials use a key derived per family. Tag presets live in the seed until M6 moves them to core. `pnpm sync:once` exits 0 when the planner holds a run back (interval, pause, offline) and 1 only on a real failure. Schema additions beyond the first draft of design 8 are written into it (alerted_at, class_external_id, student_years.grading_scale_id, raw_responses.student_id/week_start, final_marks.raw, notifications.params).
- M3 privacy review, for M4: store a SHA-256 of session tokens and invite codes, never the raw values, so a database dump gives no live session or usable invite.
- M4: connecting a diary opens one login and the first sync goes on in it (sync/opened.ts); every route is one declaration that validates, describes and guards it (server/src/http/route.ts), and a child-scoped route reaches the child only through loadChild (an active link and the person's access). The server tests run on an in-memory PostgreSQL (marksy-postgres-test, port 5434), one file at a time. Manual real runs have a development and a production mode (`server/src/cli/mode.ts`, D57; production unless `MARKSY_ENV=development` exactly), Claude Code runs them without asking and never retries a login the diary refused (`cli_logins.outcome`, migration 0009). The API over the home network is checked by `pnpm smoke:lan` instead of a phone; the phone check of screens starts in M5a.
- M5a: the web app is Vite + React 19 + Tailwind 4 with the theme generated from the tokens (no `tailwind.config.ts`), fonts bundled from `@fontsource`, a client typed from the server's OpenAPI document (both regenerated by scripts and checked by tests). Today, now and period edges are the school's (`web/src/lib/time.ts`). Short dates go through one formatter in core with the language's own month names (ru, en). The dev API watches files by polling (`server/scripts/dev.mjs`): on Windows native file events stopped reaching tsx. `pnpm smoke:ui` shoots every screen on a phone and a tablet over the home-network address, next to the prototype's same state. Freshness is the server's: stale only when a school day of the child passed unread. Left open by the UX review for later: recurring arbitrary sizes in components into `docs/tokens.json` (`typeScale.meta`, `note`, a small radius, a sheet radius, the avatar background) before M5e; safe-area insets in the header, the navigator and the column (M8, with the installed PWA); hiding Расписание only when no child has lessons (M5c); a Внимание row for a diary account that needs a new password or a code (M5d, with Синхронизация); the school or district step for multi-tenant providers (with the first one); the short slide on a period swipe and 44 px segmented controls (M5b).
- M5b: Оценки, Итоги, Предметы and Предмет. The mark filter is one store slice; until tags exist (M6) it offers Все and Комментарии (where the diary has them), and a child whose diary has no comments is never stranded by the shared state. Absences stay in the feed as quiet rows (D58); a cell of Итоги is framed only for a final the diary sent (D59), the day it was posted is the diary's date or the day Marksy first saw it (`final_marks.first_seen_at`). The subject screen's accent comes from `tokens.json → color.subject.accent`, the period slide from `motion`. Every number of the scale is written by `web/src/lib/numbers.ts` (lint keeps it the only way). Guidance off hides the goal row and the hints; the goal stays in «Настройки предмета».
- M5c: Расписание with День / Неделя through the shared PeriodBar and PeriodNav (both take a model), the full LessonRow with every пометка, the ⋯ LessonMenu and own homework; one rule for "the lesson has passed" in core (`lessonPassed`) behind the server's 409 `lesson_passed`, the missing ⋯ and the «сейчас» tint; «Урока не будет» gives way to any mark or attendance record of the diary (the collector drops it). Tag surfaces read `lesson_tag_hits` and stay hidden until M6. A real `pnpm probe --next` (2026-10-25) found next week's lessons and homework in the diary while the collector read only the current and previous week: the standing set is now the current week, the next school week (holiday weeks skipped, three weeks ahead at most) and the previous one, and on a day without school one run of kind `ahead` in the manifest window reads the nearest school week when the last school day did not (once per stretch); a day without school no longer makes the last read stale. The finals check moved on to the milestone in progress after 31 October.
- M5d: Ещё in the documented order; Школа (bells, the year strip); Семья with requests to join, members, invites, children (avatar from traits or a photo, stop and follow again, delete data) and diaries; Синхронизация with the planner's view per diary, «Обновить сейчас» within the login budget, re-scan, drift notices hidden per family (`api_drift_acks`, migration 0012) and the run log; Оформление (theme, eight palettes, five wallpapers and an own picture with a version in its address, five fonts, subject colours) applied on every device; student mode («Близко к цели» on Главная, from `overview.nearGoals`); simple mode (a student's own setting, switched by them or by a parent on the child's screen; a large «Готово» on every lesson row, D41's one exception, no analytics); past years' finals typed in from the report card. Pictures are checked by signature and stripped with allow-lists (JPEG segments to its end, PNG and WebP chunks), removed at once with the data they belong to, and the janitor runs whether the collector is on or not. `pnpm db:read` reads the local database as `marksy_read`, a SELECT-only role. Rare response shapes found in real data are kept as `fixtures/cases/`, which no probe writes; `probe --offline` writes fixtures only with `--write-fixtures`. Left open by the reviews: a demo diary account in `pnpm db:seed` so `smoke:ui` can shoot the Sync state card, the run log and Семья's diaries next to the prototype (with a typed-in year and a wallpaper state); the copy of Ещё's subtitles against the prototype (open for the owner's review). After the merge (owner, 2026-10-25): the template became `env.example`, without the dot, and every `.env*` is closed as a whole in `.gitignore`, the pre-commit guard, `pnpm privacy` and the deny rules.
- M5e: ten machine translations made with one glossary (`locales/GLOSSARY.md`) and checked by a script and `pnpm i18n:check --strict`; `locales/_source.json` stamps each translation with the English it was made from, so a changed English text makes its translations stale (an error in `ru`, a warning in a machine language, and `--strict`, required before every merge, fails on it; owner, 2026-10-29: new and changed keys are translated into every language by each merge, never whole files). Length limits as `_comment` keys, the pseudo-locale `qps` and a development language override; `pnpm smoke:ui --lang` finds text that does not fit, skipping the diary's own text in `data-content`. A list row's title and second line take up to two lines; only the diary's text is cut to one. German keeps nouns capitalised inside sentences (`inSentence`, `capitalNouns`). A machine language links to the translation issue form and shows the consent's English text on a tap (owner, 2026-10-29). The seed has fictional diary logins without credentials (never read; «Обновить сейчас» answers `demo`), a typed-in past year and a student with a wallpaper. The finals check of M5b moves to M6, the first milestone that starts after 31 October.
- M3a: a child belongs to no family (`family_students`, `student_sources`, `memberships`); every read of a child's rows goes through `server/src/access.ts`. Migrations 0002 and 0003 carried the owner's rows over in one transaction (counts checked, nothing lost). Providers return lessons as the diary has them and the regular week once a day; the server fills a lesson's room, subgroup and teacher from it (providers.md 4, matching by `templateRef` first) and its end time from the bells. by-eschools can tell a child's subgroup only from the child's own lessons, so subjects get teacher and group from a second `getSubjects` after `getWeekTemplate` in the same login. The weekly re-scan slot is gone (manifest `weeklyRescan`, `SYNC_WEEKLY`): stale term weeks fill the school-day runs and never open a catch-up; only a finished term's once-more may run in the holidays, in the manifest window on a weekday (D55). A child newly listed by a connected login is followed from that login's family with one notice to the other family; joining is offered at connect only. `packages/demo-diary` holds the fictional diary of `demo-full` and `demo-lite` and the seed's school; `demo-lite`'s fixtures are generated from it. `pnpm sync:plan` reads manifests as JSON and cannot log in (an import-graph test checks it). Real runs: Claude Code may run `pnpm probe` and `pnpm sync:once` behind the login guard (`cli_logins`, migration 0005; the planner counts a probe's `last_login_at` too), `pnpm probe --offline` replays saved runs, and the pre-commit and commit-msg hooks refuse local data, dumps and any name or id from the latest real responses. The second probe and sync:once (2026-10-23) found half-year timetables, a class whose rooms the school never set, and the API shape of a teacher's comment without a mark: such a comment is now a remark on the lesson (D56), and a slot that cannot be read leaves its week unverified instead of being skipped. A child goes with the last family that follows them (migration 0004).
- M3: the collector does not fetch separate homework assignments (`getHomework`) or behaviour events (`getBehaviour`) yet: no provider has them. They are added together with the first provider that does; the tables already exist.
- **Reminder:** `pnpm probe` runs a second time after 2026-10-30 (Claude Code, within the budget), when the first-quarter finals appear in `final/whole`, and the final-marks parser (`mapFinals`, api-spec 6.9) is finalised from that sample.
