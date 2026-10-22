# Marksy: e-schools.by Parent Diary API Spec and Project Brief

Handoff document for building **Marksy**, a personal grade tracker on top of the internal API of `https://diary.e-schools.by` (Belarus "Электронная школа" parent diary). Product scope, data model and the app's own API are in `design.md`; this file covers the e-schools side only.

## 1. Summary

- The site is a React SPA talking to a plain JSON REST API at `https://diary.e-schools.by/api/v1`. No cookies, no CSRF token, no captcha.
- Auth is JWT. Login with parent login/password returns `auth_token` + `refresh_token`. Every request sends `Authorization: <auth_token>` (raw token; `Bearer <token>` returns 401).
- Both tokens live about 2 hours. A once-a-day job cannot survive on a pasted token, so the collector must store the parent credentials and log in on every run.
- All grades are reachable with 6 endpoints: me, student classes, weeks, weekly lessons (contain marks), final marks, subjects. All verified with real calls.
- The site works poorly from non-Belarusian IPs: through a VPN it returned 503 and then hung; with the VPN bypassed, every call returned 200 quickly. The collector must run from a Belarusian IP (see 9.1).
- No CORS headers on API responses: browser calls from another origin are blocked. A server-side collector is required.
- Unofficial API: it can change without notice. Keep the client thin and well isolated.

## 2. Project goal

1. **Collector** (server side, scheduled): logs in daily, pulls marks for every child, stores them in a local DB, detects new and changed marks.
2. **API** for the PWA: serves stored data (no live calls to e-schools.by from the PWA).
3. **PWA**: per child and per quarter views, averages per subject, filters (subject, period, mark range, work type), absences, trend charts, "new since last visit".

## 3. Verification status legend

| Tag | Meaning |
|---|---|
| **[VERIFIED]** | Observed in a real API response (checked on 2026-10-18 with a real parent account that has two children, grades 1 and 7) |
| **[BUNDLE]** | Read from the minified frontend code (`/assets/*.js`), not observed live |
| **[UNVERIFIED]** | Inferred; check before relying on it |

## 4. Authentication

### 4.1 Login [BUNDLE]

```
POST /api/v1/auth/login/parent
Content-Type: application/json

{ "login": "<parent login>", "password": "<password>" }
```

Response (fields used by the frontend):

```json
{ "auth_token": "<JWT>", "refresh_token": "<JWT>" }
```

Not called during verification (to avoid sending credentials from the browser session). Confirm on the first collector run.

### 4.2 Using the token [VERIFIED]

- Header: `Authorization: <auth_token>`, raw value. `Authorization: Bearer <auth_token>` returns **401**.
- No cookies needed.

### 4.3 Token lifetime [VERIFIED]

JWT claims: access token `jti, sub, iat, exp, usi`; refresh token `jti, sub, iat, exp, usi, ust`. `exp - iat = 2h` for **both** tokens.

### 4.4 Refresh [BUNDLE]

```
PUT /api/v1/auth/refresh
Content-Type: text/plain
Authorization: <auth_token>

<refresh_token as raw string body>
```

Response: `{ "auth_token": "...", "refresh_token": "..." }`.

Frontend behaviour: every 60 s checks `Date.now() - issuedAt > 55 min`, then refreshes; on failure it logs out. For the collector, a fresh login per run is simpler than keeping a refresh chain alive 24/7.

### 4.5 Errors [BUNDLE]

Error bodies come in several shapes; normalise all of them:

- `[{ "message": "...", "error_code": "..." }]`
- `{ "details": [{ "key": "field", "value": "message", "code": "..." }] }`
- `{ "errors": [...] }`, `{ "content": [...] }`, `{ "message": "..." }`, `{ "value": "..." }`
- plain string

`401` means not authenticated. A `401` with header `www-authenticate: IC authorization required` triggers a separate staff auth flow; not expected for parents.

### 4.6 Session snapshot in localStorage [VERIFIED]

Useful for a "paste session JSON" dev mode. `localStorage["e-school-auth-diary"]` holds `authToken`, `refreshToken`, `issuedAt` (ms) and a `person` object equal to the `/admin/auth/me` response plus a `children` map keyed by student id.

## 5. Sync flow

```
1. POST /auth/login/parent                                  -> tokens
2. GET  /admin/auth/me                                      -> children: profile_id (= student id), school_id
3. GET  /education/diary/time_activities                    -> quarters + holidays
4. GET  /education/diary/time_activities/week_activities    -> all weeks (uuid, dates, quarter link)
5. for each child:
     GET /education/diary/schools/{school}/students/{student}/classes   -> class uuid
     GET .../classes/{class}/students/{student}/educational_subjects    -> subjects
     for each week to sync:
        GET .../classes/{class}/students/{student}/lessons?week_activity_uuid={week}
     GET .../classes/{class}/students/{student}/final/whole
```

