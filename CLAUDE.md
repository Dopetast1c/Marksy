# Marksy

Personal PWA that collects children's school marks from the Belarus e-diary (diary.e-schools.by) once a day, stores them, and shows them conveniently: averages per subject and period, recent marks, filters, absences, homework, notifications. Built for one family first, multi-family in the data model from the start.

This is a public repository. Anyone may clone it, so documentation is written for a stranger: no personal names, logins or family details anywhere, fictional data only in examples and fixtures, and the README must let a newcomer understand what the app does and how to run it.

**First run.** If a folder `_setup/` exists in the repository root, the repository has not been set up on this machine yet: before anything else, follow `docs/first-run.md` step by step (tools, settings, `.env`, install, checks, git, first commit and push), then report.

**Every session.** Start with `git status` and `git fetch`; if `main` is behind `origin/main` and the working tree is clean, fast-forward it. Make sure the database is up (`pnpm db:up`; if Docker Desktop is not running, say so). Then continue with what the owner asked, or with the current milestone from `docs/build-plan.md`.

Read these before any work, in this order:

0. `README.md`: what the project is for an outside reader. Keep it accurate when features or setup change.
1. `docs/ux-principles.md`: why the interface is the way it is: domain context, principles, decision log, invariants, what is open for review. Any UI change starts here.
2. `docs/design.md`: product scope, roles, screens, data model, API contract, notifications, token pipeline.
3. `docs/providers.md`: the provider contract. Everything that knows a specific diary system lives in `providers/<id>/`; the rest of the code is country-agnostic and works on canonical types from `packages/core`.
4. `docs/api-spec.md`: the e-schools.by API (the `by-eschools` provider), sync flow, network rules, verification status.
5. `docs/i18n.md`: localisation architecture and the procedure for adding a language.
6. `docs/mockups.html`: clickable prototype of every v1 screen (open in a browser). Markup and CSS variable names there match `docs/tokens.json`. Its strings are Russian; in the app every one of them is a key.
7. `docs/build-plan.md`: milestones in build order, what each must deliver, the definition of done and how to work with Claude Code here.

## Stack

- TypeScript 6 everywhere (`strict`; pinned below 7 until typescript-eslint supports it), Node.js 22, pnpm 10 workspaces (`packages/*`, `providers/*`, `server`, `web`).
- Backend: Express 5, Drizzle ORM, PostgreSQL 16 (Docker Compose for local), Zod for validation, OpenAPI 3.1 generated from Zod and served as Swagger UI at `/api/docs`. Collector runs in the same process as a node-cron job (`SYNC_ENABLED` switches it off).
- Frontend: React 19 + Vite PWA, React Router, TanStack Query, Tailwind. Tailwind theme is generated from `docs/tokens.json`; no hex colours in components.
- Tests: Vitest for units (parsers, mark math, token pipeline), Supertest for the API against a test database. Parser tests run on `fixtures/`.
- Interface languages: twelve at launch (ru, be, uk, kk, en, pl, de, es, pt, fr, nl, ro) in `packages/i18n`, `en.json` is the source of truth, `ru.json` the second complete file. No literal user-facing strings in components or notification code; dates and numbers through `Intl`. Rules and the how-to-add-a-language guide: `docs/i18n.md`. Documentation and code in English.
- Spelling in Russian copy: the Belarusian language and adjective are «беларуский» / «Беларуская», not «белорусский». Diary content (subject names) is shown as the diary sends it.

## Repo layout (pnpm workspaces)

```
packages/core/          canonical types, DiaryProvider interface, grading scales, marks math,
                        guidance rules, throttled HTTP client, provider conformance suite (@marksy/core/conformance)
packages/i18n/          interface languages, en.json (source) and ru.json, t() with plurals, i18n:check
packages/registry/      the list of providers; the only package that imports providers/*
providers/_template/    starting point for a new provider
providers/demo-minimal/ fictional fixture-only provider with the thinnest capability set
providers/by-eschools/  Belarus, diary.e-schools.by: manifest, schemas, mapper, sanitize, fixtures
server/                 Express API + collector + Drizzle schema and migrations
web/                    PWA frontend
docs/                   design.md, providers.md, api-spec.md, tokens.json, mockups.html
data/                   local raw responses and dumps (gitignored)
docker-compose.yml      postgres:16
```

