# Marksy: e-schools.by Parent Diary API Spec and Project Brief

Handoff document for building **Marksy**, a personal grade tracker on top of the internal API of `https://diary.e-schools.by` (Belarus "Электронная школа" parent diary). Product scope, data model and the app's own API are in `design.md`; this file covers the e-schools side only.

## 1. Summary

- The site is a React SPA talking to a plain JSON REST API at `https://diary.e-schools.by/api/v1`. No cookies, no CSRF token, no captcha.
- Auth is JWT. Login with parent login/password returns `auth_token` + `refresh_token`. Every request sends `Authorization: <auth_token>` (raw token; `Bearer <token>` returns 401).
- Both tokens live about 2 hours. A once-a-day job cannot survive on a pasted token, so the collector must store the parent credentials and log in on every run.
- All grades are reachable with 6 endpoints: me, student classes, weeks, weekly lessons (contain marks), final marks, subjects. All verified with real calls.
- The timetable with rooms, the bell schedule (lesson end times, shifts, separate bells for grade 1), teachers, subgroups and the level of study are reachable with four more reads (6.7a, 6.10). Verified on 2026-10-23 from the requests the site's own «Расписание» pages make.
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

### 4.1 Login [VERIFIED, first probe]

```
POST /api/v1/auth/login/parent
Content-Type: application/json

{ "login": "<parent login>", "password": "<password>" }
```

Response (fields used by the frontend):

```json
{ "auth_token": "<JWT>", "refresh_token": "<JWT>" }
```

Confirmed by the first `pnpm probe` run: 200 with `auth_token` (and `refresh_token`) for a parent login.

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

How the provider maps them (`providers/by-eschools/src/index.ts`): `400`, `401` or `403` on the login is `ProviderAuthError` (wrong credentials; the account stops until they change, never retried). A `401` on any other call means the two-hour token ran out mid-run, which the next run's fresh login fixes, so it is `ProviderUnavailableError`, not an auth failure. Other `403` and the `IC authorization` header are `ProviderBlockedError`; `429` and `5xx` are `ProviderUnavailableError`. The six body shapes above are recognised; any other shape is recorded as drift (`new_error_shape`). Error texts are never copied into errors or logs, since `details[].value` can carry the login.

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
- **Re-scan inside the school day:** every week of the current quarter not checked for six days is taken again by the ordinary school-day runs, to catch marks that teachers changed or removed (design.md 10.2).
- **Backfill:** all past weeks of the school year (36 weeks per child), run once at night, throttled.
- **Upsert key:** `(student_id, lesson_uuid)`, and when `lesson_uuid` is null `(student_id, date, number, subject_id)` (7.5); marks also have their own `uuid`. Track `first_seen_at`, `changed_at`, `removed_at` and keep previous versions (`mark_history`) to power "new marks" and to catch edits and deletions. Scheduling, change detection and API drift logging are specified in `design.md` sections 8 and 10.
- **Grade 1 child:** no marks at all (Belarus grades 1 to 2 are unmarked). Still sync lessons and homework; show "no marks" gracefully.

## 6. Endpoint reference (parent scope)

All paths are relative to `https://diary.e-schools.by/api/v1`. `...` below means `/education/diary/schools/{school_uuid}`.

The provider's `readOnlyAllowList` (`providers/by-eschools/provider.json`) lists exactly the login and the nine reads of 6.1 and 6.3 to 6.9, with `*` for the ids, not `/education/diary/**`: everything else, the write endpoints of 6.11 included, is refused by the HTTP client before it is sent. The week list, the calendar, classes and subjects are fetched once per login and reused, so a run costs one request per week and child plus about ten.

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