- **Hourly run (school days, 08:00 to 14:00):** current week + previous week per child (late marks are common), plus `final/whole` once a day. About 12 requests total.
- **Weekly re-scan (Friday evening):** every week of the current quarter per child, to catch marks that teachers changed or removed.
- **Backfill:** all past weeks of the school year (36 weeks per child), run once at night, throttled.
- **Upsert key:** `(student_id, lesson_uuid)`; marks also have their own `uuid`. Track `first_seen_at`, `changed_at`, `removed_at` and keep previous versions (`mark_history`) to power "new marks" and to catch edits and deletions. Scheduling, change detection and API drift logging are specified in `design.md` sections 8 and 10.
- **Grade 1 child:** no marks at all (Belarus grades 1 to 2 are unmarked). Still sync lessons and homework; show "no marks" gracefully.

## 6. Endpoint reference (parent scope)

All paths are relative to `https://diary.e-schools.by/api/v1`. `...` below means `/education/diary/schools/{school_uuid}`.

### 6.1 `GET /admin/auth/me` [VERIFIED]

```jsonc
{
  "user_id": "uuid",
  "school_id": null, "school_name": null, "our_school_id": null, "profile_id": null,
  "person_kind": "PARENT",
  "full_name": "string",
  "roles": ["PARENT"],
  "position": null,
  "students_for_parent": [
    { "profile_id": "uuid", "full_name": "string", "school_id": "uuid" }
  ],
  "parent_code": "string",
  "first_name": null, "second_name": null, "last_name": null
}
```

`students_for_parent[].profile_id` **is** the `{student}` / `{student_id}` used in all diary URLs [VERIFIED]. `school_id` is the `{school_uuid}`.

### 6.2 `GET /admin/schools/parents/{user_id}` [BUNDLE]

Parent profile. Called by the frontend after login; not needed by the collector (6.1 has everything).

### 6.3 `GET /education/diary/school_year` [VERIFIED]

```jsonc
{
  "uuid": "string", "summary": null,
  "start_year": 2026, "end_year": 2027, "label": "string",
  "start_ts": 0, "end_ts": 0,
  "status": "string", "author": "string"
}
```

### 6.4 `GET /education/diary/time_activities` [VERIFIED]

Array (9 items for 2026/2027): quarters and holidays.

```jsonc
[{
  "uuid": "string", "summary": null, "school_year": "string",
  "title": "FIRST_QUARTER",
  "description": "string",
  "type": "QUARTER",              // QUARTER | HOLIDAYS
  "start_date": 0, "end_date": 0
}]
```

Values for 2026/2027:

| type | title | dates |
|---|---|---|
| QUARTER | FIRST_QUARTER | 2026-08-31 .. 2026-10-30 |
| HOLIDAYS | AUTUMN_HOLIDAYS | 2026-10-31 .. 2026-11-07 |
| QUARTER | SECOND_QUARTER | 2026-11-08 .. 2026-12-23 |
| HOLIDAYS | WINTER_HOLIDAYS | 2026-12-24 .. 2027-01-09 |
| QUARTER | THIRD_QUARTER | 2027-01-10 .. 2027-03-19 |
| HOLIDAYS | ADDITIONAL_HOLIDAYS | 2027-02-14 .. 2027-02-20 |
| HOLIDAYS | SPRING_HOLIDAYS | 2027-03-20 .. 2027-03-27 |
| QUARTER | FOURTH_QUARTER | 2027-03-28 .. 2027-05-30 |
| HOLIDAYS | SUMMER_HOLIDAYS | 2027-05-31 .. 2027-08-30 |

ADDITIONAL_HOLIDAYS sit inside THIRD_QUARTER (grade 1 only).

### 6.5 `GET /education/diary/time_activities/week_activities` [VERIFIED]

Array (36 items): every school week.

```jsonc
[{
  "uuid": "string",               // pass as week_activity_uuid / week_activity_id
  "summary": "01 сентября - 06 сентября",
  "time_activity_id": "string",   // -> time_activities.uuid (quarter)
  "start_ts": 1788210000000,      // ms, local midnight (2026-08-31T21:00Z = 2026-09-01 00:00 Minsk)
  "end_ts": 0
}]
```

Use `time_activity_id` to map weeks (and their marks) to quarters. Pick the current week by `start_ts <= now < end_ts`.

### 6.6 `GET .../students/{student_id}/classes` [VERIFIED]

```jsonc
[{
  "uuid": "uuid",                 // -> {class_uuid}
  "summary": null,
  "label": "Д",
  "level": 1,                     // grade
  "school": "uuid",
  "dt_disbanded": null,
  "graduating_year": 0,
  "class_number": "1Д",
  "graduating": false
}]
```

One item per child observed. If several, pick the one with `dt_disbanded == null`. A `POST` on the same path also exists; not needed.