## Provider boundary

- Nothing outside `providers/by-eschools/` may mention e-schools, its URLs, field names or quirks. If you need something from the source system in `server/` or `web/`, add it to the canonical types or the manifest in `packages/core` first (and to `docs/providers.md`).
- Providers make requests only through `ctx.http` (the throttled client). No `fetch` in provider code.
- Lesson types, work types, comments, attendance, terms, final marks, homework, topics, future timetable: all optional. Components check `useCapabilities(studentId)` and hide or adapt (the table in `docs/providers.md` section 10); nothing assumes a concept exists because e-schools has it. Absences are attendance records, never marks.
- Thresholds are family rules, not constants: what sends a notification, what counts as a low mark or a drop, how far ahead to warn. What a poem or a test is comes from the family's tags (`docs/design.md` 6.3), never from code or from the provider's lesson type alone: "is this a test" is "does the lesson carry the tag Контрольная". Tags never notify; notification rules reference tags and own the timing (`docs/design.md` 11). The word in copy is "тег", in code `LessonTag`. Defaults come from the scale; the value is stored per user or family and edited in the app (`docs/design.md` 6.4). Term words ("четверть") come from `Term.kind` via i18n keys, never typed into a component.
- Calendar conventions (first day of the week, weekend, school days) and name order come from the provider manifest or the locale, never from code. `getDay() === 0` style checks are a bug.
- Advice is optional: everything produced by guidance (`packages/core/src/guidance`) and the goal cards must disappear cleanly when `settings.guidance` is off; facts never depend on it.
- `providers/demo-minimal` is the thinnest provider and runs in CI next to `by-eschools`; a change that breaks either is not done.
- The UI reads the grading scale from the API (`useScale(studentId)`). No hard-coded 10, no hard-coded band ranges, thresholds, goal targets, rounding or decimals outside `packages/core/src/grading`. The `by-10` snapshot test (`docs/providers.md` 5.4) must keep passing: the Belarusian interface does not change when the model grows.
- A new provider is a new folder plus a registry entry; it must pass `pnpm test:provider <id>` before it is listed with status `beta`.

## Hard rules