**Personal data: never stored, never logged** [VERIFIED present in real responses, first probe]. `first_name`, `second_name`, `last_name`, `school_name`, `parent_code`, the top-level `profile_id` and `position` here, `author` on the school year and on marks, and `school` on classes. Marksy maps none of them except as opaque ids where the app needs one (`author` on a mark becomes `authorExternalId`, a teacher id that is never resolved to a name; `school` is not read). The collector stores responses (`raw_responses`, 14 days) only after `redactRaw()` (`src/redact.ts`) dropped every one of them; `sanitize()` replaces or drops every one of them in fixtures, and `providers/by-eschools/src/provider.test.ts` checks both `sanitize()` and the committed fixtures field by field (`PERSONAL_FIELDS` in `schemas.ts`). `students_for_parent[].full_name` is mapped (it is the child's name in Family) and never logged.

Also present in real responses and known to the schemas, not read: `roles` (`["PARENT"]`), the top-level `school_id` and `our_school_id` (null for a parent); `summary`, `status` on the school year; `summary`, `school_year` on time activities; `summary`, `graduating_year`, `graduating` on classes; `lesson_template_id`, `homework_source_id` on slots; `summary` on `lesson_mark`.

### 6.2 `GET /admin/schools/parents/{user_id}` [BUNDLE]

Parent profile. Called by the frontend after login; not needed by the collector (6.1 has everything).

### 6.3 `GET /education/diary/school_year` [VERIFIED]

```jsonc
{
  "uuid": "string", "summary": null,
  "start_year": 2026, "end_year": 2027, "label": "2026-2027",      // YYYY-YYYY [VERIFIED]
  "start_ts": 0, "end_ts": 0,
  "status": "string", "author": "string"
}
```

### 6.4 `GET /education/diary/time_activities` [VERIFIED]

Array (9 items for 2026/2027): quarters and holidays.

```jsonc
[{
  "uuid": "string", "summary": null, "school_year": "2026-2027",   // the year's label, not an id [VERIFIED]
  "title": "FIRST_QUARTER",
  "description": "string",
  "type": "QUARTER",              // QUARTER | HOLIDAYS
  "start_date": 0, "end_date": 0
}]
```

Values for 2026/2027, as local (Europe/Minsk) dates. The timestamps are milliseconds at local midnight, so read in UTC every date looks one day earlier; the mapper converts them in the school's time zone [VERIFIED against the site's «Расписание четвертей и каникул» page]:

| type | title | dates (inclusive) | `description` |
|---|---|---|---|
| QUARTER | FIRST_QUARTER | 2026-09-01 .. 2026-10-31 | |
| HOLIDAYS | AUTUMN_HOLIDAYS | 2026-11-01 .. 2026-11-08 | |
| QUARTER | SECOND_QUARTER | 2026-11-09 .. 2026-12-24 | |
| HOLIDAYS | WINTER_HOLIDAYS | 2026-12-25 .. 2027-01-10 | |
| QUARTER | THIRD_QUARTER | 2027-01-11 .. 2027-03-20 | |
| HOLIDAYS | ADDITIONAL_HOLIDAYS | 2027-02-15 .. 2027-02-21 | only for grades 1 and 2 (and grade 3 in a five-year primary programme) |
| HOLIDAYS | SPRING_HOLIDAYS | 2027-03-21 .. 2027-03-28 | |
| QUARTER | FOURTH_QUARTER | 2027-03-29 .. 2027-05-31 | for grades 9(10) and 11(12): 2027-03-30 .. 2027-05-25 |
| HOLIDAYS | SUMMER_HOLIDAYS | 2027-06-01 .. 2027-08-31 | for pupils finishing grade 9: from 2027-06-11 |

**Level-specific dates exist only as free text** in `description` (Russian prose, e.g. «для учащихся 1-2 классов …»); there is no structured `levels` field [VERIFIED]. Consequences for the provider:

- ADDITIONAL_HOLIDAYS sit inside THIRD_QUARTER and apply to grades 1 and 2 only. They must be holidays for a class with `level` 1 or 2 and school days for everyone else; applying them to every child would hide a week of lessons for older children.
- The shortened FOURTH_QUARTER of the graduating grades and the later summer holidays after grade 9 are not machine-readable. Keep the `description` with the term or holiday so the app can show it as a note; do not parse the prose.

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

`end_ts` (and `end_date` in 6.4) is local midnight of the **last day** of the range, inclusive [VERIFIED, two probe runs: no week spans 8 days]; the mapper reads it that way. Not every week is 6 or 7 days: of the 36 weeks of 2026/27, 31 span 7 days, 3 span 6, one 4 and one a single day (weeks cut by the start of the year and by holidays) [VERIFIED]. Nothing may assume a week is Monday to Sunday.

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

One item per child observed. If several, pick the one with `dt_disbanded == null`.

The site itself calls this path with `POST` and a JSON body `{ "from": "dd.MM.yyyy", "to": "dd.MM.yyyy" }` (the visible week). It is a read, but its answer has a different shape [VERIFIED, 2026-10-23]:

```jsonc
{
  "classes_by_date": { "2026-10-19": ["uuid"], "2026-10-20": ["uuid"] },   // class per day of the range
  "classes": [ { /* the same class object as above */ } ]
}
```

`classes_by_date` would show a change of class during the year. Marksy keeps the `GET` (verified to work, and the allow-list stays GET-only for reads).

