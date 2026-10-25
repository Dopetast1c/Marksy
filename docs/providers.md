# Marksy providers: connecting another country, school or diary system

Marksy is split in two. Everything a parent or child sees (overview, feed, subjects, quarters and years, schedule, guidance, notifications, family) works on one canonical data model and knows nothing about where the data came from. A **provider** is the only part that talks to a specific diary system. Belarus's `diary.e-schools.by` is the first provider, `by-eschools`. Adding a new country, region or a single school means writing one more provider and nothing else.

This document is the contract. If you want to connect your school's system in your own copy, read this and copy `providers/_template`. Pull requests are not accepted; to ask for a provider in Marksy itself, open an issue describing the system.

## 1. What a provider is

A provider is a small TypeScript package in `providers/<id>/` that:

1. describes itself in a **manifest**: country, name, website, which credentials it needs, which roles it supports, which grading scale the school uses, how often it may be called;
2. implements the **`DiaryProvider` interface**: log in, list students, fetch the calendar, subjects, lessons with marks and homework, final marks;
3. returns **canonical types** (`Student`, `Term`, `Subject`, `Lesson`, `Mark`, `FinalMark`) and nothing system-specific;
4. ships **sanitised fixtures** and passes the shared **conformance test**.

It must not: write anything to the source system, bypass the shared HTTP client, store secrets, or log credentials.

Provider ids are `<country-iso2>-<system>` in lower case: `by-eschools`, `ru-dnevnik`, `ua-nz`, `pl-librus`, `de-schulportal-hessen`, or for a single school `us-lincoln-high`.

## 2. Repository layout

```
packages/
  core/                 canonical types, DiaryProvider interface, grading scales, marks math,
                        guidance rules, shared HTTP client, conformance suite (@marksy/core/conformance)
  registry/             the list of providers: the only package that imports providers/*
  demo-diary/           the fictional diary API, mapper and school behind the demo providers and the seeded demo family
providers/
  _template/            copy this to start a provider (compiles, fails conformance until filled in)
  demo-minimal/         fixture-only provider with the thinnest capability set; what CI and the UI snapshots run against
  demo-full/            the fictional diary of packages/demo-diary with a rich capability set (lessons, quarters, work types,
                        comments, absences in the mark cell, finals, bells, the regular week, rooms, subgroups, teachers)
  demo-lite/            the same fictional diary as a thinner system (no lesson or work types, attendance, rooms, subgroups or
                        finals); its fixtures are written from the shared fictional school (pnpm --filter @marksy/demo-diary fixtures)
  by-eschools/          Belarus, diary.e-schools.by (reference implementation)
    provider.json       manifest
    src/index.ts        DiaryProvider implementation
    src/schemas.ts      Zod schemas of the raw API with .passthrough()
    src/map.ts          raw -> canonical mapping
    fixtures/           sanitised raw responses, one file per endpoint
    README.md           how the source system works (for by-eschools this is docs/api-spec.md)
    CHANGELOG.md        optional; not required by the project
server/                 Express API + collector; loads providers from the registry
web/                    the PWA; reads the grading scale and provider name from the API
docs/                   product docs (this file, design.md, api-spec.md, tokens.json, mockups.html)
```

`packages/registry` (`@marksy/registry`) imports every provider under `providers/` and exposes `getProvider(id)` and `listProviders()`, built with `createRegistry()` from `packages/core/src/providers/registry.ts`. Core holds only the registry logic and never imports a provider, because every provider depends on core. A provider becomes available to users as soon as it is in the registry and its manifest `status` is `stable` or `beta`; `experimental` ones (such as `demo-minimal` and `demo-full`) are reachable by id for tests and for the seed but not offered. The registry also re-exports the fixture transports of the two demo providers, so server tests reach them without importing `providers/*`.

## 3. Manifest (`provider.json`)

```jsonc
{
  "id": "by-eschools",
  "name": "Электронная школа (e-schools.by)",
  "country": "BY",
  "region": null,                       // e.g. "DE-HE" for a German state, or a city
  "scope": "national",                  // national | regional | school
  "website": "https://diary.e-schools.by",
  "status": "stable",                   // experimental | beta | stable | broken
  "maintainers": ["@github-handle"],
  "languages": { "default": "ru", "preferred": ["ru", "be"] },   // suggests a default and the order of the picker; never restricts (docs/i18n.md)
  "calendar": { "weekStart": 1, "weekend": [6, 0], "schoolDays": [1, 2, 3, 4, 5, 6] },   // ISO weekday numbers, 0 = Sunday. Israel: weekStart 0, weekend [5, 6]. Used by period presets, "next school day" and watch advice
  "nameOrder": "given-first",           // given-first | family-first (JP, CN, KR, HU); how to build displayName when the system gives separate fields
  "timezone": "Europe/Minsk",
  "roles": ["parent", "student"],       // who can log in
  "tenant": null,                       // for multi-tenant vendors (PowerSchool districts, Librus schools, Vulcan regions): { "kind": "url" | "code" | "list", "label": {...}, "hint": {...} }; null when the system has one instance
  "auth": {
    "kind": "password",                 // password | token | oauth (oauth: see section 6)
    "fields": [
      { "key": "login", "label": { "ru": "Логин", "en": "Login" }, "type": "text" },
      { "key": "password", "label": { "ru": "Пароль", "en": "Password" }, "type": "password" }
    ],
    "loginRequest": "POST /auth/login/*"   // the allow-list entry of the login call: every matching request is a login for the client (never retried, one per run), whatever the provider code says; null for token auth without a call
  },
  "gradingScale": "by-10",              // id from packages/core/src/grading/scales.ts, or inline object
  "capabilities": {                     // what the system can give; the UI adapts to every false (section 12)
    "lessons": true,                      // a timetable of dated lessons exists (false: gradebook-only systems)
    "futureTimetable": true,              // lessons for days ahead, for "tomorrow" and tags
    "topics": true, "homework": true, "attachments": false,
    "lessonTypes": true,                  // the system marks lessons as test / lab / practical
    "marksPerLesson": "one",              // one | many | none (marks not attached to lessons, see getMarks)
    "unattachedMarks": false,             // marks with a date and subject but no lesson
    "workTypes": true,                    // marks carry a category (test, homework, ...)
    "comments": true,                     // teacher comment on a mark
    "weights": false,                     // marks carry weights
    "attendance": "derived",              // separate | derived (from a mark kind) | none
    "terms": "quarter",                   // quarter | trimester | semester | other | none
    "finalMarks": true,                   // official term and year finals
    "teacherNames": true,                 // teachers of the student's own lessons and subjects
    "rooms": true,                        // a room on lessons and in the week template
    "teachingGroups": true,               // the student's subgroup / set / section on split subjects
    "bellSchedule": true,                 // start and end of every period, so breaks and "now" can be shown (getBellSchedule)
    "weekTemplate": true,                 // the student's regular week for a term (getWeekTemplate)
    "pastYears": false,                   // can the API return previous school years?
    "homeworkAssignments": false,         // homework as separate items with set/due dates and submission status (UK)
    "behaviour": "none",                  // teacher remarks, behaviour / achievement points: separate (getBehaviour), derived (on the lesson: Lesson.behaviour, e.g. a comment without a mark), none
    "cohortStats": false,                 // class average, rank, percentile, standard deviation per assessment (CN, JP, KR)
    "criteria": false,                    // multi-criteria assessment per subject (JP 観点別, UK attitude-to-learning)
    "targets": false,                     // target / predicted / current grades per subject (UK)
    "exams": false                        // named exams (midterm, final, mock) as assessment events (CN, JP, KR)
  },
  "network": {
    "baseUrl": "https://…",             // origin of the system's API; ctx.http takes paths only and refuses every other host. The offline check (design.md 10.4) probes this host
    "regionHint": "BY",                 // the collector must run from this country; null if any
    "userAgent": "Mozilla/5.0 …",       // optional; the client sends it on every request, providers cannot set it from code
    "notes": "503 or hanging connections usually mean a VPN is in the path"
  },
  "limits": {
    "minLoginIntervalMinutes": 60,
    "requestDelayMs": [1500, 3000],
    "maxRequestsPerRun": 40,              // one run stops here; unverified weeks wait for the next run (design.md 10.4)
    "syncWindow": "08:00-14:00",          // stand-in only: the real window is each child's school day from their timetable (design.md 10.2)
    "fetchUnit": "week",                  // week | day | term: the granularity the API hands data out in, i.e. the unit of sync_coverage
    "authFailureIsFinal": true            // true: a 401 stops syncing until credentials change (repeated bad logins can lock the real account)
  },
  "homeworkSemantics": "assigned-at-lesson", // assigned-at-lesson: homework shown on a lesson is for the next lesson of that subject | due-at-lesson: it is due at that lesson
  "readOnlyAllowList": ["GET /admin/auth/me", "GET /education/diary/**", "POST /auth/login/*"]
}
```