### 6.7 `GET .../classes/{class_uuid}/students/{student}/educational_subjects` [VERIFIED]

```jsonc
[{ "uuid": "uuid", "name": "string" }]   // 16 items for grade 7
```

### 6.8 `GET .../classes/{class_uuid}/students/{student}/lessons?week_activity_uuid={week}` [VERIFIED]

Array of 6 days (Mon to Sat).

```jsonc
[{
  "day_of_week": 1,
  "date": 1791752400000,           // ms, local midnight
  "slots": [{
    "lesson_uuid": "uuid",
    "lesson_template_id": "uuid",
    "subject_id": "uuid",          // -> educational_subjects.uuid
    "subject_title": "string",
    "teacher_id": "uuid",
    "type": null,                  // lesson type, see 7.3
    "number": 1,                   // lesson number in the day
    "topic": "string",
    "homework": null,              // string | null
    "message": "string",
    "start_time": "08:30",
    "has_attachments_or_links": false,
    "homework_source_id": null,
    "lesson_mark": null,           // object | null, see 7
    "substitution": null
  }]
}]
```

### 6.9 `GET .../classes/{class_uuid}/students/{student}/final/whole` [VERIFIED shape, empty]

No query params. Before the first quarter ends the response is:

```json
{ "marks": {}, "behaviour": {}, "diary_signature": {} }
```

From the frontend code, `marks` is a nested map `marks[<key1>][<key2>] = { mark, kind }`, most likely subject id, then period (quarter / year) [UNVERIFIED]. Store the raw JSON and finalise the parser after 2026-10-30, when Q1 marks appear.

### 6.10 Other read endpoints (optional) [BUNDLE]

| Method | Path | Use |
|---|---|---|
| GET | `.../classes/{class_uuid}/students/{student}/master_messages?week_activity_id=` | Class teacher messages per week |
| GET | `.../classes/{class_uuid}/students/{student}/diary_signatures/weekly?week_activity_id=` | Parent weekly signature status |
| GET | `.../classes/{class_uuid}/students/{student}/lessons/{lesson_uuid}/attachments_and_links` | Homework attachments |
| GET | `.../classes/{class_uuid}/timetables/whole` | Class timetable |
| GET | `.../bells/whole` | Bell schedule |
| GET | `.../employees/{employee_uuid}/fio` | Teacher name by `teacher_id` |
| GET | `/institution/schools` | Schools visible to the user |

### 6.11 Write endpoints: DO NOT CALL

These change state on the real school system. The collector must be read-only.

| Method | Path |
|---|---|
| POST | `.../students/{student}/diary_signatures/weekly/activities/{week_activity_id}` (parent signs the week) |
| POST | `.../students/{student}/diary_signatures/final/activities/{period}` (parent signs final marks) |
| PUT | `/admin/schools/parents/{uuid}/reset/password`, `/change/password`, `/change/temppassword` |
| PUT | `/admin/schools/parents/{uuid}/status/{status}/dt_update/{version}` |
| POST | `/admin/schools/parents/forgot-password`, `/admin/schools/parents/reset-password` |

The frontend bundle contains about 640 endpoints in total (teacher journal, planning, admin). Everything outside this document is out of scope.

## 7. Marks

### 7.1 `lesson_mark` object [VERIFIED]

```json
{
  "uuid": "uuid",
  "summary": null,
  "type": null,
  "mark": "8",
  "kind": "SINGLE",
  "comment": "",
  "author": "uuid"
}
```

Observed on 2 recent weeks of the grade 7 child: 13 marks, all `kind: "SINGLE"`, values 4 to 10.

### 7.2 `kind` [VERIFIED: SINGLE] [BUNDLE: others]

| kind | Meaning | `mark` content |
|---|---|---|
| `SINGLE` | One numeric mark | `"8"` |
| `DOUBLE` | Two marks for one lesson | `"7/9"` |
| `ABSENT` | Absent (UI: н) | non-numeric |
| `PASS` / `NOT_PASS` | Pass / fail (зач. / незач.) | non-numeric |
| `EXEMPT` | Exempt (освоб.) | non-numeric |
| `MASTERED` / `NOT_MASTERED` | Mastered / not (осв. / не осв.) | non-numeric |
| `NOT_TAKEN` | Not assessed (н/а) | non-numeric |

The frontend counts weekly absences as slots with `lesson_mark.kind === "ABSENT"` and highlights a cell red if any numeric part of `mark` is below 4.

### 7.3 Work type enums [BUNDLE]

`lesson_mark.type` (what the mark is for; `null` observed = ordinary classwork):