- The collector is read-only for every provider. The shared HTTP client enforces each manifest's `readOnlyAllowList`; anything else must throw. For `by-eschools` the forbidden endpoints are listed in `docs/api-spec.md` section 6.11 (diary signatures, password changes).
- Requests to any diary system: strictly serial, delays and backoff from the manifest `limits` (by-eschools: 1.5 to 3 s, backoff on 503/429/network errors), one login per run, never retry a failed login in a loop.
- Sync cadence: at most one login per `minLoginIntervalMinutes` per account (60 for by-eschools), whatever triggers it (schedule, manual refresh, re-scan). Scheduled runs happen on school days inside the manifest window (by-eschools: 08:00 to 14:00 Europe/Minsk) with a random 0 to 20 minute offset; never fire at an exact minute. Weekly re-scan of the current term detects changed and removed marks; history is never overwritten silently (`mark_history`, `mark_events`).
- The scheduler is a planner, not a cron table (`docs/design.md` 10.4). Every attempt is a `sync_runs` row with outcome and timestamps; every fetched week is a `sync_coverage` row with `verified_at`. A tick decides what to fetch from that state: standing weeks, then the gap since the last success (newest first), then the weekly re-scan, within `maxRequestsPerRun`. The home server may be off for a week: the first tick after start must catch up without special code paths, and a catch-up may run outside the school-day window. Before logging in, check that this machine is online (DNS + TCP to the provider host, no HTTP); being offline is never counted against the provider. After `SYNC_FAILURES_BEFORE_PAUSE` consecutive provider failures pause the account for `SYNC_PAUSE_HOURS` (doubling, capped) and notify the admin once. Auth failures stop the account until credentials change; never retry a bad login.
- Study time (`docs/design.md` 6.7): estimates from "готово" ticks are rows with `source = inferred`, recomputed and replaced, shown with ≈ everywhere; a batch of ticks within three minutes is never turned into minutes. Copy about study time is neutral: no praise, no blame, no claims that time causes marks.
- Operational data has a retention limit (`server/src/retention.ts`, `RETENTION_*` in `.env.example`): sync runs 90 days then compacted, raw responses 14 days, mark events and the notifications inbox 180 days. Marks and `mark_history` are kept for the student's lifetime in the family. Never add a table that grows forever without a line in the retention table in `docs/design.md` 10.4.
- Every provider response is validated with a passthrough schema; unknown fields, missing fields, new enum values and new error shapes are recorded in `api_drift_events` per provider and pushed to the family admin. Parsing never fails on unknown fields.
- by-eschools: requests must go from a Belarusian IP without VPN. A 503 or hanging connection usually means the request went through a VPN. Other providers declare their own `network.regionHint`.
- Secrets live only in `.env` (see `.env.example`). Never commit `.env`, tokens, real API responses or database dumps. Never log tokens, passwords or full names. e-schools credentials are stored encrypted (AES-256-GCM, `CREDENTIALS_KEY`).
- Fixtures must be sanitised through the provider's `sanitize()`: replace names, ids and comments before saving to `providers/<id>/fixtures/`.
- Data is about minors. Every API route except login, health and docs requires a session. Every query is scoped by `family_id`.
- Design tokens are the single source of colour, type and spacing (`docs/tokens.json`). Appearance (palettes, body fonts, wallpapers; `docs/design.md` 5.6a) also comes from tokens: a palette may change only `bg`, `accent`, `accent-soft`, `accent-ink`; band, severity and subject colours never follow it. Mark band colours are never the only signal; the number or a label is always shown.
- Every student-scoped screen uses `ScreenHeader` with the `StudentBar`; switching a student never changes the screen, period or filters. No screen renders its own header.
- One kind of information, one component. Averages with band distribution are `StatBlock` (Overview and the subject screen; never on Оценки), the trend is `TrendCard` (Overview over all marks, subject screen over one subject), a mark is `MarkChip`, a subject line is `SubjectRow`, a hint is `HintRow`, a lesson is `LessonRow` (the two-bar row of `docs/design.md` 5.5; `compact` on Главная and in "Ближайшие уроки" drops факты, сигнал and подсказка) and everything you can do with it is `LessonMenu` (the ⋯ bottom sheet: готово, задание, урока не будет; no checkboxes or action links on the row), the running study session is `StudyBar` (one, above the tab bar, every screen), a session is `SessionRow` (≈ and a dotted bar for `inferred`, never silently mixed with timer rows), the time chart is `StudyChart` (same buckets as `TrendCard`), and every line under a lesson is a `LessonNote` ("пометка"; kinds and order in 5.5), a tag on a lesson is the `тег` note under it, everywhere. Use the word "пометка" in copy, docs and code, never "notice", "line" or "hint" for the same thing. The mark filter chips are `MarkFilter` (for now only Все and Теги with any/all; no work-type, threshold or absence chips) with one store slice shared by Оценки, Предметы and Предмет; the period control is `PeriodBar` (kind) plus `PeriodNav` (instance) everywhere. `PeriodNav` is sticky and owns the swipe gesture (`useSwipe`: 48 px horizontal, less than half of it vertical, ignored inside horizontal scrollers and sheets, swallows the following click). Before writing a block, check `web/src/components`; if a screen needs a variant, add a prop, never a copy.

## Working agreements

- Small commits with clear messages; one logical change per commit.
- Feature work on branches, merge to `main` when it works.
- Update `docs/api-spec.md`, `docs/design.md`, `docs/providers.md`, `docs/i18n.md`, `docs/ux-principles.md` (decision log) and `README.md` in place when a detail is verified, a decision changes or setup changes (no changelog sections).
- `.env.example` lists every variable the code reads, with a comment; adding a variable to the code without adding it there is a bug.
- Public-facing copy (README, the GitHub description, release notes) is positive and generic: it describes what Marksy builds on top of a school diary's API, names no country or specific diary system, and does not criticise any existing diary. Technical docs (`docs/api-spec.md`, `docs/providers.md`, provider READMEs) may name the systems they describe.
- The licence is PolyForm Noncommercial 1.0.0 (`LICENSE`, `"license": "PolyForm-Noncommercial-1.0.0"` in every `package.json`). Never call the project "open source" or "open-source" in public copy; say "source-available" and "free for personal and other non-commercial use". A new package gets the same `license` field.
- External pull requests are not accepted; contributions come only as Issues (bugs, ideas, sanitised diary responses when an API changes). Docs never invite a pull request.
- Providers are tested with the shared conformance suite against their fixtures; write API tests with Supertest for every route you add.
- Keep `docs/mockups.html` as the visual reference; when a screen changes in the app in a way that matters, update the prototype too.