### 6.7 `GET .../classes/{class_uuid}/students/{student}/educational_subjects` [VERIFIED]

```jsonc
[{ "uuid": "uuid", "name": "string" }]   // 16 items for grade 7
```

### 6.7a `GET .../students/{student}/classes/{class_uuid}/subjects` [VERIFIED, 2026-10-23]

Note the order of the path (`students/{student}/classes/{class}`), unlike 6.7. This is what the site's «Список всех учебных предметов» page loads: one row per subject and teaching group, with the teacher and the level of study. 19 rows for 16 subjects in grade 7.

```jsonc
[{
  "id": "uuid",                   // = 6.7 uuid = lessons slot subject_id [VERIFIED: 30 of 30 lessons]
  "partition_type": "CLASS",      // CLASS (whole class) | GROUP (split into subgroups)
  "type": "SUBJECT",
  "subject_title": "string",
  "level_of_study": "Базовый",    // Базовый | Углубленный (basic / advanced)
  "teacher_id": "uuid",           // = lessons slot teacher_id
  "teacher": "string",            // teacher's full name, family name first: personal data, see below
  "group_id": "uuid",             // null when partition_type is CLASS
  "group_name": "1-я подгруппа"   // null | "1-я подгруппа" | "2-я подгруппа" | "1-я подгруппа (девочки)" | "2-я подгруппа (мальчики)"
}]
```

The class's list, not the child's: a split subject has one row per subgroup. Which subgroup the child is in follows from the lessons: a lesson's `teacher_id` (or its `lesson_template_id`, 6.10.3) matches exactly one row of the subject [VERIFIED: every lesson of a week matched one row; no subject had the same teacher in two subgroups]. The diary's lessons list already contains only the child's own subgroup lessons.

`teacher` is a third person's full name. Never in fixtures, logs or drift samples: `sanitize()` must replace it like a student's name.

### 6.8 `GET .../classes/{class_uuid}/students/{student}/lessons?week_activity_uuid={week}` [VERIFIED]

Array of 6 days (Mon to Sat).

```jsonc
[{
  "day_of_week": 1,
  "date": 1791752400000,           // ms, local midnight
  "slots": [{
    "lesson_uuid": "uuid",          // or null [VERIFIED, first probe: 3 of 51 lessons]
    "lesson_template_id": "uuid",
    "subject_id": "uuid",          // -> educational_subjects.uuid
    "subject_title": "string",
    "teacher_id": "uuid",
    "type": null,                  // lesson type, see 7.3
    "number": 1,                   // lesson number in the day
    "topic": "string",
    "homework": null,              // string | null
    "message": "string",
    "start_time": "08:30:00",        // HH:MM:SS, sometimes null [VERIFIED, third probe: 300 of 306 as 99:99:99, 6 null]; mapped to "08:30"
    "has_attachments_or_links": false,
    "homework_source_id": null,
    "lesson_mark": null,           // object | null, see 7
    "substitution": null           // null in every lesson seen so far; probably the substitute teacher, shape unknown
  }]
}]
```