The server enforces `limits`, `network.regionHint` (as a warning in Sync, since it cannot know the IP's country for sure) and `readOnlyAllowList` in the shared HTTP client. A provider cannot loosen them from code. The manifest schema itself keeps the list read-only: entries are `GET`, `HEAD` or `POST`, and `POST` only for `auth.loginRequest`; `PUT`, `PATCH` and `DELETE` cannot be listed. An entry starts with a literal segment (`GET /**` or `GET /*/x` would open the whole host). `network.baseUrl` must be a plain `https` origin with a host name: no credentials, path, IP literal or localhost. The client checks the allow-list and the origin again when it is created, because it may get an unparsed manifest. It refuses any path the server could read differently from the allow-list: every decoded segment must consist of letters, digits and `._~@:+=,-`, so encoded or double-encoded `/`, `\`, `.` or `%`, `;` (`..;` is `..` to Java servers), spaces, control characters, `.` and `..` segments, empty segments and broken escapes never match. Any request to the login path counts as a login, whatever its method and letter case. Providers cannot set `Host`, `Content-Length` or method-override headers, and a `GET` or `HEAD` with a body is refused.

Providers do not schedule anything and do not handle outages. The core planner (`design.md` 10.4) decides which `fetchUnit`s to ask for, records coverage and failures, pauses after repeated provider errors and catches up after the home server was off. A provider's job on failure is only to throw a typed error: `ProviderAuthError` (wrong credentials), `ProviderBlockedError`, `ProviderNeeds2FAError`, `ProviderUnavailableError` (5xx, 429, timeout, an expired session), `ProviderSchemaError` (a response that cannot be used at all) or let a network error propagate; the core maps these to the failure classes. Mapping an HTTP status or an error body to one of these classes is the one piece of outage knowledge that lives in the provider, because error shapes differ per system.

**Drift.** Raw schemas are `z.looseObject`s, and every response goes through `driftChecker(ctx.drift, endpoint)` from core: `parse()` for a whole response, `items()` for lists (a broken item is reported and skipped, the rest is kept), `known()` for enum values (declare enum fields as plain strings with a list of known values, so a new value is drift, not a crash), `errorShape()` for an unrecognised error body. It reports unknown fields, missing fields, type changes and new enum values with their schema path; core strips ids from paths and keeps only enum-like samples before anything is stored. A provider may keep what it fetched once per login (a week list, a calendar) in a `WeakMap` keyed by the session object; nothing outlives the run.

## 4. The interface

```ts
// packages/core/src/providers/types.ts

export interface DiaryProvider {
  readonly manifest: ProviderManifest;

  /** Exchange credentials for a session. Called at most once per limits.minLoginIntervalMinutes. */
  login(credentials: Record<string, string>, ctx: ProviderContext): Promise<Session>;

  /** Who is logged in and which students they may see. */
  getAccount(session: Session, ctx: ProviderContext): Promise<AccountInfo>;

  /** School year, terms (quarters, trimesters, semesters) and holidays for a student. */
  getCalendar(session: Session, student: StudentRef, ctx: ProviderContext): Promise<Calendar>;

  /** Subjects the student has this school year. */
  getSubjects(session: Session, student: StudentRef, ctx: ProviderContext): Promise<Subject[]>;

  /**
   * Lessons in a date range, each with its marks and homework. Required when capabilities.lessons is true.
   * The provider decides how to chunk the range (by week, by day, one call); the collector
   * only asks for ranges it needs and stores what comes back.
   */
  getLessons?(session: Session, student: StudentRef, range: DateRange, ctx: ProviderContext): Promise<Lesson[]>;

  /**
   * Marks in a date range that are not attached to lessons (gradebook-style systems), or in addition to
   * lesson marks. Required when capabilities.marksPerLesson is 'none' or unattachedMarks is true.
   */
  getMarks?(session: Session, student: StudentRef, range: DateRange, ctx: ProviderContext): Promise<Mark[]>;

  /** Attendance records when the system tracks them separately from marks (capabilities.attendance = 'separate'). */
  getAttendance?(session: Session, student: StudentRef, range: DateRange, ctx: ProviderContext): Promise<Attendance[]>;

  /** Final, current, predicted and target grades per term and year. Optional: omit if the system has none. */
  getFinalMarks?(session: Session, student: StudentRef, ctx: ProviderContext): Promise<FinalMark[]>;

  /** Homework as separate items with due dates (capabilities.homeworkAssignments). */
  getHomework?(session: Session, student: StudentRef, range: DateRange, ctx: ProviderContext): Promise<HomeworkItem[]>;

  /** Behaviour and achievement events (capabilities.behaviour = 'separate'; with 'derived' they come on Lesson.behaviour). */
  getBehaviour?(session: Session, student: StudentRef, range: DateRange, ctx: ProviderContext): Promise<BehaviourEvent[]>;

  /** Timetable without marks, for days in the future. Optional; falls back to getLessons. */
  getTimetable?(session: Session, student: StudentRef, range: DateRange, ctx: ProviderContext): Promise<Lesson[]>;

  /** The bell schedules that apply to the student's class this school year (capabilities.bellSchedule). */
  getBellSchedule?(session: Session, student: StudentRef, ctx: ProviderContext): Promise<BellSchedule[]>;

  /** The student's own regular week for the current term (capabilities.weekTemplate): only the student's lessons, never another group's. */
  getWeekTemplate?(session: Session, student: StudentRef, ctx: ProviderContext): Promise<WeekTemplate | null>;

  /** Replace names, ids and free text in a raw response before it is saved as a fixture. */
  sanitize(endpoint: string, raw: unknown): unknown;

  /**
   * Optional: drop the personal fields the mapper never uses before the collector stores a response (raw_responses,
   * 14 days). Unlike sanitize() it keeps ids and the texts the mapper reads, so the body can be parsed again after a
   * drift fix. `endpoint` is the name the provider gave the request (a list of the whole school may keep less).
   */
  redactRaw?(endpoint: string, raw: unknown): unknown;
}

export interface ProviderContext {
  http: ThrottledHttpClient;   // the only way to make requests: serial, delayed, backoff, allow-list
  log: Logger;                 // redacts credentials and tokens automatically
  now(): Date;                 // injectable for tests
  drift: DriftReporter;        // report unknown fields, new enum values, new error shapes
}
```

**Everything is per student.** Every method takes a `StudentRef` and returns that student's data for the current school year: calendar, subjects, lessons, bells, week template. Nothing is shared between the children of a family, even in the same school: classes differ in shift, bells (grade 1 often has its own) and subgroups, and children may attend different schools. Holidays or terms that apply only to some grades are applied by the provider, so each student's calendar is already correct; a remark the provider cannot apply reliably travels as `note`. School-wide catalogues a system may have (rooms, staff, all bell schedules, the whole class's timetable with every subgroup) stay inside the provider: it resolves them into labels on the student's own records.

**Teachers are third parties.** A provider returns teacher names only for the student's own lessons and subjects (the student's subgroup), never for other groups or the school's staff list. Names live only in the family's database: never in fixtures, logs or drift samples (`sanitize()` replaces them like a student's name).

### Canonical types (abridged)

```ts
export interface AccountInfo { externalUserId: string; displayName: string | null; role: 'parent' | 'student'; students: StudentRef[] }
export interface StudentRef {
  externalId: string;                   // the child's own id in the system, the same whichever login lists the child (two parents' logins must
                                        // give the same id, design.md 7.2); never an id of the login-child relation.
                                        // Unique across the whole provider: children are matched across families by
                                        // (provider_id, externalId) alone, so a system that numbers pupils per school
                                        // or per tenant prefixes the id with it ("<tenant>:<pupil>")
  fullName: string;                     // as the system shows it
  givenName?: string; familyName?: string; middleName?: string;   // when the system has separate fields
  displayName?: string;                 // short form for headers and notifications ("Кира", "Yuki"); the core derives it from givenName or the first token of fullName per manifest.nameOrder when absent
  classExternalId?: string;             // the class or year group in the system, when its URLs or data need it (e-schools: every diary URL)
  schoolId?: string; schoolName?: string; className?: string; grade?: number; gradeLabel?: string /* "Year 7", "K", "7Д" */
  timezone?: string;                    // the school's IANA zone when it differs from the manifest's (a national system over several zones)
}

export interface Calendar {
  schoolYear: { externalId: string; label: string; start: ISODate; end: ISODate };
  terms: Term[];                                   // ordered
  holidays?: (DateRange & { note?: string; kind?: 'autumn' | 'winter' | 'spring' | 'summer' | 'additional' | 'other' })[];
  // note: the system's remark, e.g. dates that differ for some grades; kind: which holidays, only when the system says
  // so (the app names them from it; never derive it from the month)
  gradingScaleId?: string | null;                  // this student's scale this year; null = no marks this year (5.3); absent = manifest default
}
export interface Term { externalId: string; kind: 'quarter' | 'trimester' | 'semester' | 'other'; index: number; label: string; start: ISODate; end: ISODate; note?: string }
// terms may be empty for systems with continuous assessment; the UI then has no term views and no term goal

export interface Subject {
  externalId: string; name: string;
  shortName?: string;                                             // the system's abbreviation, for narrow grids
  teacherExternalId?: string; teacherName?: string;               // the student's teacher (of the student's group on a split subject)
  groupLabel?: string;                                            // the student's subgroup / set / section, as the system names it ("2-я подгруппа (мальчики)", "Set 3"); absent when the class is not split
  level?: 'regular' | 'advanced' | 'honors' | 'ap' | 'ib' | 'other';   // regular is not shown; advanced: post-Soviet "углублённый"; honors / ap / ib: US course levels for weighted GPA
  levelLabel?: string;                                            // the system's own wording, shown when level is not 'regular'
  lessonsPerWeek?: number;                                        // from the teaching plan; omitted when the system plans per fortnight or not at all
  credits?: number;                                               // US credit hours
  gradingScheme?: { categories: { key: string; label: string; weight: number }[]; dropLowest?: number };  // US category weights per course (Tests 40 %, Homework 20 %)
}

export interface Lesson {
  externalId: string;        // stable id of this lesson occurrence; if the system has none, build one from date+slot+subject
  date: ISODate; slot?: number; startTime?: string; endTime?: string;
  subjectExternalId: string; subjectName: string;
  teacherExternalId?: string; teacherName?: string;
  room?: string;             // as the timetable shows it ("201", "Лаб. 2", "S12"); from the lesson or, on the server, the week template
  groupLabel?: string;       // the student's subgroup when the subject is split
  templateRef?: string;      // opaque key of the timetable entry the lesson comes from (e-schools: lesson_template_id); absent when the system has none
  topic?: string; homework?: string; homeworkDueDate?: ISODate; hasAttachments?: boolean;   // homeworkDueDate when the system states it; otherwise the core assumes the next lesson of the subject
  lessonType?: 'regular' | 'test' | 'lab' | 'practical' | 'excursion' | 'other';
  substituteTeacherName?: string;   // Poland zastępstwo, e-schools substitution
  marks: Mark[];             // zero or more marks given at this lesson
  attendance?: Attendance[]; // attendance that arrives with the lesson (capabilities.attendance = 'derived': e-schools' ABSENT mark cell); never a mark
  cancelled?: boolean;
}

// The bell schedule of the student's class (capabilities.bellSchedule). Breaks are the gaps between periods.
export interface BellSchedule {
  externalId: string;
  label?: string;                   // the system's title, e.g. a shift or "Year 1"
  days: number[];                   // weekdays it applies to, 0 = Sunday as in manifest.calendar
  periods: { slot: number; start: string; end: string }[];   // "HH:MM"; slot numbers as lessons use them (may start at 0)
  validFrom?: ISODate; validTo?: ISODate;                     // when it applies to part of the year only
}

// The student's own regular week for a term (capabilities.weekTemplate): what the timetable plans, not what happened.
export interface WeekTemplate {
  termExternalId?: string;          // absent = the whole year
  cycleWeeks: number;               // 1, or 2 for Week A / Week B timetables
  entries: {
    cycleWeek: number;              // 1..cycleWeeks
    weekday: number;                // 0 = Sunday as in manifest.calendar
    slot: number; start?: string; end?: string;
    subjectExternalId: string; subjectName: string;
    groupLabel?: string; room?: string;
    teacherExternalId?: string; teacherName?: string;
    templateRef?: string;           // the same opaque key lessons carry
  }[];
}
```

**Room, subgroup, teacher and end time of a lesson.** A provider returns lessons as the diary has them and the student's week template once a day; it does not join the two. The server fills a lesson's `room`, `groupLabel` and `teacherName` from the stored template, in this order, and stops at the first match:

1. weekday, slot and `templateRef` → room, subgroup and teacher;
2. only `templateRef` (the lesson was moved to another slot) → subgroup and teacher, no room;
3. weekday, slot and subject (a provider without `templateRef`) → room and subgroup;
4. nothing: an empty room is better than another lesson's room.

The end time always comes from the bell schedule by slot number, never from the template. Values the lesson already carries from the diary are kept.

```ts

export interface Mark {
  externalId: string;        // if the system has none, build one from lesson id + index
  date: ISODate;             // the day the mark belongs to (the lesson date when attached)
  subjectExternalId: string; subjectName: string;
  lessonExternalId?: string; // absent for gradebook-style marks that are not tied to a lesson
  raw: string;               // exactly what the system shows: "8", "7/9", "A-", "зач.", "17/20"
  kind: 'numeric' | 'pass' | 'fail' | 'exempt' | 'not_assessed' | 'other';
  values: number[];          // numeric values on the provider's grading scale; [] for non-numeric
  workType?: WorkType;       // canonical category when it maps: 'classwork' | 'homework' | 'test' | 'quiz' | 'lab' | 'practical' | 'essay' | 'dictation' | 'oral' | 'project' | 'other'
  workTypeRaw?: string;      // the system's own label, shown when workType is 'other' or missing
  title?: string;            // assignment or exam name ("Unit 3 quiz", "期中考试", "1学期末テスト")
  assessmentType?: 'daily' | 'homework' | 'quiz' | 'test' | 'exam' | 'performance' | 'project' | 'other';   // exam-centric systems
  dimension?: 'attainment' | 'effort' | 'behaviour';   // UK effort grades sit beside attainment; default attainment
  criterion?: string;        // multi-criteria assessment: "知識・技能", "思考・判断・表現", "Attitude to learning"
  weight?: number;           // if the system weights marks (Poland: waga 1..10); default 1
  maxPoints?: number;        // for points-based marks ("17/20", 87/100, 128/150); the scale normalises; values above max are extra credit
  modifier?: '+' | '-';      // Poland "4+", "5-": the provider converts to values with the school's setting (default +0.5 / -0.25), raw keeps the sign
  status?: 'graded' | 'missing' | 'excused' | 'late' | 'incomplete' | 'not_due';   // US gradebooks: a missing assignment counts as zero, an excused one does not count
  postedAt?: ISODate;        // when the mark was published, if different from date (US: posted weeks after the due date)
  cohort?: { average?: number; sd?: number; rank?: number; size?: number; percentile?: number; gradeBand?: string };  // class or year statistics when the system publishes them
  comment?: string;
  authorExternalId?: string;
}

// Separate homework items (UK Satchel One / Show My Homework style). by-eschools has none: its homework is a line on the lesson.
export interface HomeworkItem { externalId: string; subjectExternalId: string; subjectName: string; title: string; description?: string; setDate: ISODate; dueDate: ISODate; status?: 'set' | 'submitted' | 'late' | 'missing' | 'marked'; markExternalId?: string }

// Behaviour and achievement events (merits, house points, demerits, detentions, praise notes).
// A teacher's remark tied to a lesson (by-eschools: a comment without a mark, «нет домашнего задания») is one too, with
// lessonExternalId and category 'lesson_comment'; it comes on Lesson.behaviour and is never a mark.
export interface BehaviourEvent { externalId: string; date: ISODate; points?: number; polarity: 'positive' | 'negative' | 'neutral'; category?: string; comment?: string; subjectExternalId?: string; authorExternalId?: string; lessonExternalId?: string }

// Attendance is not a mark. by-eschools derives it from lesson_mark.kind === 'ABSENT'; other systems have a separate register.
export interface Attendance {
  externalId: string; date: ISODate; lessonExternalId?: string; subjectExternalId?: string;
  status: 'absent' | 'late' | 'left_early' | 'present_other';   // present_other: present but noted (Poland "zwolniony" released, "u" excused-present)
  excused?: boolean;          // Poland usprawiedliwiona / nieusprawiedliwiona, US excused / unexcused; undefined when the system does not say
  minutes?: number; reason?: string; code?: string;             // code: the system's own symbol ("nb", "sp", "u", "T", "UNX")
}

export interface FinalMark {
  subjectExternalId: string | null; subjectName: string; termExternalId: string | null /* null = year */;
  raw: string; value: number | null; kind: Mark['kind'];
  role?: 'final' | 'current' | 'predicted' | 'proposed' | 'adjusted' | 'target' | 'thematic' | 'effort' | 'behaviour';
  // final: the official term or year mark. current: running grade a US/UK system computes. predicted / target: UK.
  // proposed: Poland's ocena przewidywana before the semester closes. adjusted: Ukraine's скоригована semester mark.
  // thematic: Ukraine's тематична, a summary mark after a topic block (label = topic, date = when given); semester finals derive from these.
  // effort, behaviour: separate dimensions (UK effort, Poland ocena z zachowania). Default 'final'.
  label?: string; date?: ISODate;                                   // for thematic and proposed marks
}
```

Everything that is not in these types stays in the raw response, which the collector stores anyway. If your system has something valuable that does not fit (for example behaviour marks or attendance minutes), open an issue; the model grows when two providers need the same thing.

## 5. Grading scales

The grading system is a property of the provider (and sometimes of a school year or a subject), never of the app. The UI contains no number that means anything about marks; every colour, average, filter, goal and chart is derived from a `GradingScale` object that the API sends with each student. The Belarusian `by-10` scale is one instance of the model and produces exactly the interface in `docs/mockups.html`; a different scale produces the same screens with different numbers.

### 5.1 The model

```ts
// packages/core/src/grading/types.ts

export type BandRole = 'critical' | 'low' | 'good' | 'top';   // fixed roles; colours in docs/tokens.json

export interface GradingScale {
  id: string;                         // 'by-10', 'ru-5', 'ua-12', 'de-1-6', 'cz-1-5', 'fr-20', 'us-letter', 'pct-100', 'pass-fail'
  nameKey: string;                    // i18n key, e.g. 'scale.by-10.name' (docs/i18n.md)
  kind: 'numeric' | 'letter' | 'ordinal' | 'percent' | 'points' | 'pass-fail';   // a year without marks has no scale at all (5.3)
  // 'ordinal': descriptor levels with an order but no arithmetic ("Working towards / Expected / Greater depth", 성취도 A–E,
  // 観点別 A/B/C). Averages are shown as the most common level or hidden (averaging.method = 'mode' | 'none').

  // Value space. For 'letter' the values are the mapped numbers below; for 'points' each mark
  // carries its own max and is normalised to percent before anything else happens.
  min: number; max: number; step: number;        // by-10: 1, 10, 1.   fr-20: 0, 20, 0.5.   pct: 0, 100, 1
  higherIsBetter: boolean;                       // de-1-6 and cz-1-5: false

  letters?: { label: string; value: number; fromPercent?: number }[];  // us-letter: A+ 4.3, A 4.0, A- 3.7 ... F 0; fromPercent maps percent cut-offs (A from 90) for percent-and-letter systems
  modifiers?: { plus: number; minus: number };   // Poland: 4+ = 4.5, 5- = 4.75 by default; schools configure it, the provider applies the school's value

  // Four quality bands over the value space, each a closed range in scale values (from <= to, whatever the direction).
  // A band may be empty: null (gb-primary has no low band). An average between two bands belongs to the worse one
  // until it reaches the better band's edge: on by-10, 6.5 is low and 8.5 is good.
  bands: Record<BandRole, { from: number; to: number; labelKey: string } | null>;   // labelKey is an i18n key

  // "Worse than X" quick filters and notification thresholds, in scale values, ordered from strictest.
  // by-10: [5, 7] ("ниже 5", "ниже 7"). de-1-6 (lower is better): [4, 3] ("хуже 4", "хуже 3").
  thresholds: number[];

  // Finals offered in the goal picker. by-10: [7, 8, 9]. ru-5: [4, 5]. us-letter: ['B', 'A'] as values.
  goalTargets: number[];

  // How a period average is computed and shown.
  averaging: {
    method: 'arithmetic' | 'weighted' | 'gpa' | 'mode' | 'none';   // weighted uses Mark.weight; gpa is arithmetic over letter values; mode for ordinal levels
    decimals: number;                            // by-10: 1 (8.3). us-letter: 2 (3.67). fr-20: 1
  };

  // How the official final mark for a term is derived from the marks. Used only for the goal projection.
  finalRule: 'round-half-up' | 'round-half-even' | 'floor' | 'ceil' | 'weighted-round' | 'teacher-decides' | 'unknown';
  yearRule: 'mean-of-term-finals' | 'mean-of-all-marks' | 'last-term' | 'weighted-terms' | 'teacher-decides' | 'unknown';   // how the year final relates to the terms; drives the italic year estimate in the Итоги tables (by-10: mean-of-term-finals)

  // Distribution chart buckets: 'each-value' for small integer scales, or a fixed bucket width.
  distribution: { mode: 'each-value' } | { mode: 'buckets'; width: number };
}
```

A scale is plain data, so the API sends it to the web app as JSON (`useScale(studentId)`) and the same object is validated with Zod (`gradingScale` in `packages/core/src/grading/types.ts`). Formatting is not part of the object: `formatValue(scale, v, locale)`, `formatAverage(scale, a, locale)`, `formatFinal(scale, v, locale)` and `formatBandRange(scale, role, locale)` in `grading/format.ts` go through `Intl`, so 8.3 reads "8,3" in Russian and "8.3" in English, and `null` is "—". The web app imports the same helpers from `@marksy/core`.

Helpers in `packages/core/src/grading/` wrap the object so nothing else has to think about direction:

```ts
bandOf(scale, value): BandRole | null           // which band a value (a mark or an average) falls in
markBand(scale, values[]): BandRole | null      // a chip's band: the band of its worst value ("7/9" is coloured by the 7)
compare(scale, a, b): -1 | 0 | 1                // 1 when a is better than b, respecting higherIsBetter
isWorseThan(scale, value, threshold): boolean   // for filters and notification rules
toQuality(scale, value): number                 // 0..1, best = 1; used to compare across different scales
scaleUnit(scale): number                        // one by-10 point scaled to the range: (max - min) / 9
trendTolerance(scale): number                   // 0.3 × scaleUnit: 0.3 on by-10
average(scale, marks): number | null            // arithmetic, weighted, GPA or mode per scale.averaging, rounded to its decimals
projectFinal(scale, average): number | null     // per finalRule, half rounds toward the better mark; null for 'teacher-decides' and 'unknown'
neededAverage(scale, final): number | null      // the average that still gives `final` (7.5 for an 8); null when finalRule cannot be inverted
targetPlan(scale, sum, count, need)             // the fewest marks of each value that reach `need`, best first ("2 × 9 или 1 × 10")
keepMark(scale, need, sum, count)               // the worst next mark that keeps `need`
marksNeeded(scale, sum, count, targetFinal)     // the goal card: projected, need, reached, plan, keep; null when the goal card is hidden
estimateYear(scale, termFinals[], marks[]): number | null   // per yearRule; the decimal shown in the Год cell until the year final is posted
boundaryLines(scale): number[]                  // sparkline reference lines: the edge into the low band and the edge into the top band
distributionBuckets(scale)                      // columns of the distribution chart
defaultFamilyRules(scale), isLowMark(scale, v, rules)   // the family's "what is low" (design.md 6.4), defaults from the scale
```

When `finalRule` is `teacher-decides` or `unknown`, `neededAverage` and `marksNeeded` return `null` and the goal card is hidden; nothing changes for `by-10`.

### 5.2 Built-in scales

`packages/core/src/grading/scales/` ships one file per scale. A provider references a scale by id in its manifest, or inlines a full object when its system is unusual. A scale your school needs can be proposed in an issue; each built-in scale comes with a unit test that pins its band table and a sample average.

| id | Kind | Range | Better | Bands (critical / low / good / top) | Thresholds | Goals | Final rule (assumed) |
|---|---|---|---|---|---|---|---|
| `by-10` | numeric | 1–10 | higher | 1–4 / 5–6 / 7–8 / 9–10 | 5, 7 | 7, 8, 9 | round half up |
| `ru-5` | numeric | 1–5 (2–5 in practice) | higher | 1–2 / 3 / 4 / 5 | 3, 4 | 4, 5 | round half up, weighted where the system weights marks |
| `ua-12` | numeric | 1–12 | higher | 1–3 / 4–6 / 7–9 / 10–12 | 4, 7 | 7, 9, 10 | round half up |
| `kz-5` | numeric | 2–5 | higher | 2 / 3 / 4 / 5 | 3, 4 | 4, 5 | round half up |
| `de-1-6` | numeric | 1–6 | lower | 5–6 / 4 / 2–3 / 1 | 4, 3 | 3, 2, 1 | round half up on the average, direction-aware |
| `cz-1-5` | numeric | 1–5 | lower | 4–5 / 3 / 2 / 1 | 4, 3 | 2, 1 | round half up |
| `fr-20` | numeric | 0–20, step 0.5 | higher | 0–7.5 / 8–9.5 / 10–13.5 / 14–20 | 8, 10 | 12, 14, 16 | arithmetic, no rounding |
| `us-letter` | letter | F–A+ mapped to 0–4.3 | higher | F–D / C / B / A | D+, C+ as values | B, A | GPA, teacher decides |
| `pct-100` | percent | 0–100 | higher | 0–49 / 50–64 / 65–84 / 85–100 | 50, 65 | 75, 85 | arithmetic |
| `pass-fail` | pass-fail | no values | n/a | fail → critical, pass → good; low and top empty | none | none | none |
| `gb-gcse-9-1` | numeric | 1–9 (U below) | higher | U–3 / 4 / 5–6 / 7–9 | 4, 5 | 5, 7, 9 | teacher decides (current / predicted grades come from the school) |
| `gb-primary` | ordinal | WTS / EXS / GDS | ordered | WTS → critical, (empty), EXS → good, GDS → top | none | EXS, GDS | none |
| `gb-effort-1-4` | numeric | 1–4 | lower | 4 / 3 / 2 / 1 | 3, 2 | 2, 1 | none (effort dimension) |
| `cn-100` | points | 0–100 (150 for some senior subjects via `maxPoints`) | higher | 0–59 / 60–74 / 75–89 / 90–100 | 60, 75 | 80, 90 | arithmetic; cohort rank shown when available |
| `jp-5` | numeric | 1–5 (評定) | higher | 1 / 2 / 3 / 4–5 | 2, 3 | 4, 5 | teacher decides from criteria |
| `jp-abc` | ordinal | C / B / A (観点別評価) | ordered | C → critical, (empty), B → good, A → top | none | B, A | none |
| `kr-achievement` | ordinal | E / D / C / B / A (성취도, 90/80/70/60 cut-offs over raw scores) | ordered | E–D / C / B / A | none | B, A | derived from raw score cut-offs |
| `kr-rank-9` | numeric | 9–1 (석차등급, 1 = top 4 %) | lower | 7–9 / 5–6 / 3–4 / 1–2 | 5, 3 | 3, 2, 1 | derived from percentile |
| `pl-1-6` | numeric, step 0.25 via modifiers | 1–6 (6 celujący) | higher | 1 / 2 / 3–4 / 5–6 | 2, 3 | 4, 5, 6 | weighted average with school cut-offs (commonly 4.75 → 5); teacher decides |
| `us-percent` | percent with letters | 0–100+, letters by `fromPercent` (A 90, B 80, C 70, D 60, F) | higher | 0–59 / 60–69 / 70–89 / 90–100 | 60, 70 | 80, 90 | weighted by course `gradingScheme`; letter by cut-off |
| `us-gpa-4` | letter | F–A+ as 0–4.3 (5.0 weighted for honors / AP via `Subject.level`) | higher | F–D / C / B / A | D+, C+ | B, A | GPA |
| `us-standards-1-4` | ordinal | 1 Beginning / 2 Developing / 3 Proficient / 4 Advanced, per standard | ordered | 1 → critical, 2 → low, 3 → good, 4 → top | none | 3, 4 | mode |
| `ua-12` (listed above) | numeric | 1–12, levels початковий / середній / достатній / високий | higher | 1–3 / 4–6 / 7–9 / 10–12 | 4, 7 | 7, 9, 10 | semester from thematic marks, teacher decides |

Bands for scales other than `by-10` are starting points taken from each country's official descriptors; the maintainer of the first provider on a scale confirms or adjusts them. Implemented today: `by-10`, `ru-5`, `ua-12`, `de-1-6` (the direction test) and `pct-100` (used by `demo-minimal`); the other rows are specifications that become files when their first provider arrives.

### 5.3 Where the scale is attached

- `provider.json` → `gradingScale` sets the default for every student on the provider.
- `student_years.grading_scale_id` records the scale per student per school year, filled from the provider at sync. A school that switches systems, or a child who changes schools, keeps correct history.
- `Mark.scaleId` is an optional override for a single mark when a system mixes scales within one student (a pass/fail subject inside a numeric school, points-based assignments next to letter grades). The provider's mapper sets it; the mapper is also where raw strings like `"7/9"`, `"A-"`, `"17/20"` or `"зач."` are parsed into `kind`, `values` and `weight`, because only the provider knows the notation.
- Comparing across years with different scales (section 6.1 of `design.md`) is done on `toQuality()` and the UI marks the row with "другая шкала" so nobody reads 4.0 (GPA) next to 8.3 (by-10) as a drop.
- Years without marks (Belarusian grades 1 and 2, narrative-assessment schools) have **no scale**: the provider returns `Calendar.gradingScaleId = null` for that student and year, it is stored as `student_years.grading_scale_id = null`, and `studentYearScale()` returns `null`. The no-marks mode of Главная, Предметы and Предмет is switched by this alone, never by a grade number, since the age at which marks start differs per country; knowing that a Belarusian first grader gets no marks is the provider's job. The UI hides averages and bands and leads with the schedule and homework, exactly as the first-grader screen in the prototype does.

### 5.4 What the scale drives in the UI

Every scale-dependent element, how it is derived, and what `by-10` yields (which is the current prototype, unchanged):

| UI element | Derived from | `by-10` result |
|---|---|---|
| Mark chip colour | `bandOf(scale, min(values))` | 3 red, 6 orange, 8 green, 10 filled green |
| Average and its colour | `average(scale, marks)`, `format.average`, `bandOf` | one decimal, same four colours |
| Overview distribution card | one column per band role with `bands[role].label`, plus absences | 1–4, 5–6, 7–8, 9–10 |
| Feed filter chips | one chip per `thresholds` entry, label "ниже X" or "хуже X" by direction | Ниже 5, Ниже 7 |
| Notification rule "below" | `isWorseThan(scale, value, threshold)` with the same thresholds | ниже 5 default on, ниже 7 off |
| Trend arrow | `compare(scale, current, previous)` with `trendTolerance(scale)`, 0.3 of a by-10 point scaled to the range (`0.3 × (max - min) / 9`) | 0.3 as today |
| Subject distribution chart | `distribution.mode` | ten bars, one per value |
| Sparkline reference lines | `boundaryLines(scale)` | dashed lines at 5 and 9 |
| Quarter goal picker | `goalTargets`, `format.final` | итог 7 / 8 / 9 |
| Projected final | `projectFinal(scale, average)` | rounded average, labelled as an assumption |
| Marks needed | `marksNeeded(scale, sum, count, target)` | "ещё 2 × 9 или 1 × 10" |
| Guidance thresholds | "low mark" = `bandOf` is critical; gaps between work types compared in scale units (1.0 on by-10 = 10 % of the range) | 4 and below; 1.0 |
| Quarter and year tables | `format.final` for finals, `format.average` in italics for running values | as today |
| Target calculator for letters | runs on mapped values, shows letters | n/a |

The prototype demonstrates this: `docs/mockups.html` is written against a `SCALE` object with exactly these fields, and the rail has a demo switcher (BY 10, RU 5, UA 12, DE 1–6 where 1 is best) that re-renders every screen on another scale: band columns, chip colours, filter chips, thresholds in notification rules, the goal picker, the needed-marks calculator, distribution bars, sparkline lines and trend arrows all follow the scale, including the reversed direction.

A snapshot test in `packages/core` locks this table for `by-10`: if a change to the scale model alters any of these outputs for the Belarusian scale, the test fails. That is the guarantee that generalising the model does not move anything for families already using it.

### 5.5 Rules for scale authors

- Keep the four roles. If a scale has fewer meaningful levels, leave a band empty rather than inventing a fifth role; the UI collapses empty columns.
- Thresholds and goal targets are scale values, not percentages, so that labels read naturally ("ниже 5", "unter 4", "below C"). The words around them come from the interface language, not from the scale.
- Do not encode a school's policy in the scale (for example "a 4 is failing in this school"). That belongs to the family's settings later, not to the scale shared by a whole country.
- `finalRule` is an assumption until verified against real finals; say so in the scale's test file and keep `unknown` when you do not know.

## 6. Authentication kinds

- **password** (most school systems): the family enters login and password once; Marksy verifies them through `login()`, encrypts them and reuses them for every sync.
- **token**: the user pastes a long-lived token or API key from the system's settings page. Same storage, no password.
- **oauth**: the system supports OAuth or OIDC. The provider declares `authorizeUrl`, `tokenUrl`, `scopes` in the manifest; the server runs the redirect flow and stores the refresh token encrypted. Not implemented until a provider needs it; the interface leaves room.
- **Two-factor** systems: if login needs a one-time code, `login()` may throw `NeedsSecondFactor` with a prompt; the UI asks the user and calls `login()` again with the code in `credentials`. Sessions should then be kept alive with `refresh()` (optional method) because the collector cannot ask for a code at 09:00.

## 7. Scheduling and politeness

The scheduler is generic and reads the provider's `limits`:

- hourly runs only during each child's school day (an hour before the first lesson to two hours after the last, from the child's timetable and bells; `syncWindow` only when the day's times are unknown), with a random offset; scope: the current week, the next week when the provider has `futureTimetable` (the homework set ahead, read before the weekend) and the previous week, then whatever was missed since the last success, plus final marks once a day (`design.md` 10.4);
- inside those school-day runs, every week of the current term that was not fetched for six days, for change detection (no evening slot: a provider has nothing to configure for it);
- the collector asks for one `fetchUnit` at a time (a week, or the whole term for `term` providers) and counts each as verified only when it was stored completely; the run stops at `maxRequestsPerRun` and the rest waits for the next run;
- never more than one `login()` per `minLoginIntervalMinutes` per account, shared by scheduled, manual and re-scan runs;
- a child listed by several accounts (two parents' logins, possibly in two families) is read through one of them only; the others call `getAccount()` once a school day to confirm they still show the child;
- strictly serial requests, `requestDelayMs` between them, exponential backoff on 429 / 5xx / network errors, stop after three failures until the next slot;
- the shared HTTP client refuses any request that does not match `readOnlyAllowList`;
- the collector keeps every read response for 14 days (`raw_responses`, named by the allow-list entry it matched, so no ids in the name); the login response, and every response that arrives while `login()` runs, is never kept; `redactRaw()` drops the personal fields the mapper does not use before a body is stored.

If your system publishes a rate limit or terms of use, put them in the manifest and in your README. Be more conservative than the limit, not less.

## 8. Fixtures and the conformance test

Each provider ships `fixtures/` with one sanitised raw response per endpoint (`<name>.json`), `fixtures/denylist.json`, and `fixtures/expected/canonical.json` with the canonical objects the provider must produce from them. Requests are routed to fixtures by a table, in code or in `fixtures/routes.json`; a route may include query parameters (`GET /lessons?week=w1`) when one path serves several fixtures. `sanitize()` is what produces the fixtures from real responses; a provider's probe (`pnpm probe --provider <id>`, a `probe` script in the provider's package; `providers/by-eschools/scripts/probe.ts` is the reference) logs in once, calls every read endpoint once, keeps the raw responses in the gitignored `data/probe/`, writes the sanitised fixtures and `routes.json` only when nothing of the raw ids, names and texts survived, and prints counts and what still needs a real sample, never personal data. Only the owner of the account runs it. A real probe replaces the regular fixtures (the top-level `<name>.json` files and `routes.json`); `--offline` replays a saved run and checks the schemas, `sanitize()` and drift without writing any, unless `--write-fixtures` is given.

**Cases.** A rare response shape met in a real response (a drift event, a value seen once) is kept as its own sanitised fixture in `fixtures/cases/<what-it-is>.json` (`lesson-mark-comment-only.json`): `{about, seen, endpoint, apiSpec, response, expect}`, where `response` is the smallest sanitised piece of the real response that shows the shape (one day with the one slot) and `expect` what the mapping must make of it. No probe ever writes or removes a case, so a shape seen once stays tested after newer weeks have replaced the regular fixtures. The provider's case test (`providers/by-eschools/src/cases.test.ts`) maps every case and compares the result with `expect` (no drift included); the conformance suite holds cases to the denylist and checks that `sanitize()` leaves them unchanged.

The suite lives in `@marksy/core/conformance`. A provider calls it from its own test file with its provider object, its fixtures folder and a route table (`"GET /api/children/*/grades": "grades"`, first match wins), and `pnpm test:provider <id>` runs it. The fixtures are served through the real throttled client with a fixture transport, so the allow-list, the single login and the request budget are exercised exactly as in a collector run. It checks that:

- the manifest validates against the schema and the grading scale resolves;
- every method the capabilities promise exists (`lessons` needs `getLessons`, `marksPerLesson: 'none'` needs `getMarks`, and so on);
- every method returns objects that pass the canonical Zod schemas, every request matched `readOnlyAllowList`, and a full read made exactly one request to `auth.loginRequest`;
- ids are stable and unique per student and kind: mapping the same fixtures twice gives the same `externalId`s;
- marks parse: every numeric mark has `values` within the student's scale, every other kind has none, and a year without marks has no numeric marks;
- the provider tolerates unknown fields (every object in every fixture gets an extra key and the canonical output must not change);
- sanitising works: no fixture contains a string or matches a pattern in `fixtures/denylist.json` (`{"strings": [...], "patterns": [...]}`, for example e-mail addresses and long ids), `sanitize()` leaves an already sanitised fixture unchanged, at least one fictional unsanitised sample exists in `fixtures/unsanitised/` and contains denylisted values, and `sanitize()` removes every one of them and changes or drops every string in the sample except under the keys listed in the denylist's `"keep"` (a class label, a type code) (not `fixtures/raw/`: `raw/` is gitignored because it holds real responses on the maintainer's machine). `fixtures/expected/canonical.json` is scanned against the denylist too, and `fixtures/` may have no subfolders besides `expected/`, `unsanitised/`, `cases/` and the ignored `raw/`;
- the output equals `fixtures/expected/canonical.json`. `MARKSY_UPDATE_EXPECTED=1 pnpm test:provider <id>` rewrites that file, and refuses to while any fixture or the output carries something on the denylist; review the diff before committing it.

## 9. How to add a provider, step by step

1. In your copy of the repository: `cp -r providers/_template providers/<id>`.
2. Fill in `provider.json`. Pick or define the grading scale.
3. Open the diary in a browser with the network tab open and write down the requests the official site makes: login, who am I, calendar, lessons, marks. Put what you learn in `providers/<id>/README.md` with a verification status per field, the way `docs/api-spec.md` does for Belarus.
4. Write Zod schemas with `.passthrough()` in `schemas.ts`, the mapper in `map.ts`, and the interface in `index.ts` using only `ctx.http`.
5. Implement `sanitize()` and run `pnpm probe --provider <id>` against your own account. Commit the sanitised fixtures only. Check them twice for names.
6. Run `pnpm test:provider <id>` until it is green.
7. Add the provider to `packages/registry/src/index.ts`, set `"status": "beta"`, add yourself to `maintainers`. Keep the README, the fixtures and a short note on the system's terms of use with it. Marksy itself does not take pull requests; if the provider would help other families, describe it in an issue.
8. After a few families used it for a term without drift events, `status` becomes `stable`.

Everything in the UI works at once: averages, bands, filters, goals, guidance, schedule, notifications and family. If something in your system does not map, say so in the README (`capabilities` with `false` make the UI hide the feature gracefully).

## 10. What is universal and what is Belarusian: the audit

The first provider shaped the first model, so every e-schools concept was re-examined: is it something every school has, something most have in a different form, or something particular to Belarus or to e-schools? The verdict decides where it lives (core, optional with a capability flag, or inside `providers/by-eschools` only) and what the interface does when a provider does not have it. Nothing changes for by-eschools: all its capabilities are on, so the Belarusian interface stays exactly as designed.

| e-schools concept | Verdict | Canonical form | Interface without it |
|---|---|---|---|
| Parent login that sees several children | Common, not universal (some systems have one login per child, some have no parent accounts) | `AccountInfo.students[]`, 1..n; a family may link several diary accounts | Nothing changes; a family with one account per child links several |
| JWT, 2-hour tokens, `Authorization: <raw>` | e-schools only | Hidden in the provider | n/a |
| School, class `7Д`, grade `level` | Universal (a student belongs to a school and a year group) | `StudentRef.className?`, `grade?` | Header shows the name only |
| School year with dates | Universal | `Calendar.schoolYear` | n/a (required) |
| Four quarters plus holidays | Belarus and the post-Soviet systems; elsewhere trimesters, semesters, or no formal terms | `Term.kind`, `capabilities.terms` | Period presets week / 2 weeks / month always exist; the fourth preset and the Subjects table are named after the term kind ("Триместры", "Семестры"); with `terms: none` both disappear and the quarter goal becomes a year goal or is hidden when there are no finals either |
| 36 numbered school weeks with uuids | e-schools API chunking | Not in the model; providers chunk ranges as they like | n/a |
| Six-day week, Mon to Sat | Belarus (many schools); most countries five days | Derived from the data | The schedule shows the days that have lessons; "next school day" skips days without lessons |
| Lessons with slot number, start time, topic, homework, attachments, substitution | Universal in structure, optional in detail | `Lesson` with every detail optional; `capabilities.lessons`, `futureTimetable`, `topics`, `homework`, `attachments` | No lessons at all: the Расписание tab is hidden (when no child the user sees has lessons; otherwise the tab stays and says so for this child), marks are listed by date in the feed and in the subject, tags have nothing to match and the Теги screen is hidden. No future timetable: "tomorrow" and "Обратить внимание" are hidden, watch rules work on homework already seen. No topics or homework: those lines are not rendered; watch rules search only the fields that exist |
| Lesson type (test, lab, practical, excursion) | Common in post-Soviet systems; rare elsewhere | `Lesson.lessonType?`, `capabilities.lessonTypes` | No badges; the tag preset "Контрольная" relies on keywords only; "test tomorrow" hints come from work types or tags instead |
| Exactly one `lesson_mark` per lesson, tied to the lesson | e-schools. Others: several marks per lesson, or a gradebook of assignments with dates and no lessons | `Lesson.marks[]` 0..n, plus `getMarks()` for unattached marks with `date` and subject; `capabilities.marksPerLesson`, `unattachedMarks` | Feed, averages, subjects and goals work on marks by date; the lesson card shows several chips; unattached marks appear in the feed and the subject but not in the schedule |
| Mark kinds SINGLE, DOUBLE ("7/9"), PASS, EXEMPT, MASTERED, NOT_TAKEN | DOUBLE is Belarusian; pass/exempt exist widely under other names | `Mark.values[]` carries any number of values; `kind` is a small canonical set, everything else is `other` with `raw` shown | Chips show `raw`; non-numeric kinds are excluded from averages everywhere |
| ABSENT as a mark kind ("н" in the mark cell) | e-schools. Most systems have an attendance register with absent / late / excused | `Attendance` records, separate from marks; `capabilities.attendance: separate / derived / none` | `none`: the absences column and tile, the absence filter, the absence hint and the absence notification are hidden. `separate`: late and excused appear as their own chips in the feed |
| Work type on a mark (13 values: classwork, homework, test, dictation, essay...) | Common in post-Soviet systems; elsewhere assignment categories, weights, or nothing | `Mark.workType?` canonical set + `workTypeRaw`; `capabilities.workTypes` | Filters "Контрольные" and "Домашние" are hidden; the hints "homework is the weak spot" and "tests go worse" are disabled; "tests only" uses lesson types when those exist; the row shows `workTypeRaw` or nothing |
| Teacher comment on a mark | Common, not universal | `Mark.comment?`, `capabilities.comments` | No comment icon, no "разобрать: …" hint; the low-mark hint still appears without the quote |
| Mark author (teacher uuid), teacher name by separate call | Optional everywhere | `authorExternalId?`, `teacherName?`, `capabilities.teacherNames` | Teacher line not rendered |
| Weighted marks | Not in e-schools; common in US and Western European gradebooks | `Mark.weight?`, scale `averaging.method = weighted`, `capabilities.weights` | Plain arithmetic average |
| Points out of a maximum ("17/20") | Not in e-schools; common elsewhere | `Mark.maxPoints?`, scale kind `points` normalises | n/a for by-eschools |
| Final marks per quarter and year (`final/whole`) | Common, shape varies; some systems compute a live grade instead | `FinalMark[]` optional; `capabilities.finalMarks` | Quarter and year tables show running averages only, labelled as such; the goal card is hidden (no official final to aim at), the target calculator still works on averages |
| 10-point scale, marks below 4 highlighted | Belarus | `GradingScale by-10` (section 5) | Another scale, same screens |
| Grades 1 and 2 without marks | Belarus (and several other countries have unmarked early years) | `student_years.grading_scale_id = none` | The first-grader screens: schedule and homework first, no averages |
| Rooms, the student's subgroup, teachers, bell times, a regular weekly timetable, lessons per week, level of study | Universal in idea: UK sets and Week A/B timetables, US sections and periods, Polish groups and "sala", post-Soviet подгруппы and углублённый уровень | `Lesson.room?`, `groupLabel?`, `teacherName?`, `endTime?`; `Subject.groupLabel?`, `teacherName?`, `level?` + `levelLabel?`, `lessonsPerWeek?`; `getBellSchedule()`, `getWeekTemplate()`; `capabilities.rooms`, `teachingGroups`, `teacherNames`, `bellSchedule`, `weekTemplate` | Each detail is simply not shown: no room, no group, no teacher; without bells there is no "сейчас" and no breaks, end times only when lessons carry them; without a week template the subject shows no lessons per week and no «Когда» |
| Shifts (смены), separate bells for grade 1, a school-wide room list, the class timetable with every subgroup, grade-specific holiday dates written as prose | e-schools | Inside the provider: it picks the student's bells, resolves rooms and the student's group, applies the holidays it can (ADDITIONAL_HOLIDAYS for grades 1 and 2) and passes other remarks as `note` | n/a |
| Behaviour marks, diary signatures, class-teacher messages | e-schools extras | Out of scope; signatures are write endpoints and forbidden | n/a. Class messages may become an "announcements" capability when a second provider has them |
| Timestamps in ms, Europe/Minsk | Provider | Mapped to ISO dates; timezone from the manifest | n/a |
| Russian and Belarusian subject names, "вывучыць верш на памяць" in homework | Data, not model | Shown as the diary sends them; tag presets per interface language | Presets for the family's language; keywords are editable |
| Homework shown on the lesson it was set at, due at the next lesson | e-schools convention | `homeworkSemantics` in the manifest, `homeworkDueDate` when known | Due dates follow the manifest |

### Beyond the post-Soviet model: the United Kingdom

There is no national diary in the UK. Schools run a management system (SIMS, Arbor, Bromcom) and expose data through parent apps (Arbor, ClassCharts, Satchel One / Show My Homework, SchoolCloud, MCAS). A UK provider is therefore per vendor (`gb-arbor`, `gb-classcharts`) or per school, with `scope: regional` or `school`. What the UK brings that the Belarusian model lacked, now in the canonical types:

| UK practice | Model |
|---|---|
| Primary assessment by descriptors (Working towards / Expected standard / Greater depth), no numbers | `GradingScale.kind = 'ordinal'`, scale `gb-primary`, averaging `mode` or `none` |
| Secondary GCSE grades 9 to 1, with **current**, **predicted** and **target** grades per subject on termly reports | `FinalMark.role` (`final`, `current`, `predicted`, `target`), capability `targets`; the subject hero shows "target 7 · predicted 6 · current 6" when present |
| Effort or attitude-to-learning scores (1 to 4) beside attainment | `Mark.dimension = 'effort'`, separate scale `gb-effort-1-4`, capability `criteria`; never mixed into attainment averages |
| Homework set in a separate system with set and due dates and submission status | `HomeworkItem`, capability `homeworkAssignments`; tags and the schedule use real due dates |
| Behaviour and achievement points (merits, house points, demerits, detentions) | `BehaviourEvent`, capability `behaviour`; an optional Поведение card on Overview and a feed item type |
| Teacher's remark on a lesson without a mark (by-eschools: a comment with no mark) | `BehaviourEvent` with `lessonExternalId` on `Lesson.behaviour`, `behaviour: 'derived'`; shown with the lesson, never as a mark (ux-principles D56) |
| Attendance as a percentage with lates and authorised / unauthorised absences | `Attendance` with `status` and `reason`; percentage derived |
| Three terms with half-terms | `Term.kind = 'other'` with labels, or six terms; reports per term |

### Beyond the post-Soviet model: China, Japan, South Korea

East Asian systems are exam-centric and cohort-relative: the number that matters is often not the mark itself but where it sits in the class.

| Practice | Where | Model |
|---|---|---|
| Scores out of 100 (150 for Chinese, maths, English in senior high) per named exam: monthly test, midterm (期中), final (期末) | CN | `Mark.maxPoints`, `title`, `assessmentType = 'exam'`, scale `cn-100`, capability `exams` |
| Class rank, grade rank, class average per exam, published to parents through school apps (智学网, 钉钉家校) | CN | `Mark.cohort { rank, size, average, percentile }`, capability `cohortStats` |
| 5-level 評定 on the report card (通知表) per term, plus 観点別評価 A / B / C on three criteria (知識・技能, 思考・判断・表現, 主体的に学習に取り組む態度) | JP | `FinalMark` on scale `jp-5`; one `FinalMark` per `criterion` on scale `jp-abc`; capability `criteria` |
| Exam scores with class average and 偏差値 (deviation score) for mock exams | JP | `Mark.cohort { average, sd }`; deviation score derived as `50 + 10 × (x - mean) / sd` when `sd` is present, shown only with `cohortStats` |
| Three terms (学期) or two semesters depending on the school | JP | `Term.kind = 'trimester'` or `'semester'` |
| Middle school 성취도 A to E by fixed cut-offs (90 / 80 / 70 / 60) over raw scores, with subject mean and standard deviation | KR | raw score on `cn-100`-like `points`, level on `kr-achievement` (ordinal), `cohort { average, sd }` |
| High school 석차등급 1 to 9 by percentile (1 = top 4 %) | KR | scale `kr-rank-9`, lower is better, derived from `cohort.percentile` |
| 수행평가 performance assessments beside written exams | KR | `assessmentType = 'performance'` |
| Two semesters, each with midterm and final | KR | `Term.kind = 'semester'`; exams as tag presets |
| Parent access through 나이스 학부모서비스 and class apps (하이클래스, 클래스팅) | KR | providers per system |

What this changes in the interface, all behind capabilities: a mark chip can carry a cohort line ("85 · class average 72 · rank 5 of 32"); the subject hero can show rank and deviation score trends; the quarter table becomes an exam table when `exams` is on; ordinal scales render levels instead of numbers and hide averages; `targets` adds the target / predicted / current row; `behaviour` adds a card and a feed item type. None of these surfaces exists for `by-eschools`, and none of them is special-cased: each reads a capability and the scale.

### Beyond the post-Soviet model: United States, Poland, Ukraine

**United States.** No national system; districts run PowerSchool, Infinite Campus, Skyward, Aeries or Synergy, with assignments in Schoology, Canvas or Google Classroom. A provider is per vendor (`us-powerschool`) and the family picks the district instance (`tenant.kind = 'url'` or `'code'`), stored in `diary_accounts.tenant`. What the US adds:

| US practice | Model |
|---|---|
| Points per assignment (12/15), extra credit above the maximum | `Mark.maxPoints`, values above max allowed; scale `us-percent` |
| Category weights per course (Tests 40 %, Homework 20 %), drop-lowest | `Subject.gradingScheme`; `averaging.method = 'weighted'` uses it |
| Missing (counts as zero), excused (does not count), late, not yet due | `Mark.status`; averages follow the status |
| Letter grade per course from percent cut-offs that differ by district | `GradingScale.letters[].fromPercent`, scale inlined per tenant when the district differs |
| GPA 4.0, weighted 5.0 for Honors and AP | scale `us-gpa-4`, `Subject.level`, `Subject.credits` |
| Quarter, semester and progress-report "current grade" | `Term.kind`, `FinalMark.role = 'current'` |
| Standards-based report cards in elementary (1 to 4 per standard) | `criterion` + ordinal scale `us-standards-1-4` |
| Gradebook without lessons; period schedule separate; grades posted long after the due date | `unattachedMarks`, `homeworkAssignments`, `Mark.postedAt` (the feed sorts by `postedAt` when present so "new" means newly posted) |
| Attendance per period with codes (tardy, excused, unexcused) | `Attendance.code`, `excused` |
| Behaviour referrals and positive notes | `BehaviourEvent` |
| Grade labels K to 12 | `StudentRef.gradeLabel` |

**Poland.** Librus Synergia (national SaaS, per-school login code), Vulcan UONET+ (per region), MobiDziennik, iDziennik: vendor providers with `tenant`. What Poland adds:

| Polish practice | Model |
|---|---|
| Scale 1 to 6 with pluses and minuses ("4+", "5-"), converted with a school-configured value | scale `pl-1-6` with `modifiers`; `Mark.modifier`, `raw` keeps "4+" |
| Every mark has a weight (waga 1 to 10) and a category (sprawdzian, kartkówka, odpowiedź, aktywność, zadanie domowe) | `Mark.weight`, `workType` / `workTypeRaw`; weighted average is the default display |
| "np" (unprepared), "bz" (no homework), "0", "+" / "-" activity marks | `kind = 'other'` with `raw`, shown as chips, excluded from averages |
| Proposed semester grade (ocena przewidywana), semester (śródroczna) and year (roczna) finals | `FinalMark.role = 'proposed' / 'final'`, two semesters |
| Behaviour grade (ocena z zachowania: wzorowe … naganne) | `FinalMark.role = 'behaviour'` on an ordinal scale `pl-behaviour` |
| Uwagi (positive / negative notes) and points | `BehaviourEvent` |
| Attendance: obecność, nieobecność usprawiedliwiona / nieusprawiedliwiona, spóźnienie, zwolnienie | `Attendance.status`, `excused`, `code` |
| Terminarz: announced tests and events in a calendar; zadania domowe module with due dates; zastępstwa | `lessonType = 'test'` on the lesson or `HomeworkItem`, tags; `Lesson.substituteTeacherName?` |

**Ukraine.** Multi-vendor and per school: Нові знання (nz.ua), Єдина школа, Human, Мій клас, Класна оцінка; `tenant` per school. What Ukraine adds beyond the Belarusian model (which it otherwise resembles closely):

| Ukrainian practice | Model |
|---|---|
| 12-point scale with four levels | scale `ua-12`, bands match the levels |
| Тематична оцінка: a summary mark after each topic block; the semester mark is derived from thematic marks, not from all current marks | `FinalMark.role = 'thematic'` with `label` (topic) and `date`; the semester projection uses thematic marks when the provider has them (`finalRule = 'teacher-decides'` with thematic input) |
| Скоригована semester mark after an appeal or retake | `FinalMark.role = 'adjusted'` |
| Semesters I and II, year | `Term.kind = 'semester'` |
| "н" in the mark cell, "зарах." / "не зарах.", "звільнений" | derived attendance, pass / fail, exempt (as in Belarus) |
| Formative verbal assessment in grades 1 to 4 (НУШ) with levels | `student_years.grading_scale_id = null` (no marks) or an ordinal scale, per school |
| Distance-learning links and files on lessons | `hasAttachments`, attachments capability |

The three countries also share two things the first model lacked and now has: **multi-tenant providers** (one vendor, many schools or districts, chosen at connect time) and **status-bearing marks** (missing, excused, proposed), which the feed shows as their own chip styles and which never silently enter an average.

### Calendar, names and the rest of the "still not universal" list

The remaining assumptions found in the screen audit are now part of the model rather than open items:

| Assumption | Now |
|---|---|
| Week starts on Monday, weekend is Saturday and Sunday | `manifest.calendar { weekStart, weekend, schoolDays }`, falling back to the user's locale. `period.ts` builds the week and 2-week presets from `weekStart`; "next school day" skips `weekend` and days without lessons; tag advice says "в выходные" only for the provider's weekend |
| One `fullName`, given name first | `givenName / familyName / displayName` on `StudentRef`, `manifest.nameOrder`; the UI shows `displayName` in headers and notifications and `fullName` in Family |
| A student belongs to one family | A child is not owned by a family. The connect flow looks up `(provider_id, student external id)` across the installation: a child already followed by another family (the other parent connected their own login) is offered to the second parent as **join that family as a parent** (a request the admin approves) or **follow from your own family**; the second shares the one child, the child's diary and own work, and nothing else of either family. Access always comes from a diary login that shows the child (`design.md` 7.1, 7.2) |
| A family uses one diary system | A family connects as many accounts as it needs, on any providers; capabilities, scale, calendar, bells and the sync window are the selected child's, so two children in different systems each get the interface their diary allows (`design.md` 16) |
| Student mode assumes a reader | `users.ui_mode: full / simple`; simple mode for the youngest shows today's marks as big chips, "не забыть" with ticks and tomorrow's lessons with homework checkboxes, nothing else (`design.md` 5.7) |
| Guidance is one culture's common sense | `families.settings.guidance` and `users.settings.guidance`: off hides goals, Что сделать, Обратить внимание and lesson hints; facts (marks, attention, watch items) stay |
| No data-protection rules | `design.md` 14.1: consent record on connect, retention setting, family export and erasure, per-family encryption keys for hosted instances |
| Universality is a claim | `providers/demo-minimal`: a fixture-only provider with no network, five-day week starting Sunday, gradebook without lessons, no work types, comments, attendance, terms or finals, on a 100-point scale. The conformance suite and the UI snapshot tests run against it in CI, so every change is checked against the thinnest system as well as the richest |

### What this means for the code

- Every optional thing above is a **capability** in the manifest and is exposed to the web app per student (`GET /api/auth/me` returns `students[].capabilities`). Components check it through one hook, `useCapabilities(studentId)`, the same way they check the grading scale. A component never checks the provider id.
- A capability that is off hides the element or switches to the fallback in the table; it never shows an empty column or a dash where the system simply has no such concept.
- The canonical model keeps e-schools' richness (lesson types, work types, comments, double marks, derived attendance) as optional fields, so by-eschools loses nothing.
- Guidance and tags declare which capabilities each rule needs (`requires: ['workTypes']`); a rule whose requirements are not met is skipped silently.
- The prototype demonstrates the capability layer: its rail has toggles for schedule, future timetable, lesson types, work types, comments, attendance, terms and finals; switching one off removes or adapts every dependent element on every screen (the schedule tab, the fourth period preset, the quarters mode, the absences column, filters, hints, notification rules, the goal card), with the Belarusian interface as the all-on state.
- The conformance test runs a provider with the minimum capability set (lessons off, work types off, comments off, attendance none, terms none, finals off) through the same UI snapshot to prove the app still renders a sensible overview, feed and subject screen from marks by date alone.

## 11. What stays out of providers

Keep the layer thin. These belong to the core or the server, not to a provider: averages and bands, trends and comparisons, guidance rules, change detection, scheduling, encryption, notifications, family and access control, the UI. A provider that needs to special-case any of these is a signal that the canonical model or the manifest needs a field; open an issue instead of working around it.

## 12. Maintenance

A provider has at least one maintainer with an account on the system. The server records `api_drift_events` per provider; when the official site changes, the maintainer gets the sanitised sample through the normal notification channel and updates schemas and fixtures. A provider with unresolved drift for a term is marked `broken` in the registry so new families are warned before connecting.