## Commands

```
pnpm install            install the workspace (Node 22, pnpm via corepack)
pnpm db:up              PostgreSQL 16 in Docker, waits until healthy (databases marksy and marksy_test)
pnpm dev                API on 127.0.0.1:3000 (tsx watch) and PWA on :5173 (Vite, /api proxied)
pnpm dev:lan            the same, with the PWA open to the home network for testing on a phone (README)
pnpm check              typecheck, lint, tests, privacy check: must be green before every commit
pnpm format             Prettier over the workspace
pnpm --filter @marksy/server test    one package
pnpm test:provider <id> the shared conformance suite for one provider (demo-minimal, by-eschools)
pnpm i18n:check         every key, plural form and placeholder in every language file
pnpm privacy            scripts/privacy-check.mjs: secrets, forbidden files, personal data, provider names outside the provider
```

Database commands (`db:migrate`, `db:seed`, `db:studio`) arrive with M3, `probe` with M2. You never read `.env` and never run `pnpm probe`, `pnpm sync:once` or `pnpm dev:connect`: they log in to the real diary with the owner's credentials; the owner runs them.

## Local and phone testing

The owner tests every screen in a desktop browser and on a phone over the home network (`pnpm dev:lan`, `http://<computer-ip>:5173`). Keep it working: the browser talks only to the PWA origin (relative `/api` URLs, never `localhost:3000` in client code), the API binds to `HOST` (127.0.0.1) behind the proxy, session cookies are `SameSite=Lax` and `Secure` only when `PUBLIC_URL` is https, layouts work at 360 px with touch. Two kinds of data (`docs/build-plan.md`, "Data for testing"): the owner's real family in the local `marksy` database, loaded by commands only the owner runs (`pnpm probe`, `pnpm sync:once`, `pnpm dev:connect`; they use the logins in `.env`), and a fictional family from `pnpm db:seed` and fixtures for tests and for anyone without a diary account. Never read rows of the real family into the conversation (schema, counts and ids are fine) and never copy real values into code, tests, fixtures or docs; reproduce a bug seen on real data with fictional data in a test.

## Windows

The owner's machine is Windows; the shell is Git Bash.

- Never call `python` or `python3`: on Windows it is usually the Microsoft Store stub, which hangs waiting for input. Helper scripts are Node only (`node -e`, `node scripts/*.mjs`).
- Write and change files with the editing tools (Write, Edit), not with `printf`, `echo` or heredocs in the shell: Git Bash eats backslashes in them (`\\w` in a JSON regex arrives as `\w`).
- Never run, import or `tsx --eval` a probe script (`providers/*/scripts/probe.ts`): importing it starts a real login. Test the launcher only with `MARKSY_PROBE_DRY_RUN=1 node scripts/probe.mjs …`; test probe logic through `src/probe.ts`.
- One `git push` at a time: before a new push, make sure the previous one has finished. `.claude/settings.json` sets `GCM_INTERACTIVE=never`, so a push without stored credentials fails with an error instead of waiting for the Git Credential Manager account window; when that happens, tell the owner to sign in once (`git push` in their own terminal) instead of retrying.

## Build order and workflow

Follow `docs/build-plan.md`: one milestone per branch, the `/next` skill to start one (it plans first and waits for approval), `/check` before every commit, `/privacy-check` before merging, `/ui-check <screen>` for screens. Agents `privacy-reviewer` and `ux-reviewer` live in `.claude/agents/`. You commit and push yourself: commit after each green step and push the milestone branch; when the milestone is done and `/check` and `/privacy-check` are green, merge it into `main` with `--no-ff` and push `main`. Never force-push, never rewrite pushed history, never push with a failing `pnpm check`. When the docs do not answer a product question, ask the owner and write the answer into the docs.