`teacher_id` resolves to a name through 6.7a (or the bundle's `employees/{id}/fio`); `lesson_template_id` resolves to the teaching group, teacher and level through 6.10.3 and links the lesson to its timetable slot, room and bell time (6.10.2) [VERIFIED, 2026-10-23]. `start_time` is the only time on a lesson; the end time comes from the bell schedule (6.10.1).

### 6.9 `GET .../classes/{class_uuid}/students/{student}/final/whole` [VERIFIED shape, empty]

No query params. Before the first quarter ends the response is:

```json
{ "marks": {}, "behaviour": {}, "diary_signature": {} }
```

From the frontend code, `marks` is a nested map `marks[<key1>][<key2>] = { mark, kind }`, most likely subject id, then period (quarter / year) [UNVERIFIED]. Store the raw JSON and finalise the parser after 2026-10-31 (the last day of Q1), when Q1 marks appear.

The parser in `providers/by-eschools/src/map.ts` (`mapFinals`) is provisional and follows that guess: key1 is the subject, key2 is a quarter's `time_activities.uuid` (a term final) or a year-like key (`YEAR`, `annual`, `whole`: the year final). Any other key2 is recorded as drift and skipped, so a wrong guess shows up in the drift list instead of as wrong finals.

### 6.10 Other read endpoints

The first four (and 6.7a) go into the allow-list with milestone M3a (`build-plan.md`); mapping in 7.5. They were verified on 2026-10-23 from the requests the site's «Расписание» pages make, with a parent token; shapes below, examples fictional.

#### 6.10.1 `GET /education/diary/schools/{school}/bells/whole` [VERIFIED]

The school's bell schedules: one per shift and group of grades.

```jsonc
[{
  "uuid": "uuid", "summary": null,
  "title": "Расписание звонков",      // free text; "1-ые классы" for the grade 1 schedule
  "shift": 1,                          // 1 | 2
  "levels": [2, 3, 4, 5, 6, 7, 8, 9, 10, 11],   // grades it applies to
  "period": "WHOLE_YEAR",
  "days_of_week": [{
    "uuid": "uuid", "summary": null,
    "days": [1, 2, 3, 4, 5],           // ISO weekday numbers, Monday = 1
    "time_of_bells": [{ "uuid": "uuid", "summary": null, "number": 1, "start_time": "08:00:00", "end_time": "08:45:00" }]
  }]
}]
```

Observed: three schedules (shift 1 for grades 2 to 11, shift 2 for some grades with lesson numbers starting at 0, and a separate schedule for grade 1 with shorter lessons and longer breaks). The site's «Расписание звонков» page shows only the schedules whose `levels` include the child's grade. A grade can appear in two schedules (both shifts); which one the class uses comes from its timetable (`schedule_of_bells_uuid`, 6.10.2).

#### 6.10.2 `GET /education/diary/schools/{school}/classes/{class_uuid}/timetables/whole` [VERIFIED]

The class's timetables, with rooms and bell times. No student in the path: it is the whole class, both subgroups included.

```jsonc
[{
  "uuid": "uuid", "summary": null,
  "schedule_of_bells_uuid": "uuid",   // -> 6.10.1 uuid [VERIFIED]
  "class_id": "uuid",
  "class_level": 7,
  "period": "FIRST_QUARTER",          // a quarter, or a half year: FIRST_HALF_YEAR [VERIFIED], SECOND_HALF_YEAR [ASSUMED]
  "days_of_week": [{
    "day_of_week": 1,                 // 1..6; Saturday present and empty in the observed class
    "timetable_slots": [{
      "time_of_bells": { "uuid": "uuid", "summary": null, "number": 1, "start_time": "08:00:00", "end_time": "08:45:00" },
      "slots": [{                     // one per subgroup taught at that time (1 or 2 observed)
        "uuid": "uuid",
        "summary": "string",          // subject title, a part in brackets («Обучение грамоте (письмо)»); not read, dropped
        "number": 1,
        "room_id": "uuid",            // -> 6.10.4 uuid, or null when the school set no room (second probe: grade 1 class 21 of 21 null, grade 7 class 3 of 30 null, every other one in the list)
        "lesson_template_id": "uuid"  // -> 6.10.3 templates[].uuid and lessons slot lesson_template_id
      }]
    }]
  }]
}]
```

One item per planned period. A school may plan a timetable per quarter or per half year (`FIRST_HALF_YEAR` seen in the second probe, 2026-10; `SECOND_HALF_YEAR` assumed by symmetry, a value outside the list is drift). The regular week is the timetable whose period covers today, the narrower one when a quarter and a half year both do (a half year is its two quarters, from 6.4); between periods the next one to start, after the last one the latest. A quarter's timetable belongs to that term, a half year's to none (`WeekTemplate.termExternalId` absent).

#### 6.10.3 `GET /education/planning/classes/{class_uuid}/educational_subjects` [VERIFIED]

The class's teaching plan (the `planning` area, outside `/education/diary`). One item per subject; `uuid` equals 6.7's subject uuid. Large objects; the useful part:

```jsonc
[{
  "uuid": "uuid",                     // = subject id
  "partition_type": "CLASS",          // CLASS | GROUP
  "type": "SUBJECT", "pass_exam": false, "additional_characteristic": null, "special_students": null,
  "summary": "string", "author": "uuid", "dt_create": 0, "dt_update": 0,   // present, not read
  "school_subject": {
    "uuid": "uuid", "summary": "string", "kind": "01_EDUCATIONAL_SCHOOL_SUBJECT", "status": "…", "ic_code": "…", "version": 0,
    "as_json": { "short_name": "Рус. яз.", "uuid": "uuid", "author": "uuid", "school": "uuid", "subject": "…", "summary": "string",
                 "dt_create": 0, "dt_update": 0, "dt_delete": null }   // only short_name is read; subject (the catalogue entry, { as_json: { value: "Математика" } }) is dropped
  },
  "templates": [{                     // lesson templates: one per teaching group; null when the subject has none this period
    "uuid": "uuid",                   // = lesson_template_id in lessons and the timetable [VERIFIED: 30 of 30]
    "study_hours": 3,                 // lessons per week
    "study_group": { "uuid": "uuid", "name": "1-я подгруппа", "summary": "string" },   // null for the whole class
    "teacher": { "id": "uuid", "name": "string", "surname": "string", "patronymic": "string" },   // personal data
    "level_of_study": { "uuid": "uuid", "value": "Базовый" },
    "description": null
  }]
}]
```

Gives the subject's short name, lessons per week and, through `lesson_template_id`, the exact group, teacher and level of each of the child's lessons. 6.7a gives the same teacher, group and level in a flatter form; 6.10.3 adds `study_hours` and `short_name`. `templates: null` [VERIFIED, second probe] means the subject has no lessons planned this period, not an error. Every `summary` and `author` here (on the subject, `school_subject` and `as_json`) is free text or a person's id that nothing reads: `redactRaw()` drops them before a body is stored and `sanitize()` drops them in fixtures, since a summary may hold a teacher's name.

#### 6.10.4 `GET /institution/schools/{school}/premises?q=…` [VERIFIED]

The school's rooms. The site passes `q={"expr":{"units":[{"field":"dt_delete","operator":"ISNULL","operands":[]}],"operator":"AND"},"sorting":{"audience_number":"ASC"}}` (URL-encoded).

```jsonc
[{
  "uuid": "uuid",                     // = timetable slot room_id
  "audience_number": "201",           // what the timetable shows as «Каб»
  "audience_name": "string",
  "hull": null,                       // building, when the school has several
  "premise_type": { "summary": "string", "as_json": { "name": "string", "short_name": "string" /* … */ } /* … */ },
  "summary": "string", "author": "uuid", "dt_create": 0, "dt_update": 0,   // present, not read
  "dt_delete": null, "school": "uuid"
}]
```

About 60 rooms for one school. Only `uuid` and `audience_number` are read, and only those two are stored (`redactRaw()`). In fixtures `summary`, `author` and the room's own `audience_name` (it may be named after a person) are dropped, `premise_type.as_json.name` and `short_name` become one typical value («Кабинет», «каб.»), and a numbered room keeps only its form (`101С` becomes three other digits and `А`): the whole room list with its buildings' letters, next to the bells, could point to the school. A room named in words only («спортзал») stays.

#### 6.10.5 How the pieces connect

- A lesson (6.8) has `subject_id`, `teacher_id`, `lesson_template_id`, `number` and `start_time`.
- `lesson_template_id` → the template (6.10.3): teaching group, teacher, level of study, lessons per week.
- `teacher_id` → the teacher's name (6.7a `teacher`, or 6.10.3 `teacher`).
- The class timetable (6.10.2) for the lesson's term, weekday and `number`, slot with the same `lesson_template_id` → `room_id` → the room number (6.10.4), and `time_of_bells.end_time` → when the lesson ends.
- The timetable's `schedule_of_bells_uuid` → the class's bell schedule (6.10.1): breaks, shift, and the different times of grade 1.
- The timetable is the plan for the term; the weekly lessons (6.8) are what actually happens. A lesson moved or replaced shows up in 6.8, not in 6.10.2.

#### 6.10.6 Other reads seen in the bundle [BUNDLE]

| Method | Path | Use |
|---|---|---|
| GET | `.../classes/{class_uuid}/students/{student}/master_messages?week_activity_id=` | Class teacher messages per week (the site loads it with every diary week) |
| GET | `.../classes/{class_uuid}/students/{student}/diary_signatures/weekly?week_activity_id=` | Parent weekly signature status (read; signing is 6.11) |
| GET | `.../classes/{class_uuid}/students/{student}/lessons/{lesson_uuid}/attachments_and_links` | Homework attachments, when `has_attachments_or_links` is true |
| GET | `.../employees/{employee_uuid}/fio` | Teacher name by `teacher_id` |
| GET | `/institution/schools` | Schools visible to the user |

The site's menu also has «Дополнительное образование», «Питание обучающихся» and «Задолженность обучающихся» (after-school activities, school meals, debts). Not examined.

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

### 7.2 `kind` [VERIFIED: SINGLE, DOUBLE, ABSENT] [BUNDLE: others]

Second probe, six weeks of two children: 44 `SINGLE`, 1 `DOUBLE`, 27 `ABSENT`; no PASS, EXEMPT, MASTERED or NOT_TAKEN yet. Absences are far more frequent than double marks, so the derived attendance path matters from day one.

| kind | Meaning | `mark` content |
|---|---|---|
| `SINGLE` | One numeric mark | `"8"` |
| `DOUBLE` | Two marks for one lesson | `"7/9"` |
| `ABSENT` | Absent (UI: н) | non-numeric |
| `PASS` / `NOT_PASS` | Pass / fail (зач. / незач.) | non-numeric |
| `EXEMPT` | Exempt (освоб.) | non-numeric |
| `MASTERED` / `NOT_MASTERED` | Mastered / not (осв. / не осв.) | non-numeric |
| `NOT_TAKEN` | Not assessed (н/а) | non-numeric |
| `null` [VERIFIED, 2026-10-23] | A teacher's comment without a mark: `type` null, `mark` empty, `comment` set | empty |

A `lesson_mark` with neither a kind nor a mark but a comment is the teacher's remark on the lesson («нет домашнего задания»): a `BehaviourEvent` on `Lesson.behaviour` (`polarity: neutral`, `category: lesson_comment`, the lesson, subject and author ids), never a mark (`behaviour: derived` in the manifest; ux-principles D56). One with no comment either is nothing. Before 2026-10-23 such a slot failed the schema and its lesson was taken for removed. Now any day or slot that cannot be read (or a response that is not a list of days) makes the whole week unusable (it stays unverified, nothing is removed) instead of being skipped.

The frontend counts weekly absences as slots with `lesson_mark.kind === "ABSENT"` and highlights a cell red if any numeric part of `mark` is below 4.

### 7.3 Work type enums [BUNDLE]

`lesson_mark.type` (what the mark is for; `null` observed = ordinary classwork). `slot.type` is the lesson type (below).

**How often they are set** [VERIFIED, second probe, six weeks, two children]: the work type on **1 mark of 72** (`INDEPENDENT_WORK`; 71 `null`), the lesson type on **3 lessons of 306** (2 `TEST`, 1 `INDEPENDENT_WORK`; 303 `null`). Teachers of this school almost never fill them in. The interface therefore never relies on them: a work type label is shown under a mark only when there is one, with no placeholder for `null`, and tests and other kinds of work are recognised by the family's tags in topics and homework (`design.md` 6, 6.3, `ux-principles.md` D50).

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

### 7.5 Canonical mapping (`providers/by-eschools/src/map.ts`)

- `kind`: SINGLE and DOUBLE are `numeric` with `values` from the split; PASS and MASTERED are `pass`, NOT_PASS and NOT_MASTERED `fail`, EXEMPT `exempt`, NOT_TAKEN `not_assessed`; an empty `mark` shows the official cell text (зач., незач., освоб., осв., не осв., н/а). ABSENT is never a mark: it becomes an `Attendance` record (`status: absent`, code "н") on `Lesson.attendance`. An unknown kind is drift and an `other` chip with the raw text.
- `lesson_mark.type` (work type): CLASSWORK classwork, HOMEWORK homework, PRACTICAL_WORK practical, LABORATORY_WORK lab, DICTATION dictation, TEST and KNOWLEDGE_CONTROL test, INDEPENDENT_WORK quiz, ESSAY essay; CREATIVE_WORK, SUMMARY, BY_HEART and TRANSLATION are `other`. The original value is always kept in `workTypeRaw`. `null` stays without a work type ("Работа на уроке" in the UI).
- `slot.type` (lesson type): TEST test, LABORATORY_WORK lab, PRACTICAL_WORK practical, EXCURSION excursion, INDEPENDENT_WORK other, `null` regular. The lesson type alone never makes a lesson "a test" in the app: that is the family's tag «Контрольная» (`design.md` 6.3).
- Calendar: QUARTER entries are `Term`s (`kind: quarter`, index from FIRST_QUARTER ... FOURTH_QUARTER), HOLIDAYS are holidays, with dates converted in Europe/Minsk (6.4). ADDITIONAL_HOLIDAYS are holidays only for a class with `level` 1 or 2; for older grades those days are school days (6.4). A non-empty `description` is kept with the term or holiday as a note. A class with `level` 1 or 2 gets `gradingScaleId: null`, the school year without marks (`ux-principles.md` D49); from grade 3 the manifest's `by-10` applies.
- Lesson identity: `lesson_uuid` when present. When it is null, the lesson's id is `slot:<date>:<number>:<subject_id>` (start time instead of the number if that is missing too), which is unique within one student's week; its mark and absence point to that id. The collector (design.md 8) matches a fetched lesson first by id, then by `(student, date, slot, subject)`, so a lesson that gets a real `lesson_uuid` on a later fetch keeps its row, its ticks and its history instead of being removed and created again.
- School details (M3a; 6.7a, 6.10), all for the one student, fetched once a day, not every run:
  - The student's group per subject: the 6.7a row of the teacher of the student's own 6.10.3 template (the one behind their lessons' `lesson_template_id`). A split subject with no lesson seen yet this term has no group and no teacher until the first one appears. It fails closed: evidence for two groups (a lesson without a template ref given by the other group's teacher, say a substitute), a subject whose `partition_type` is missing or new with several templates, a template without its `study_group`, or rows of two teachers give no group, no teacher and none of that subject's template entries. → `Subject.groupLabel` (`group_name`), `teacherExternalId`, `teacherName` (6.7a `teacher`, family name first). Teacher names come only from 6.7a, for the student's own rows; 6.10.3's `teacher` objects are never mapped. Subjects carry these details only when `getSubjects` is called after `getWeekTemplate` in the same login (the collector does that once a day).
  - `level_of_study`: «Базовый» → `level: 'regular'`, «Углубленный» → `level: 'advanced'`, the text in `levelLabel`. `study_hours` of the student's template → `lessonsPerWeek`; `short_name` → `shortName`.
  - `BellSchedule`: the 6.10.1 schedule named by the class timetable's `schedule_of_bells_uuid`; `title` → `label`, `days`, `time_of_bells` → periods ("HH:MM"). Shift numbers stay inside.
  - `WeekTemplate` from the timetable for today (6.10.2, a quarter's or a half year's): 6.10.2 slots whose `lesson_template_id` is one of the student's (the whole-class slots plus the student's group), `cycleWeeks: 1`, `room` = 6.10.4 `audience_number` of `room_id` (absent when the room is not in the list), times from `time_of_bells`.
  - `Lesson.templateRef` = `lesson_template_id`, and the template entries carry the same key. The provider does not join lessons with the timetable: the server does, once a day, from the stored week template (`docs/providers.md` 4, «Room, subgroup, teacher and end time of a lesson»), so a run costs no extra requests. The end time comes from the bells by lesson number.
  - The student's templates are the templates of every subject the class learns whole (`partition_type: CLASS`, or a single template that is not a group's: a `GROUP` subject with one template planned so far needs the lessons' evidence like any other) plus the group templates their lessons came from (`lesson_template_id`; the lesson's `teacher_id` counts only for a lesson without one), and only when those are of one group. When no lesson was read in the login yet, the provider reads the current week once to learn them.
  - Teachers of other groups and the school's room list are never returned or stored.