| value | UI label |
|---|---|
| CLASSWORK | Работа на уроке |
| HOMEWORK | Домашнее задание |
| PRACTICAL_WORK | Практическая работа |
| LABORATORY_WORK | Лабораторная работа |
| CREATIVE_WORK | Творческая работа |
| SUMMARY | Изложение |
| DICTATION | Диктант |
| TEST | Контрольная работа |
| INDEPENDENT_WORK | Самостоятельная работа |
| ESSAY | Сочинение |
| KNOWLEDGE_CONTROL | Контроль знаний |
| BY_HEART | Наизусть |
| TRANSLATION | Перевод |

`slot.type` (lesson type): INDEPENDENT_WORK, PRACTICAL_WORK, LABORATORY_WORK, TEST, EXCURSION, or `null` for a regular lesson.

### 7.4 Averages

- `values = mark.split("/").map(Number).filter(Number.isFinite)`; each value counts as a separate mark.
- Only `SINGLE` and `DOUBLE` go into averages. Other kinds are counted separately (absences, passes, exemptions).
- 10-point scale; the official diary highlights values below 4. Marksy's own bands (1–4, 5–6, 7–8, 9–10) are defined in `design.md` section 6 and `tokens.json`.
- Useful extra filter: tests only (`type` in TEST, DICTATION, ESSAY, KNOWLEDGE_CONTROL, INDEPENDENT_WORK).

## 8. Network and etiquette

- From a Belarusian IP without VPN: 12 calls, serial, 1.5 s apart, all returned 200 quickly [VERIFIED].
- Through a VPN: 503 on everything, then connections hung. Treat 503 or a hanging connection as "probably wrong network path" first.
- Real rate limits are unknown. Stay conservative:
  - strictly serial requests, 1.5 to 3 s apart; backfill and re-scans slower (3 to 5 s after 40 requests);
  - at most one login per hour per account, whatever triggers the run; scheduled runs on school days inside a window (default 08:00 to 14:00 Europe/Minsk) with a random 0 to 20 minute offset, weekly re-scan Friday evening, backfill at night; details in `design.md` section 10.2;
  - on 503/429/network error: exponential backoff (30 s, 2 min, 10 min), then give up until the next schedule;
  - one login per run; never loop on failed logins (risk of account lock);
  - normal browser-like `User-Agent`; no parallel requests.

## 9. Proposed architecture

### 9.1 Hosting constraint: Belarusian IP

Requests to `diary.e-schools.by` (IP `195.50.22.197` as of 2026-10-18, shared with `e-schools.by`) must leave from a Belarusian IP without VPN. This rules out foreign VPS, serverless platforms (Cloudflare Workers, Vercel, AWS Lambda) and GitHub Actions as the place where the collector runs.

Options, in order of preference:

1. **Home machine in Belarus** (Raspberry Pi, NAS, always-on PC) on the home ISP connection. Free, residential IP.
2. **VPS hosted in Belarus.** Stable, but a datacenter IP may be treated differently; test before committing.
3. **Split setup:** collector at home pushes data to a cloud backend/DB; PWA and its API live in the cloud.

If the home machine also serves the PWA, expose it through Cloudflare Tunnel or Tailscale instead of opening router ports. Outbound requests to e-schools.by still go directly from the home IP.

If the host runs a VPN, add a split-tunnel route for `195.50.22.197` (OpenVPN: `route 195.50.22.197 255.255.255.255 net_gateway`).

### 9.2 Stack, schema and screens

Decided and specified in `design.md`: TypeScript, Express 5 + Drizzle + PostgreSQL 16 (Docker), React 19 + Vite PWA with Tailwind on `tokens.json`, Vitest + Supertest, Swagger at `/api/docs`. The collector runs as a node-cron job inside the same process on the host from 9.1. Data model: `design.md` section 8; screens: `design.md` section 5 and `mockups.html`. Store the raw JSON of every response (`raw_responses`) so the schema can evolve without re-fetching.

## 10. Remaining checks for the first collector run

Verified already: auth header format, `/admin/auth/me`, classes, subjects, weeks, lessons, `lesson_mark` shape, timestamp units (ms), no CORS.

Still open:

- [ ] `POST /auth/login/parent` request/response (first real login from the collector).
- [ ] `PUT /auth/refresh` (only if a refresh chain is used).
- [ ] `final/whole` populated shape: re-check after 2026-10-30 (end of Q1) and finalise the parser.
- [ ] Real samples of `DOUBLE`, `ABSENT` and non-null `type` marks: log the first occurrences and confirm 7.2 / 7.3.
- [ ] Behaviour after token expiry (expected 401).
- [ ] Whether a student login endpoint exists (`/auth/login/student` or similar in the bundle) and whether a student token reads the same diary routes.
- [ ] Whether a re-fetched week can return a different `lesson_uuid` for the same slot (timetable edits), which affects removal detection.

Save sanitised fixtures (names and ids replaced) of every endpoint into `fixtures/` on the first run and write parser tests against them.