- Students: `profile_id`, `full_name` and `school_id` from `/admin/auth/me`, class id, `class_number` and `level` from the class (`StudentRef.classExternalId`, `className`, `grade`).

## 8. Network and etiquette

- From a Belarusian IP without VPN: 12 calls, serial, 1.5 s apart, all returned 200 quickly [VERIFIED].
- Through a VPN: 503 on everything, then connections hung. Treat 503 or a hanging connection as "probably wrong network path" first.
- Real rate limits are unknown. Stay conservative:
  - strictly serial requests, 1.5 to 3 s apart; backfill and re-scans slower (3 to 5 s after 40 requests);
  - at most one login per hour per account, whatever triggers the run; scheduled runs only during each child's school day (from their timetable and bells; the manifest's 08:00 to 14:00 Europe/Minsk only when the day's times are unknown) with a random 0 to 20 minute offset, the term's re-scan inside those runs, backfill in any allowed run; details in `design.md` section 10.2;
  - on 503/429/network error: exponential backoff (30 s, 2 min, 10 min), then give up until the next schedule;
  - one login per run; never loop on failed logins (risk of account lock);
  - normal browser-like `User-Agent`; no parallel requests.

In Marksy: the delays, the window, the login interval and the request cap are the manifest `limits`; the User-Agent is `network.userAgent` in `provider.json`, so it can change without code (providers cannot set it from code). Within one run the shared client retries a failed read twice with a short backoff (about 7 and 15 s) and never a login; the long pauses (30 s, 2 min, 10 min and beyond) are the planner's job across runs (`design.md` 10.4).

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

Verified by the first `pnpm probe` run (2026-10, one week, two children):

- [x] `POST /auth/login/parent` with `{ login, password }` answers 200 with `auth_token` (4.1).
- [x] `end_ts` / `end_date` are the last day of the range, inclusive: weeks span 6 or 7 days (6.5).
- [x] Students' `full_name` has three words (family name, given name, patronymic), as `nameOrder: family-first` assumes.
- [x] The extra fields listed in 6.1 are present; personal ones are never stored or logged.
- [x] `lesson_uuid` can be `null` (6.8); lesson identity then falls back as described in 7.5.

Still open:

- [ ] `PUT /auth/refresh` (only if a refresh chain is used).
- [ ] `final/whole` populated shape: re-check after 2026-10-31 (the last day of Q1) and finalise the parser.
- [x] Real samples of `DOUBLE`, `ABSENT` and non-null `type` marks (second probe, `--weeks 6`): 1 `DOUBLE`, 27 `ABSENT`, 1 mark of type `INDEPENDENT_WORK`; no drift events (7.2, 7.3).
- [x] `start_time` is `HH:MM:SS` or null; the school year `label` is `YYYY-YYYY`; `time_activities[].school_year` is that same label (`YYYY-YYYY` in all 9 entries), not an id (forms printed as digits-as-9 by the probe runs of 2026-10-22).
- [ ] Behaviour after token expiry (expected 401).
- [ ] Whether a student login endpoint exists (`/auth/login/student` or similar in the bundle) and whether a student token reads the same diary routes.
- [ ] Whether a re-fetched week can return a different `lesson_uuid` for the same slot (timetable edits), which affects removal detection.
- [ ] `substitution` on a lesson: null in every lesson seen; its shape when a substitute teacher takes the lesson.
- [ ] Whether 6.7a, 6.10.2 and 6.10.3 answer the same way for the grade 1 child, and whether 6.10.2 returns the next term's timetable once it is planned.
- [x] Rooms missing from the regular week: `room_id` is null in those slots (the school set no room), never a room absent from 6.10.4 (second probe, 2026-10).

Save sanitised fixtures (names and ids replaced) of every endpoint into `fixtures/` on the first run and write parser tests against them.

`pnpm probe` does this (owner only, from a Belarusian IP, with `DIARY_LOGIN` / `DIARY_PASSWORD` in `.env`). It logs in once and reads me, classes, the calendar, the weeks, subjects, the current week's lessons and final marks of every child, about 13 requests. `pnpm probe --weeks N` (1 to 8, default 1) reads the last N school weeks instead of one, one request per week and child, strictly in order with the manifest's pauses; it refuses before reading lessons if that would exceed `limits.maxRequestsPerRun`, and each week becomes its own fixture. Raw responses stay in `data/probe/<time>/` (gitignored; the login response without its tokens; request bodies and headers are never recorded). `sanitize()` is an allow-list by key and place: it keeps subject names (only on the subjects list itself, and never when they look like a person's name), lesson titles, start times and slot numbers, enum values (`kind`, `type`, `title`, `status`, roles), the school-year label, week summaries, the diary's mark labels (`зач.`, `н/а`), timestamps and grade levels, and nothing else. Numeric marks keep their form but get other digits (`8` becomes some value from 1 to 10, `7/9` becomes `x/y`), and class letters become `А` (`7Г` → `7А`): the tests need the shape, never the child's real record. Every other string under any key, known or not, becomes a placeholder (`[text]`; topics, homework, messages and comments get readable ones), every other number becomes 0, contact fields are dropped, and every id, in values, in map keys and in URL segments, becomes a fake uuid made with a random key that exists only during the run, so nobody holding the real ids can match them later. Before anything is written, everything `sanitize()` did not keep is collected from the raw responses, the URLs and `.env`, and looked for in the sanitised fixtures and `routes.json` (lower case, name parts as whole words, ids as whole values); if anything is found, nothing is written. If anything is found, the probe lists where it came from (endpoint and key path, never the value). What does stay in the fixtures is the shape of one real week: subject names, the grade number, dates, the timetable and which lessons have a mark or an absence, without a name, an id, a real mark value or the class letter. The raw dumps in `data/probe/` do contain real names and ids: delete them once they are no longer needed. The console shows counts, enum values and this checklist, and two more checks: how many days a week spans (6 or 7: `end_ts` is the last day, which the mapper assumes; 8: it is the next midnight) and how many words students' `full_name` has (3: family, given, patronymic, which `nameOrder: family-first` assumes). Run it once after setup and again after 2026-10-31 for final marks.

Until the probe has run, the provider is tested on fictional fixtures shaped from this document (two children, grades 7 and 1, every mark kind).
