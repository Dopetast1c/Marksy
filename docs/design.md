# Marksy: Product and Technical Design

Companion to `docs/ux-principles.md` (why the interface is the way it is, decision log, what may change), `docs/api-spec.md` (the e-schools.by API) and `docs/mockups.html` (clickable prototype). This document says what Marksy is, who uses it, what the screens are, how data is modelled and how the API looks. Edit it in place when a decision changes.

## 1. Decisions in one place

| Area | Decision |
|---|---|
| Product | Mobile-first PWA for one family first; multi-family (friends) from day one in the data model, not in the UI |
| Architecture | Two layers. The product (UI, API, collector, guidance, notifications) works on a canonical model and is country-agnostic. A **provider** is the only code that knows a specific diary system; Belarus's `by-eschools` is the first. Anyone can add a country, region or school by writing one provider against the contract in `docs/providers.md` |
| Capabilities | Lesson types, work types, teacher comments, attendance, terms, final marks, homework, topics and a future timetable are optional features of a diary system, not of Marksy. Each is a flag in the provider manifest; the interface hides or adapts every element that depends on a missing one (`docs/providers.md` section 10). All flags are on for `by-eschools`, so the Belarusian interface is the full one |
| Grading | The grading system belongs to the provider, not to the app. Each provider names a `GradingScale` (range, direction, four band ranges, thresholds, goal targets, averaging, final rule, formatting); the UI derives every mark-related number and colour from it (`docs/providers.md` section 5). `by-10` reproduces the current interface exactly, and a snapshot test keeps it that way |
| Roles | `admin` (the parent who connected the first diary) manages the family; `parent` sees all children the family follows and switches between them; `student` sees only themself. Roles are per family: one person has one login and may be a member of several families (`memberships`) |
| Accounts | Marksy users are separate from diary accounts and from families. A family connects one or more diary accounts, on any providers, so children of one family can go to different schools in different systems; each child carries its own provider, capabilities, scale, calendar and bells. A child can be followed by several families (parents who live apart): the child's diary and the child's own work exist once and are shared, everything else stays in each family (section 7.1, ux-principles D53, D54). Each family member (second parent, each child) gets their own Marksy login through an invite code and sees only what the admin assigned |
| Sync cadence | Only on each child's school days and only during that child's school day: from an hour before the first lesson to two hours after the last, read from the child's own timetable and bells (the manifest's window only when the day's times are unknown); nothing in the evening, at weekends or in the child's holidays. Each run shifted by a random 0 to 20 minutes and random seconds. A child is collected once, through one of the diary logins that see them. Never more than one diary login per hour per account, manual refresh included; only a developer's command-line runs in development mode may log in every 10 minutes (10.2, ux-principles D55, D57) |
| History | Marks are kept forever and the past is re-checked: a weekly full re-scan of the current quarter (default Friday 20:00 to 23:00, jittered) detects changed and removed marks; manual re-scan by student and period from the app |
| API drift | Every e-schools response is validated against a schema that allows unknown fields; new fields, missing fields, new enum values and new error shapes are logged, stored and pushed to the admin so support can be added quickly |
| Core views | Overview (what matters now), Marks feed (week / month / quarter / year, any past instance, calendar-aligned), Finals (quarter table, year table), Subjects (period list), Subject detail, Schedule and homework, Notifications |
| Comparisons | One rule everywhere: current value versus the previous calendar unit of the same kind (week, month, quarter, school year), with arrow, previous value and delta. Years before Marksy can be entered by hand |
| Notifications | Web Push from the PWA and a Telegram bot. Rules: any new mark, mark below a threshold, absence, evening homework digest, weekly summary |
| Stack | TypeScript everywhere. Backend: Node.js 22, Express 5, Drizzle ORM, PostgreSQL 16 in Docker. Frontend: React 19 + Vite, Tailwind driven by `docs/tokens.json`. Tests: Vitest (units), Supertest (API). OpenAPI 3.1 served as Swagger UI at `/api/docs` |
| Collector | Lives in the same backend as a scheduled job (node-cron); generic over providers. Limits (login interval, delays, window, allow-list, region hint) come from the provider manifest and are enforced by the shared HTTP client, never by provider code |
| Interface language | Twelve languages at launch (Russian, Belarusian, Ukrainian, Kazakh, English, Polish, German, Spanish, Portuguese, French, Dutch, Romanian), per user, independent of the diary system; `en.json` is the source of truth, adding a language is one JSON file (`docs/i18n.md`) |
| Mark semantics | 10-point scale, four bands: 1 to 4 critical (red), 5 to 6 low (orange), 7 to 8 good (green), 9 to 10 top (filled deep green, exceptional). Only `SINGLE` and `DOUBLE` marks count towards averages |
| Rules, not constants | The provider says what exists, the scale says how marks look and compare, the family's rules say what matters: alert thresholds, what counts as a low mark or a drop, lead times, the family's tags. Defaults come from the scale; everything is editable (section 6.4) |
| Tags | Families define their own vocabulary for kinds of work (a poem to learn by heart, a test known only from the topic, something to bring) as **tags**: keywords in topic or homework, an icon, a tone, how many days it takes to prepare. Tags mark lessons in the schedule, on Overview and in the subject (section 6.3). Notifications are separate rules that reference tags and choose the moments (section 11) |
| Shared components | The same information is rendered by the same component everywhere (StatBlock, MarkChip, SubjectRow, HintRow, LessonRow). No screen re-implements a block that exists on another screen |
| Guidance | The app does not only report; it suggests. A small rule engine (section 6.2) turns facts into hints with a reason: on the subject screen ("Обратить внимание", quarter goal), in the schedule (per-lesson hints and "Обратить внимание" for the day), on Overview (Внимание) and in notifications |
| Navigation | A subject name is a link everywhere it appears (overview, feed, schedule, tables, notifications); it opens the subject detail with the current period and student, and Back returns to the exact place |

## 2. Users and what they need

### Family (tenant)

A **family** is a household: its members (Marksy users), the diary accounts it connected, the children it follows, and its own settings, tags, rules and notifications. Family-owned data is scoped by `family_id` and is never visible to another family. The **child** (`students`) is not owned by a family: the child's diary data and the child's own work (ticks, study time, homework added by hand, cancelled lessons, subject colours and goals, avatar) belong to the child and are reached through `family_students`. Usually one family follows a child; when parents live apart, two families can follow the same child, each through its own diary login, and share only what belongs to the child (7.1, ux-principles D54). Children of one family may go to different schools on different providers; each child carries its own provider, capabilities, scale, calendar and bells (D53).

The typical shape of a family: one e-schools parent login, used by the collector; several Marksy users (two parents, each child), each with their own Marksy login, so a child never knows the e-schools password and a parent's notification settings are their own. The admin creates the family by connecting the diary, then invites the others with a code.

### Parent

Checks the phone two or three times a week, often in the evening. Wants to know, in under a minute:

1. Is anything new today, and is anything bad (a mark of 4 or lower, an absence, a test coming)?
2. How is each subject going this quarter (average, direction)?
3. What happened in one subject (the marks, for what work, the teacher's comment)?
4. What is set for tomorrow (homework), especially for the grade 1 child who has no marks.

Needs a student switcher, notifications, and the ability to see the quarter that just ended next to the current one.

### Student (grade 7 today)

Opens the app after school. Wants:

1. "What did I get today" and "what is my average in X".
2. "What do I need to get to reach an 8 average" (target calculator).
3. Homework for tomorrow, with the lesson topic.
4. A quarter view that looks like a report card.

Does not see other students, cannot change notification settings for the parents, cannot trigger a sync.

### Not in v1 but shaped for

- Several families (friends): the same connect-diary flow creates their own family; nothing else is needed in the data model. What is missing is only polish (family name, admin hand-over, deleting a family with all its data).
- Goals per subject with progress; streaks for the child.
- Comparison with class average (not available in the API today).

## 3. Scope

### v1 (build first)

- Connect the diary with e-schools credentials (creates the family and the admin), Marksy login for members, invites with codes, family management (members, roles, student access), sessions, logout.
- Overview per student and period: metrics with comparison to the previous period, movers, last school day's marks, attention list, next school day.
- Subjects tab with three modes: period list with trends, quarter table, year table; manual entry of past year-final marks; subject links across years.
- Marks feed with period kinds (week, month, quarter, year), a navigator to any past instance, and filters (subject, work type, below N). Grouped by day.
- Subject detail: average, distribution, timeline of marks with topic, work type, comment; quarter final mark when available; target calculator.
- Lessons: today / tomorrow / week with homework and topic. Works for grade 1 (no marks).
- Notifications: Web Push subscription, Telegram linking, rules, quiet hours.
- Study time: a timer per lesson or subject, estimates from "готово" ticks, the Занятия screen with time per day and per subject (6.7).
- More: students and linked accounts, sync status with last and next run, appearance (Оформление), logout.
- Collector: hourly runs in the school-day window with jitter, weekly quarter re-scan, manual re-scan by student and period, raw response storage, change and removal detection with history, `sync_runs`, API drift logging and alerts.
- Swagger UI, health endpoint, Docker Compose for PostgreSQL.

### v1.1

- `final/whole` parser (after 2026-10-30) feeding the quarter and year tables.
- Weekly digest (Sunday evening) and homework digest (evening before).
- Offline cache of the last loaded data (Workbox, stale-while-revalidate).
- Desktop layout with a two-column overview.

### Later

- Family polish for friends: rename, admin hand-over, delete family.
- Goals and streaks.
- Teacher names (`employees/{id}/fio`), attachments.
- Export (CSV / share image).

## 4. Information architecture

Bottom tab bar (five tabs):

| Tab | Screen | Notes |
|---|---|---|
| Главная | Overview | The most important things only: metrics for the chosen period, last school day's marks, attention list, next school day. Parents with several children first see the student picker |
| Оценки | Marks feed | Period presets + filters, "new" badge on the tab. Day-to-day work |
| Предметы | Subjects | One list by period: every subject with its last marks, average and direction |
| Расписание | Timetable and homework | Today / tomorrow / week |
| Ещё | More | Notifications, family, sync, tags, Оформление, logout |
| (from Главная and Предмет) | Занятия (`#study`) | study time by period, subject and day; the timer |

**Choosing and switching the student.** A parent with more than one child never lands on a child by accident:

- On open (a fresh session, or the app resumed after a few hours) parents see **С кого начнём?** (`#pick`): one card per child, the whole card is the button. Card anatomy, top to bottom: avatar with name and class (and the school under it when the children's schools differ, that is when their `(provider_id, schoolId)` pairs differ: the label is `StudentRef.schoolName`, or the diary's name from the manifest when the system gives none; when the pairs are the same, or both `schoolId`s are empty on one provider, nothing is shown, so one school is never repeated on every card); a row of two or three small stat cells (Новых, Неделя with the arrow and "было", Пропуски when attendance exists; for a class without marks the lessons and homework of the next school day, labelled «Уроков завтра» when it is tomorrow and «Уроков, пн» otherwise, so a Saturday shows Monday, and Д/з); one line with a severity stripe for the nearest thing to prepare (the nearest lesson still ahead that carries a tag, said as data: "Контрольная · Алгебра, завтра, 2 урок", stripe orange for an important tag; or "Ближайшие 2 недели без уроков с тегами"; never "Завтра контрольная" as if the app knew more than a tag match); until tags exist (M6) the card has no such line at all, because "без уроков с тегами" would not be true; and during the child's school day the «Сейчас» line (below). Nothing else on the card: no chips, no prose, no chevron. One tap opens Главная for that child. Under the cards: the switch **Всегда начинать с последнего** and an entry row **Настройки** ("семья, уведомления, теги, оформление · без выбора ученика") that opens Ещё without picking anyone. The screen has no bell: events belong to a child. Until a child is picked, only screens that do not belong to a child open (Ещё and everything under it: Уведомления, Семья, Синхронизация, Теги, Оформление, Аватар); a tab or link to any other screen brings **С кого начнём?** back instead of quietly using the last child. While nobody is picked, Ещё starts with a row **"Ученик не выбран"** that leads back to the choice.
- **Several families.** A person who is a member of more than one family (a step-parent, a grandparent who helps two households) sees the cards grouped under small family headings, and Ещё has «Сменить семью»; the current family decides the tags, rules and settings in use. A student who is a member of two families sees no grouping and no switcher: the app is about them, and Внимание and the schedule carry the tags of both families (7.1).
- **The school day on each card.** During school hours each card ends with one accent line for that child: "3-й урок, до 10:40", "перемена, дальше 4-й в 10:55", "первый урок в 08:30", "уроки закончились в 13:35". Each child has their own bells and lessons, so the two lines differ; a child with nothing on now has no line. Same rules as «Сейчас» (5.2).
- **When the picker appears.** The selected child is remembered on the device (`localStorage`: child id and the time of the last activity). On launch or when the PWA returns to the foreground, the app compares that time with now: if **more than 12 hours** have passed, the stored child is cleared and the picker is shown; within 12 hours the app continues on the same child, so a parent who checks in the morning and again at lunch is not asked twice, but an evening open after a school day starts from the choice. A parent with one child and a student user never see the picker.
- **Setting "Всегда начинать с последнего"** (off by default; on the picker as "Запоминать выбор" and in Ещё → Настройки приложения): when on, the 12-hour rule is skipped and the app always opens on the last child; it can be turned off again in the same place, which also clears the stored child. Both the flag and the timestamp are per device, not per account, because the phone of the parent and the shared tablet in the kitchen are different situations.
- Every student-scoped screen (Главная, Оценки, Предметы, Предмет, Расписание) carries the same **ScreenHeader**: one row with the title on the left and, on the right, the **StudentBar** and the bell (opens Уведомления, the inbox of what was sent, 5.2b; a badge with the number of unread notifications). The bar is avatars only, no words: 34 px avatars, the active one with an accent ring and full opacity, the others dimmed, with a red badge for a critical event on an inactive child. The order is the family order and never changes with the selection; when not every child fits, the active one stays visible in its own position and another is hidden instead. The number shown is not fixed: after layout the bar measures the space left between the title (which keeps at least 140 px) and the bell and shows as many avatars as fit, the rest collapsing into a "+N" circle that opens the student sheet; it re-measures on resize and rotation. Order is active child first, then children with new marks, then the rest, so the ones that matter stay visible on a narrow phone (typically two or three) while a tablet shows everyone. The selected child's name and class sit under the title in small type, so the header costs one row. Student mode has no bar.
- Switching keeps the context: the same screen, the same period, the same filters; on a subject screen the app opens the same subject for the other child when they have it, otherwise their subjects list. A first-grader has no marks, so Оценки → Итоги and Предметы show their empty states.
- Notification deep links carry the student, so a tap on "Милена: 9 по алгебре" opens Милена regardless of who was last selected.

**Every subject name is a link.** Wherever a subject appears (a mark in the feed, a row on Overview, a lesson in the schedule, a cell in the quarter or year tables, a chip in a notification), tapping it opens the subject detail for the current student with the current period, and Back returns to the exact place and scroll position. Rows that carry a mark open the subject with that mark highlighted. The student sheet (four or more children) lists the students of the family; the selected student is remembered per device when "Запоминать выбор" is on.

Routes (React Router):

```
/login
/join/:code                        the login screen with an invite code filled in (the link of POST /api/family/invites)
/connect/matches                   «Дневник подключён»: a child another family follows (7.2)
/pick                              «С кого начнём?»
/s/:studentId                      overview
/s/:studentId/events               Внимание (all rows of the selected period, 5.2a)
/s/:studentId/marks                feed, ?period=week|month|quarter|year&offset=N (N instances back)
/s/:studentId/finals               term and year finals, ?mode=quarters|years (reached from Оценки and Предметы)
/s/:studentId/subjects             subjects by period
/s/:studentId/subjects/:subjectId  subject detail
/s/:studentId/schedule             timetable and homework, ?day=YYYY-MM-DD opens День on that day (Главная's «Всё расписание»,
                                   «Сейчас», a teacher's comment in Оценки, a Внимание row; the link is read once)
/more
/more/notifications
/more/family
/more/sync
```

## 5. Screens

Each screen has an id in `docs/mockups.html` (`#login`, `#home`, ...). The prototype is the visual reference; this section lists content and states. All mark-related numbers in the prototype come from the active grading scale (switchable in its rail for demonstration); the screens below describe the `by-10` instance.

### 5.1 Login (`#login`)

Two entry paths on one screen:

- **Вход**: Marksy login and password for an existing family member. Default tab.
- **Подключить дневник**: first a provider picker (the «Страна и дневник» row opens a sheet, D32: country (its name from `Intl.DisplayNames`) and system; one entry per provider in the registry with `status` beta or stable, plus "Другая страна или школа" that links to `docs/providers.md`), then, for multi-tenant vendors, the school or district (URL, code or a searchable list, as the manifest's `tenant` says), then the credential fields the provider's manifest declares (the fields `login` and `password` are labelled «Логин в дневнике» and «Пароль от дневника» by the app, others with the manifest's label) and a role toggle only when the provider supports both roles; then the person's Marksy login, password and the name the family sees («Как вас называть в семье», `users.display_name`). The consent text under the button is `connect.consent` in every language, its version `CONSENT_VERSION` in `packages/i18n` (14.1). Used once per family by the person who becomes `admin`; a signed-in parent adds another diary (another child's school, another system) with the same flow from Семья → «Добавить дневник», which adds the account to the current family instead of creating one. Copy explains that credentials are stored encrypted and used only to read the diary, a few times a day on school days. A `beta` provider shows a short warning.
- **У меня есть код приглашения** link: enter the code, choose a display name and a Marksy password, land on the students the admin assigned.
- Header: the wordmark and a one-line description across the full width (nothing beside it).
- Language selector at the very bottom of the screen, centred (native names of the twelve languages, in a sheet); the choice is remembered on the device and saved to the user after login (`PATCH /api/me`). A family created by «Подключить дневник» or a member joining by invite gets the language the screen was in; a plain sign-in without a choice takes the user's saved language.
- **The provider is named in one place only**, the "Страна и дневник" field (its display name from the manifest). Every other label, hint and error on this screen and in the app says "дневник": "Логин в дневнике", "Пароль от дневника", "Дети не знают пароль от дневника". The same screen then works for any provider without copy changes.
- Errors: wrong credentials (Marksy or the diary), the diary unreachable (collector host offline or 503), diary already connected to another family (contact its admin for an invite), invite code expired. When a child of the connected diary is already followed by another family, the flow asks what to do instead of failing (7.2).

### 5.2 Overview (`#home`)

- ScreenHeader with the StudentBar (section 4), then the period segmented control: Неделя / Месяц / Четверть / Год. Default: Неделя. The first line of the body is the **period navigator** (section 6): ‹ Эта неделя · 12–18 окт ›. Periods are calendar-aligned (section 6).
- **«Сейчас»**, the one card above the navigator, during the school day only (from an hour before the first lesson to two hours after the last; never in the evening, at weekends or in holidays). It is about this moment, not the period, which is why it sits above the period navigator (ux-principles D52). One line in caps and two lines of content, with the subject's colour stripe: «Сейчас · 3-й урок / Белорусский язык / каб. 206 · до 10:40»; on a break «Перемена / до 10:55 / дальше 4. Физика · каб. 301»; before lessons «Скоро уроки / Первый урок в 08:00 / 1. Русская литература · каб. 204»; after them «Уроки закончились / в 13:35 / завтра к 08:00». A tap opens Расписание on today. Needs the bell schedule (`capabilities.bellSchedule`, end times); without it the card is not shown. The prototype's rail has «Время (демо)» to see every state.
- **Brief row** right under the navigator: the two StatBlock tiles, "Средний балл" (band colour, arrow, "было 8.4") and "Оценок" (the period's count, arrow, "было 18"). This is the whole summary a parent reads at a glance; everything else on the screen is lists and, at the bottom, detail.
- Then the lists: last day's marks (five, 5.2), Внимание (five, 5.2a), tomorrow's timetable as **the same two-bar rows as Расписание, in brief** (`LessonRow` with `compact`: number and time, subject bar, topic, homework, the ⋯ menu, and only the пометки готово, тип урока, тег and задали; no факты, сигнал or подсказка, so no averages or last marks; missing slots shown as in Расписание: "урока нет" before a late start, "окно" mid-day, with "ко 2-му, к 09:25" in the section header; no summary line, no chip cloud) with the lesson count in the section header and a "Всё расписание" button under the list, the same shape as "Все оценки" and "Все события".
- Then the **Статистика** block, after the timetable, with a bare heading (the period is already in the navigator): three titled cards, every one with a heading and a one-line subtitle in the same place: **По градациям** (the band distribution, subtitle "сколько оценок в каждой"), **Распределение** (one bar per value of the scale with the count printed above each non-empty bar, `DistCard`, the same as on the subject screen) and **Динамика**. The average and the count are not repeated here; they are in the brief row above.
- Footer: one centred muted line, "Обновлено сегодня в 12:17 · ⟳ Обновить"; nothing else lives there.
- StatBlock (shared component, here split: the average tile in the brief row, the count tile and the band card in Статистика): tiles and a distribution card, every number paired with **what it was** in the previous calendar period. One grammar everywhere: the value in its band colour, a small arrow in the direction colour (green when the change is for the better on this scale, red for the worse, grey for none; for bands and absences "better" follows the meaning, so more low marks is red), and "было 8.4" in plain text. The size of the change is not printed: the previous value is more useful to a parent and the difference is one subtraction. Average tile hint: "было 8.4" and nothing else; **what "было" refers to is said once, in the navigator** on every screen that shows "было" (Главная, Предметы, Предмет): "12–18 окт · против 5–11 окт", "октябрь · против сентября" ("против" rather than "vs" or a second "было"), "с 1 сентября, идёт · сравнить не с чем". Tiles, subject rows and bands never repeat it; count tile: "было 9" and nothing else (how many of them were tests is the tag filter "Контрольная" on Оценки, not a second fact in the same hint); under every band column and the absences column: "было 3". The band card has four fixed rows per column (range, count with arrow, a bar box of constant height with the share bar anchored to its bottom, "было N"), so the ranges always sit on one line whatever the bars do; the range itself is a small pill in the band's own background and text colours, which is what makes the legend readable in the dark theme. The identical component is used on Главная (all marks of the period) and on the subject screen (one subject, the filtered selection against the same selection in the previous period); subject rows in Предметы use the same grammar (value, arrow, "было 8.7").
- **Динамика** (in the Статистика block; the same `TrendCard` as on the subject screen, 5.4) over all marks of the student: one stacked bar per bucket of the selected kind (weeks, months, terms, months of a year), marks stacked by band, the average line with printed values over it, the selected instance last and highlighted, legend of range pills underneath. This is where the trend lives: Оценки does not repeat it.
- Movement versus the previous period is not a separate block (a horizontal carousel was tried and rejected as unusable): each subject whose average dropped on at least two marks (at most three rows, biggest drops first) becomes an Внимание row with the numbers ("Физика: средний падает · было 6.1, стало 5.5 за неделю"), and the single biggest rise becomes a green row so the list is not only bad news. The full picture is in Предметы with the "По динамике" sort.
- Last school day's marks: the most recent day that has marks, which is today on a school day and Friday at the weekend. Heading says "Оценки сегодня" or "Последние оценки" with the date and, when there are more than five, "5 из 6". At most **five** rows (newest first): chip, subject, work type, comment; then a button "Все оценки · N" that opens Оценки. Главная never grows a long list of its own: five rows and a way to the screen that owns them, the same rule as Внимание.
- Внимание: the **five** most important events of the selected period (5.2a), then a button "Показать все · N" that opens the Внимание screen. By severity, then date: drops in subject averages, tag hits from their `prep_days` (section 6.3: "Контрольная · Алгебра" / "завтра, 2 урок · тема: К/р №2 по теме «Системы линейных уравнений»"; tests are the tag "Контрольная"), marks 1 to 4 in the last 7 days with the teacher's comment, absences in the last 7 days, marks changed or removed by a teacher (from `mark_events`), a diary account that needs a new password or a code (admin and parents). Severity stripe on the left. Empty state: "Всё спокойно". No carousel, no "show more" inline: five rows and one button.
- Next school day: heading with weekday and date, one line with the number of lessons, start time, homework count and a highlighted "контрольная" when one is scheduled, then the lessons as compact chips. Link to the full timetable.
- Student mode adds the "Близко к 8" target card.
- Footer: data age and days left in the quarter; manual refresh for admin and parents.
- Not on this screen: the subjects list (moved to the Предметы tab).
- **A class without marks** (in Belarus grades 1 and 2; decided by the data, never by a grade number: the student's year has no grading scale, `student_years.grading_scale_id = null`, set by the provider, `docs/providers.md` 5.3): the same screen and the same blocks in the same order, with the period control and the navigator; only the blocks about marks are left out. The two tiles count what such a class has: **Уроков** and **Заданий** in the period, with "было" for the previous one (lessons are planned ahead, so the current week counts to Sunday, the term to its end). Then Занятия сегодня, Внимание, tomorrow's lessons in brief, the sync line. No Оценки сегодня, no Статистика, no "Близко к итогу". Lesson rows never say "Оценок по предмету ещё нет" in such a class. The period picker counts lessons instead of marks.
- Sync footer: "Обновлено сегодня в 12:17" and a manual refresh (admin and parents; shares the one-login-per-hour budget, shows "можно в 13:17" when used up).

### 5.2a Внимание (`#events`)

Everything worth attention for one child in the selected period, reached only from "Показать все · N" under the Внимание block on Главная. Header with back, title "Внимание", the StudentBar and the period kind control; the body starts with the period navigator (so last week's rows are one tap or one swipe away), then the list: the same rows as on Главная, all of them, ranked by severity and then by date, with no second caption (the navigator names the period). Rows tied to the past (low marks, absences, changed marks, drops and rises of the average) follow the selected instance; rows about the future (a test in three days, something to prepare) appear only in the current instance, and the note under the list says so. A row that also went out as a notification says so in a small line under it: "пришло в Telegram, 14:02" (or "пришло push, 14 окт, 18:00").

**Computed, not stored.** Внимание is built on read from what sync recorded: `mark_events` and `mark_history` (new, changed, removed marks), marks and absences of the period (a date filter), the subject averages of this period against the previous one (one grouped query), `lesson_tag_hits` with days left. A child's year is about 1,000 to 1,500 marks and 1,200 lessons, so even a year is a few thousand rows and milliseconds with an index on (student, date). Nothing here is kept as its own record: a mark the teacher corrected changes the list at once instead of leaving a stale "низкая оценка". Stats per (student, period) may be cached and dropped after each sync if it ever matters; v1 does not need it.

**Teacher comments.** A teacher's comment on a lesson without a mark (D56) is one neutral fact for 7 days: «Комментарий учителя · Математика, чт» and the text in quotes under it, grey stripe, comment icon, no advice and no severity of its own (the app cannot tell praise from reproach). A tap opens that lesson in Расписание. After 7 days it leaves Внимание and stays in Оценки and on the subject screen.

**Holidays ahead.** Within 7 days before the child's next holidays Внимание carries one fact, no advice: «С 1 ноября осенние каникулы · до 8 ноября · 8 дней», leading to «Школа» → Четверти. The holidays are the child's own (5.9): a February break for grades 1 and 2 never shows for an older child.

### 5.2b Уведомления (`#inbox`)

What the app actually sent to this user, as it was sent, so a push swiped away can be found again. Opened by the bell on every header, "С кого начнём?" included: the inbox is the user's, not a child's, so it needs no choice of child and has no StudentBar and no period control. Header: back, "Уведомления", under it "все дети · за 180 дней" (a student sees only their own). Body:

- The first row is the entry **"Настройки уведомлений · N правил включено · каналы, тихие часы"**, opening `#notifications` (the same entry row as the finals entry on Оценки). There is no gear in the header.
- Then the notifications grouped by day, newest first. Row: the child's avatar (or an app icon for a family-wide message: the evening digest, the weekly summary, "Дневник: нужен новый пароль"), the text as sent, child's name first for parents ("Милена · Физика: 3"), the body in two lines at most; on the right the time and the channel (push, Telegram, both). Unread rows are bold with an accent dot; "Прочитать все" sits in the first day header while anything is unread. The bell shows the unread count.
- A tap opens what the push opened (the subject, tomorrow's timetable, Главная, Синхронизация) and marks the row read. If the row is about a child, that child becomes the selected one, which also counts as the choice on "С кого начнём?".
- A note: the list keeps what was sent for 180 days; what matters now for each child is Внимание on Главная.

### 5.3 Marks feed (`#marks`)

Current marks only. Finals are a different scenario and have their own screen (5.3b), reached in one tap from here and from Предметы.

- Period control as on Overview (Неделя / Месяц / Четверть / Год) and the period navigator as the first body line (section 6); the **mark filter** chips (`MarkFilter`, one component and one piece of state shared by Оценки, Предметы and Предмет, D27): **Все**, **Теги ▾** and **Комментарии** (only the teacher's comments without a mark, D56; shown when the provider has `behaviour`), nothing else for now (no threshold chips such as "Ниже 7"). Until tags exist (M6) the Теги chip is not shown; a row left with only Все is hidden. A mark carries the tags of its lesson (6.3): "Контрольная" when the topic says "К/р №2…", "Стихотворение" when it was the lesson the poem was due for. "Теги" opens a sheet: every enabled tag with its icon and how many marks of the period it has, ticked one or several; under them **"Если выбрано несколько: Любой из / Все сразу"** (OR / AND over the lesson's tags, with one sentence explaining the choice); "Показать N оценок" and "Сбросить теги". The list behind the sheet updates live. The chip then reads the tag name ("Контрольная") or "Контрольная +1"; the empty-state and the subject rows say the filter in words ("контрольная или стихотворение", "… и …"). There are no work-type chips ("Контрольные", "Домашние"): a work type is what the diary may or may not send, a tag is what the family decided, and the same tag "Контрольная" drives the schedule, Внимание and this filter. There is no "new" chip: the "new" dot on rows and the badge on the tab already carry that, and a filter that empties itself after one visit is not a filter.
- No StatBlock and no chart here: the average, the count, the band distribution and the trend for the selected period are on Главная, one tab away; Оценки is the list. The filter chips still narrow the list (and the same filter narrows Предметы and the subject screen, D27).
- Right under the StatBlock, the **finals entry row**: "Итоговые отметки · по четвертям и годам · I четверть идёт, итоги после 31 окт", opening the Finals screen. When a term's finals have been posted and the next term has not started, the row says so in the good-news colour ("I четверть выставлена 15 октября"): the finals are shown next to the current marks for as long as they are news, without mixing the two lists.
- List grouped by day, newest first. Row: mark chip, subject, the work type label only when the diary set one (no placeholder for an empty type), topic (one line, truncated), comment icon if a comment exists. Chips of marks whose lesson carries the tag «Контрольная» get a small pencil icon in the corner, the only decoration a chip ever has; the diary's work type alone never adds it (6, D50); there is no "new since last visit" dot (D28).
- **A mark the teacher corrected or removed** (14 days, 8) is a row of its day after the comments: the mark as a quiet outlined chip (struck through when removed), never a filled one, so it is not counted by eye next to the live marks; the line says «исправлена, было 6» or «учитель удалил оценку».
- **Teacher comments without a mark** (D56) are their own rows in the day group, after the marks of that day: the comment icon in place of a chip, the subject, and the text in quotes ("Математика · «Нет домашнего задания»"). Neutral colours, never a chip, never counted in averages, band columns or the StatBlock. A tap opens the lesson.
- Absences (attendance records, never marks; only with the `attendance` capability) are quiet rows of the day group after its marks: the absence code (`н`) in a dashed frame instead of a chip, the subject, "пропуск". Never counted in averages, band columns or the StatBlock; hidden while the filter is Теги or Комментарии.
- On the day a term's finals are posted they also appear in the stream as one card per term ("Итоги I четверти": subject chips, how many differ from the rounded average, link "Все итоги"), because a posted final is a mark event. Finals never enter the StatBlock above.
- Empty state per filter; for the 2025/26 instance of Год the empty state says that only finals exist for that year and links to the Finals screen.

### 5.3b Finals (`#finals`)

The marks a teacher sets at the end of a term or year (in Belarus an integer set separately, usually but not always the rounded average; `FinalMark` rows from `final/whole`). Own screen with a back button, title "Итоги", the StudentBar, and one segmented control Четверти / Годы (Четверти only when the provider has terms). Reached from the entry row on Оценки and Предметы, from the finals card in the feed, and from the subject's "По четвертям" strip.

- **Четверти**: table subject × I, II, III, IV, Год for the current school year, every subject listed. A posted final is a filled mark chip (integer). A running term shows the **current average as a plain decimal in italics**, no fill: a decimal cannot be a final, so the reader sees at once that this is where the term is heading, not what the teacher gave. Future terms are dashes. The Год cell follows the same idea one level up: until the year final is posted it shows, in the same italic decimal notation, the **average of the term finals posted so far** (the Belarusian year rule; `GradingScale.finalRule.year` names the rule for other systems), and a dash while no term has a final yet. It is never the average of all marks: a year is made of term finals. Under each subject name: last year's final for that subject ("итог 2025/26: 8") or "новый предмет". The header line states the current term ("I четверть идёт, итоги после 31 окт" / "I четверть выставлена сегодня"). Tap a row to open the subject.
- **Годы**: table subject × school years with the year final per year; the running year shows the average of its posted term finals in the same italic notation (dash until the first term final); the last column is the direction arrow against the previous year (D5), no signed delta. Subjects that exist in only one year are listed with "в этом году нет" or "новый предмет". Button for admin and parents under the table: **"Ввести итоги прошлого года"** (section 6.1): a sheet with the school year (the two before the current one that the diary does not send, as many as Годы shows next to it; a year typed in before opens with its values), every current subject and any subject already typed in for that year, each a row that opens the child's scale values and «—» under it (no native select, D32), and «Другой предмет» for a subject the year had under another name; «Сохранить» writes the whole year (a subject at «—» goes, an empty year is removed). A typed-in final carries a small pen in its cell, and the legend says what the pen means.
- In both views the short legend (what a framed integer and an italic decimal mean, where last year's finals come from) sits **above** the table, not under it: without it the mix of integers, decimals and dashes cannot be read.
- Under the column heads I to IV of Четверти, the child's term dates in small print ("1.09 / 31.10"). The period picker names a term with its dates too ("I четверть · 1 сен – 31 окт · идёт").
- Prototype: rail toggle "Итоги I четверти" (not posted / posted today) shows both cell states, the entry row, the feed card, the Предметы row badge and the subject strip.

### 5.3a Subjects (`#subjects`)

One list, by period. The period control and the mark filter chips (same as Оценки, same state), the navigator, then the finals entry row (5.3), then the sort control: a text button with the current order that opens a bottom sheet (no native select) with По алфавиту (default), Сначала слабые, Сначала сильные (by the period average), Сильнее всего упали, Сильнее всего выросли (by the change against the previous instance), each with a one-line explanation; subjects without marks in the period always sort last. **Every subject of the student is always listed**, whether or not it has marks in the period under the current filter ("контрольные: нет за неделю" when the filter leaves none; with Комментарии a row counts the subject's teacher comments of the period in a short line that fits at 360 px, «2 комментария» or «нет комментариев» (the chip and the navigator already say what and when), with «—» for the average): the list is the student's curriculum, not a result set. A subject without marks shows "—" instead of an average (D23) and "нет оценок за неделю" instead of chips, and sorts last under weak / strong / move. The line above the list holds only the sort dropdown, no counts and no period text. Row: subject, last 5 marks as chips (of the filtered kind), average over the filtered marks with band colour and trend arrow, "было 7.9" underneath (the instance before); when the term's final has been posted and the next term has not started, the row shows "итог I: 8" there instead. A note under the list explains what the arrow compares.
- Subject detail mirrors the finals notation in its "По четвертям" strip: posted finals as chips, the running term as an italic decimal, the Год cell as the average of posted term finals, and a line "Итог I четверти выставлен сегодня: 9 при среднем 8.8" once posted; the goal card then stops computing for that term and says so until the next term starts.
- **A class without marks** (grades 1 and 2 in Belarus; the student year has no grading scale, see 5.2): the list is never empty, and the period control and navigator stay, as on every period screen. A note "В 1 классе отметки не ставят. Здесь уроки и задания по предметам за период, справа время занятий, ниже ближайший урок", then every subject in the same row with its colour stripe: lessons and homework in the period ("5 уроков · 5 заданий"), in the current period a second line with the next lesson and its homework ("дальше: завтра, 3 урок · Принести цветную бумагу и клей"), and on the right the study time of the period when there is any. Sorted by the next lesson, subjects with no lesson in two weeks last. No filter, no finals row, no sort. A row opens the subject screen in the same mode: tinted header with the period control and navigator, "Настройки предмета" with the colour only (no goal), the tiles Уроков and Заданий for the period, "Ближайшие уроки", and the study card if there is study time.

- **Level of study.** A small quiet tag «углубл.» after the subject name when the child studies it at the advanced level (`Subject.level = 'advanced'`); nothing for the regular level, which would otherwise tag every row. Same tag in «О предмете» (5.4).

### 5.4 Subject detail (`#subject`)

- **Colour: "акцент" (D45).** The header (back, subject name, student, period control, filter chips) sits on a soft tint of the subject's colour that continues under the status bar, with rounded bottom corners; the name takes a darker shade of it. The screen's controls use the subject colour instead of the app accent: selected chip and segment, navigator arrows, links, the target picker. In the dark theme the shade is light and the text on filled controls dark, so every palette colour stays readable. No colour dot in the header; colour and goal are changed in "Настройки предмета" (below). Never in the subject colour: StatBlock, Распределение, Динамика, mark chips, averages, severity stripes.
- Header: subject name, the period control and the same mark filter chips as on Оценки and Предметы (Все / Теги), sharing their state, so a filter set on the list is still on when a subject is opened. Both controls drive only the first section.
- The screen is two sections with an explicit boundary. The first follows the controls and has no caption of its own: the period navigator is its first line, exactly as on Оценки and Предметы, and on this screen the whole navigator row continues the subject-tinted header (rounded bottom, stays tinted while sticky). Under it, before any statistics, two blocks that do not depend on the period:
  - **"Настройки предмета"**, an entry row in the style of "Итоговые отметки" (icon tile, bold title, one line "цель: итог 8 · цвет: синий", chevron). It opens a sheet "Физика: настройки": **Цель на четверть: итог** (any whole value of the scale as a grid, 1 to 10 for by-10, plus **"Без цели"** for a subject the family does not set a goal for; the explanation under the grid says what the goal is used for; per subject per student; a new subject starts with the scale's default goal) and **Цвет** (the twelve swatches and "Авто", 6.6), then "Готово". Changes apply live behind the sheet.
  - **"О предмете"**, right under the settings: a card with a small caps label and label-value rows, each only when known: **Учитель** (the child's teacher, full name; `teacherNames`), **Подгруппа** (only on a split subject; `teachingGroups`), **Уровень** (Базовый / Углублённый; not for a class without marks), **В неделю** ("3 урока") and **Когда**, one line per lesson of the child's regular week ("пн 4-й · каб. 412"; `weekTemplate`, `rooms`).
  - **"Обратить внимание"**, in the style of the timetable's "Обратить внимание" block (tinted card, rows with a stripe, bold title, quiet line): first this subject's lessons that carry a tag (the same rows as "Обратить внимание": "Контрольная · Физика / вт, 20 окт, 1 урок · через 5 дней / тема: …"), then the subject's guidance hints (6.2): a low mark to go over with the teacher's comment, weak homework, tests below the usual level, three marks under the average, an absence to catch up. Hints and the goal row disappear with guidance off (the goal itself stays saved and is shown in «Настройки предмета»); the block is hidden when there is nothing to say. It replaces the old "Что сделать" list at the bottom.
  Then StatBlock, Распределение, Динамика, the list of marks; all four follow the controls. Then a labelled divider **Четверть** with one line "Не зависит от периода и фильтров выше: считается по всей текущей четверти, по всем оценкам", under which sits По четвертям. Last, a labelled divider **Занятия** with the study card (6.7): it follows the period at the top again, so its card is titled with the period ("Эта неделя · 1 ч 17 мин · было 25 мин"). The period-dependent part comes first because it is what the controls act on; the term part is stable context that a reader scrolls to once.
- StatBlock for the subject (average, count, band distribution, each against the previous period), then the **Динамика** chart. The chart follows the period control: with Неделя selected it shows one point per week for the 8 weeks ending at the selected week, with Месяц one per month of the school year up to the selected month, with Четверть one per term, with Год one per month of the selected school year. Each bucket is a **stacked bar** of its marks, worst band at the bottom and best at the top in the band colours (the same colours as the range pills: 7–8 soft green with a dark edge, 9–10 deep green), with height proportional to the number of marks, so a quiet week is visibly small and a 7.5 made of two 9s and a 4 looks different from a 7.5 made of three 7s and 8s. Over the bars runs the average line; each point is the subject's average over that bucket with its value printed above it and the bucket's label underneath ("14.09", "сен", "II"); the last bucket is the selected instance itself and is highlighted, so the chart is the StatBlock's "было" extended back in time. A legend of the range pills sits under the chart with one line of words ("столбик — оценки отрезка по градациям, линия — средний"). Empty buckets are gaps with a dash, never zeros; buckets before the school year are not drawn; future terms show only their label. Band boundary lines stay as dashed guides.
- По четвертям strip: I, II, III, IV, Год cells (final mark bold, running average italic, dash for the future), with last year's final mark for the subject in the header.
- Distribution bar: how many of each value 1..10 (thin bars, labels on hover).
- No "Цель за четверть" card: the goal is a setting ("Настройки предмета"), and its consequence is one row at the top of **"Обратить внимание"**: "Цель итог 8: ещё 9 × 10" (what is missing, with "сейчас выходит 5, средний 5.1, нужен 7.5"), or "Цель итог 8: хватает" with the lowest next mark that keeps it, or "Цель итог 8 в этой четверти уже не достичь". No goal, no row.
- **Ближайшие уроки**, between the marks of the period and "Четверть" (independent of the period): the next three lessons of the subject still ahead, each under a day caption ("Вт, 20 окт"), as `LessonRow`s from the timetable (number and time, subject bar, topic, homework, тег and задали notes, ⋯ menu). It uses the same compact rows as Главная: the факты, сигнал and подсказка notes are left out, since the screen above already shows the average and the last marks. Hidden without `lessons` and `futureTimetable`.
- Timeline: date, mark chip, work type, topic, comment, teacher (later). The teacher's comments without a mark are rows of the same list by date, the same row as in Оценки (D56), so a repeated remark is easy to see.

### 5.5 Timetable and homework (`#lessons`, tab "Расписание")

- **Period controls like everywhere else** (D2): the segmented control picks the kind, **День / Неделя**; the sticky navigator under the header steps ‹ › through instances, its label ("Сегодня · 15 октября", "Завтра", "Понедельник", "Эта неделя · 12–18 окт", "Следующая неделя") opens a picker of days or weeks with lesson counts, and a horizontal swipe does the same as the arrows. Unlike marks the timetable also goes forward. A day steps over days without lessons (Friday → Monday); a week steps by calendar weeks while the diary has lessons in them (a week of the child's holidays is reachable too). Default: День, today, and on a day without lessons (a weekend, the holidays) the next day with lessons. "Всё расписание" on Главная opens День on the next school day. The day picker lists the days with lessons from a week back to two weeks ahead, the week picker the weeks with lessons from three back to two ahead, each with its count of lessons that take place. Switching День to Неделя shows the week that holds the selected day; Неделя back to День shows today in this week, else the first day with lessons of the selected week. The kind and the instance survive a child switch and moving between tabs. Both kinds open with the same block, "Обратить внимание", for exactly the selected day or week.
- Day header: in День the navigator names the day, so the line under it carries only the counts; in Неделя every day has its name and date. The counts: number of lessons that will take place ("· 1 не будет" when the family cancelled one), homework count, number of tests highlighted.
- **"Обратить внимание"** above the lessons, in День and in Неделя: **facts from tags only**, nothing the app cannot know, and **only about the selected day or week**: its lessons still ahead that carry a tag, ordered by date and lesson number, each tappable to the subject. No look-ahead into other days ("ближайшие 2 недели" is gone): to see next week, step to next week. Hidden when the range has no tagged lesson. Every row has three lines: tag icon and **"Тег · Предмет"** in bold ("Контрольная · Алгебра"); which lesson and how far in muted type ("завтра, 2 урок", "вт, 20 окт, 4 урок · через 5 дней"); and the diary's own words that matched, as the diary wrote them, in quiet type ("тема: К/р №2 по теме «Системы линейных уравнений»", "задано ср, 14 окт: SB p. 45 ex. 2, learn the poem by heart"). The stripe is orange for an important tag, grey otherwise. No advice, no "повторить", no weekend tips: guidance hints live under the lesson (подсказка, 6.2) and are not repeated here. Shown whether guidance is on or off. Hidden when no lesson carries a tag.
- **Lessons of a day as one list with two bars** (chosen over rounded cards, a plain list and a full-width feed): all lessons in one container separated by hairlines. Each row: on the left the **lesson number** (large) and its **start time** under it; a thin square bar in the subject's colour (6.6); the subject in bold, the topic in muted type, the homework as plain text; a **⋯ button** at the right edge, level with the subject (5.5 "Lesson actions"). There is no checkbox on the row. Anything Marksy wants to say about the lesson (a tag due here, "задали" on the lesson where it was set, the guidance hint) goes **under the content with its own short bar in the severity colour** (red, orange, grey), so "which subject" and "how serious" are two stripes one under the other and no dot or tinted box is needed. No lesson number: the order of the rows is the order of the day. A row marked ready gets the пометка **готово** as its first note and its texts fade a step. The Внимание list on Главная uses the same bar language, so the two screens read alike.
- **Missing slots are part of the timetable.** A day that starts later says so above the list in the accent colour ("Ко 2-му уроку, к 09:25", also in the section header of the home widget), and the empty first slot is a quiet row ("1-го урока нет"); a window in the middle of the day is its own row ("5-й урок · окно"). Gap rows have a dashed bar that runs the full height of the number and time, the text centred against it, no tick and no tap; slot times come from the provider's bell schedule, and the day header still counts only real lessons.
- **Пометки (lesson notes).** The single name for every line under a lesson, in the app, in the docs and in code (`LessonNote`; "пометка", plural "пометки"). A пометка is a line icon from the app's icon set (the stroke style of the menu icons, never emoji) on the **left axis**, right-aligned under the lesson number and time, then a short bar in its colour in line with the subject bar, then one short text. The left column therefore reads top to bottom as number, time, icons, and the texts of the lesson and its notes share one left edge. Notes are separated by a small gap so every bar, grey ones included, stands on its own. **One fact per note**: a note never strings several facts together with dots. A note that carries mark chips ("Оценка за урок", "Последние оценки") centres its label and chips on one line; when the chips wrap, the icon stays level with the first line. Kinds, in this order:
  - **готово**: first on an upcoming lesson marked ready (6.5): check icon and green bar like a tag, "**Готово** · Милена, 17:40".
  - **оценка**: up to three notes, one fact each: "Оценка за урок: 9" (bar in the mark's band colour; the only note with a label, because a bare number reads like a lesson number or a score), the kind of work without a label ("Самостоятельная работа", grey bar, pen icon) and the teacher's comment in quotes without a label ("«Аккуратная работа»", grey bar, comment icon), the last two only when the diary has them: an empty work type shows nothing, never "Работа на уроке" or another placeholder; or one grey note "Пропуск урока". A test is the lesson's тег note «Контрольная» (orange bar, test icon, bold), before and after the lesson alike, so a test reads the same on both sides; the diary's work type does not make a test (D50). The mark lives here, not in the left column.
  - **комментарий учителя**: a teacher's comment on the lesson without a mark (D56): comment icon, grey bar, «Учитель: «Нет домашнего задания»». Neutral: no band or severity colour. One note per comment.
  - **тип урока**: only when the diary set one: "Лабораторная работа" / "Практическая работа" / "Экскурсия" (accent). The diary's lesson type TEST is not shown as a тип урока note: it is one of the ways the tag «Контрольная» matches (its preset includes lesson type test), and the тег note shows it, so one test is one note.
  - **тег**: a tag due at this lesson (6.3): tag icon, bold name in the tag's tone (orange for important, accent otherwise); for a homework match the matched text and "(задали 14 окт)". A test is this note: "Контрольная".
  - **задали**: "Задали: стихотворение, к вт, 20 октября" (grey) on the lesson where tagged homework was set.
  - **подсказка**: the guidance hint (6.2), action in bold and the reason after it (the advice first, then the fact; a hint without advice shows its fact in bold).
  - **сигнал**: "Давно без оценки, могут спросить; можно вызваться", "Могут спросить, стоит подготовиться", "Нужно поднажать" (guidance on).
  - **факты**: "Средняя оценка", "Последние оценки", "Последняя оценка: 14 окт, 2 урока назад" (grey bars).
- **A lesson that has passed keeps only its оценка** (or "Пропуск урока"), in both views: every other note exists to prepare for a lesson, and that lesson is over. Passed lessons have no ⋯ button and no actions; "Обратить внимание" and the day's "готово N из M" count only lessons still ahead. **When a lesson has passed** is one rule in core (`lessonPassed`), used by the server and the app alike: the lesson's end time (from the diary or the child's bells) is reached in the school's time zone; a lesson without an end time counts as passed from the next day. The same rule hides the ⋯ button, ends the «сейчас» tint and makes the server refuse a tick, a cancellation or homework on that lesson (409 `lesson_passed`).
- **One view, facts always shown.** There is no Подробно / Кратко switch: with one fact per note and icons on the left axis the full row stays easy to scan, so every upcoming lesson shows the пометки факты and сигнал: the subject facts as of the start of the lesson: **"Средняя оценка: 8.5"** (in its band colour), **"Последние оценки:"** with the last five marks this school year as chips (never mixed with last year), **"Последняя оценка: 14 окт, 2 урока назад"** (lessons of this subject since the last mark); and, when guidance is on, **"Давно без оценки, могут спросить · 7 уроков без оценки; можно вызваться"** in the accent colour after `callAfter` lessons without a mark (family rule, default 4, 6.4), or **"Могут спросить, стоит подготовиться"** in orange when the average is also low, or **"Нужно поднажать · средний 5.8"** when the average is low and nothing more serious is said. These answer "where should I push and where might I be called" before the day, next to the lesson.
- **Lesson actions: one ⋯ menu.** Every upcoming lesson has a ⋯ button at the right, and a tap anywhere on the row (except the subject name) opens the same bottom sheet, titled "Алгебра · 2 урок, завтра 09:25". The actions, always in this order, each a row with an icon tile, a bold title and one line of context:
  1. **"Отметить «готово»"** (green tile, check icon; "к уроку подготовились") or **"Снять отметку «готово»"** ("отметка: Милена, 17:40"; a person's name never takes a gendered verb, docs/i18n.md 4). First, because it is the action used every day.
  2. **"Добавить задание"** ("в дневнике задания нет") when the lesson has no homework, or **"Изменить задание"** with the current text when the family added one (6.5). Not shown when only the diary's homework exists.
  3. **"Урока не будет"** (grey; "уберём из подсчётов и напоминаний, можно вернуть").
  A cancelled lesson's menu has one action, **"Вернуть урок"**. Actions under the lesson, checkboxes and inline "изменить" links are not used: they mixed with the notes and with each other. A choice closes the sheet and the row changes at once, without scrolling the page; if the server refuses (the lesson passed in the meantime, the diary already has it, no network) the sheet comes back with one line saying why. The same menu opens from the compact rows on Главная and in «Ближайшие уроки».
- **"Урока не будет".** The diary does not say when a lesson is cancelled (teacher ill, trip, the class at an event), so the family says it. The third action of the lesson menu is **"Урока не будет"** (line icon "circle with slash"). It turns the row into a cancelled row: number and time stay, the bar fades, the subject is struck through, the text "Урока не будет" replaces topic, homework and пометки, and the ⋯ menu offers only **"Вернуть урок"** (undo icon), which restores the row exactly as it was. No confirmation dialog: undo is two taps away. Anyone who may tick (6.5) may cancel and restore; who did it is stored, not shown. A cancelled lesson:
  - is not counted in the day header ("3 урока · 1 не будет"), in "готово N из M", in "Ко 2-му уроку" (the first lesson that will take place decides it) or in the home widget count; in the widget the row stays, struck through, with "урока не будет";
  - is skipped as a due lesson: homework, tag hits and "Обратить внимание" items that pointed at it move to the next lesson of the subject that will take place;
  - is skipped when counting "N уроков без оценки" and "N уроков назад" (`callAfter`);
  - keeps its test event on Главная and События, with "урока не будет, уточните перенос" added, because a cancelled test is usually moved, not dropped.
  If the diary later records a mark or an attendance record for that lesson (an absence, a late arrival; a planned topic does not count: the diary shows topics ahead), the diary wins: the collector removes the override, the lesson shows normally (the read side already ignores an override next to a mark), and nothing is announced. A lesson the diary already has a mark or an attendance record for cannot be cancelled (409 `diary_has_lesson`). Passed lessons have no cancel action (nothing to plan any more).
- In Неделя the block lists the whole selected week, so the weekend planning view is "Неделя → следующая неделя".
- Grade 1: this is the primary screen; the overview links here.

- **School details on lesson rows** (`docs/providers.md` 4, D51): the time axis shows the start and, under it in small print, the end from the bell schedule ("09:55 / 10:40"); under the subject a quiet line with the room and, on a split subject, the child's subgroup ("каб. 412 · 2-я подгруппа"); a room that is a number gets «каб.», a named room stays as the diary names it («спортзал»). No teacher on the row (the subject screen has it). Each part only when the provider has it. Gap rows take their times from the bells too. The same row everywhere: Расписание, «Завтра» on Главная, «Ближайшие уроки».
- **Now.** On today, the lesson in progress is tinted with the accent and tagged «сейчас»; finished lessons already read as past. The day header adds the span of the day before the counts: "08:00–13:35 · 6 уроков, 4 д/з · …".
- **Holidays.** A day inside the child's holidays shows a card «Осенние каникулы · 1–8 ноя · 8 дней» (the name from `Holiday.kind`, autumn, winter, spring, summer or additional, through the app's words; without a kind just «Каникулы», never guessed from the month) in the holiday colour (a sun, `color.*.holiday`, the same as in «Школа» → Четверти) instead of an empty day; a whole week of holidays is one such card, and the week navigator steps into it. Only the child's own holidays (grades 1 and 2 have an extra week in February; their older sibling does not).

### 5.6 More (`#more`)

Order, from the most important down: who is signed in (a card); then **what the app does for the family**: **Семья** (children, members, diary accounts; parents only; first, because everything else depends on who is in the family), **Школа** (the selected child's bells, terms and holidays, 5.9; it asks for a child first when none is picked; hidden when the provider has neither), **Настройки уведомлений** (the setting people come back to most), **Теги** (what the schedule, Внимание and notifications look for), **Синхронизация** (status; parents only, and the freshness banner already leads there when something is wrong); then **how the app looks and behaves**, set once: **Оформление**, **Простой режим** (student only), **Подсказки** (the person's own switch, `users.settings.guidance`; the admin has the family's switch in Семья, `families.settings.guidance`; advice shows only when both are on), **Всегда начинать с последнего ребёнка** (parents only), **Язык**; last and in its own card, **Выйти**. While no child is picked, the row "Ученик не выбран" comes first (5.1), with «оценки, предметы и расписание откроются после выбора». The lines under the rows are live (owner, 2026-10-25): Семья «4 участника · Милена, Марк · 1 дневник» (members, the children's names, diaries); Школа «Милена: звонки, четверти и каникулы», the periods' word a plural key by `Term.kind` (четверти, триместры, семестры), «звонки и каникулы» without terms; Синхронизация «Сегодня в 12:17 · следующая около 13:00»; after today's window the next school day as the planner knows it, «следующая пн, 9 ноя в 08:13» (the date alone when that day's times are unknown), across holidays «следующая после каникул, пн, 9 ноя», the general «следующая в учебный день» only when the planner has no date; a problem replaces the times in its warning colour («Нужен новый пароль», «Дневник заблокировал вход», «Дневник просит код», «Дневник не отвечает», «Данные устарели»), while a run in progress is a neutral state, not a problem: «Читаем дневник», without the warning colour; Оформление its summary; Язык the language's name, with «· перевод не проверен» for a language whose status is not `source` or `reviewed` (`docs/i18n.md`); under the cards «Marksy <version> · дневник только читается, ничего в нём не меняется», the version from the root `package.json`.

- Avatars (`#avatarEdit`, from Family by tapping a student): a generated avatar from traits, or an uploaded photo. Traits: age (6–9, 10–13, 14–17, adult), look (boy, girl, neutral), skin tone (six), hair colour (black, dark, chestnut, light brown, blond, red, grey), hairstyle (buzz, short, medium, long, ponytail, bob, curly, braids), eye colour (brown, hazel, green, blue, grey), glasses. Every combination exists and is drawn on the fly as SVG from the trait set (no image library), so "a seven-year-old boy with dark hair and brown eyes" and "a twelve-year-old girl with dark hair and brown eyes" are both a few taps. The picker shows each option already applied to the child's current avatar. Photos are stored on the family's server only. Avatars appear in the StudentBar, the start screen, the family list, the student sheet and in notifications.
- Family (`#family`, admin and parents): members of the family with role and which children they see; for the admin a block **«Заявки на вступление»**: a person who chose «Присоединиться к семье …» when connecting their diary (7.2), shown by display name with the diary they connected, «Принять» / «Отклонить» (`PATCH /api/family/join-requests/:id`); the family's **Подсказки** switch (admin); invite button that shows a code valid for 48 hours and a link; **diaries**, one row each: provider name, the school, status (ok, password changed, blocked, needs a code) and which children it shows; **children**, one row each: class and school, and for a child followed by another family too the quiet line «Также следит другая семья» (no names, no details, ux-principles D54); "Добавить дневник" connects another account, possibly on another provider (children in different systems), into this family. Admin can change a member's role and student access, remove a member, and «Перестать следить» a child (7.1): while one of the family's logins still shows the child, the link becomes `stopped` and the child stays in Семья with «Следить снова» and «Удалить данные» (only when no other family follows the child, typed confirmation); otherwise the link is deleted. The child's shared data goes only with the last `family_students` row (a trigger of migration 0004). A child whose diary no longer shows them to any of this family's logins is marked «Дневник больше не показывает этого ребёнка» and hidden from the pickers until it does (7.1). Prototype: the rail's «Семья (демо)» puts Марк in another school on a thinner fictional system and lets another family follow him; the screen «Подключение: ребёнок уже в Marksy» shows the choice of 7.2.
- Теги (`#tags`): the family's tags (section 6.3) as rows with icon tile (orange for important), name, where and which words, "готовиться за N дней", on/off; tapping a row opens the editor; "Добавить тег"; an entry "Уведомления по тегам" that opens Уведомления; below, "Сейчас в расписании": every hit for the next two weeks.
- Tag editor (`#tagEdit`): name; icon from the line set; tone (Обычный / Важный) with a live preview of the пометка; keywords as removable chips with an input (Enter adds; case-insensitive prefix, explained under the field); where to search (topic, homework) with the rule of where the tag lands; a switch for the diary's lesson type "контрольная" only when the provider has `lessonTypes`; subjects (none = all); "Готовиться заранее, дней" (нет / 1 / 2 / 3 / 5 / 7); for whom. No notification settings here. Below the form, "Проверка на расписании" shows what the tag as edited finds in the next two weeks. Save / delete.
- Notifications (`#notifications`): channels (Web Push toggle per device, Telegram link with a one-time code); then a list of **alert rules** the user owns, each shown as a title built from its condition ("Оценка ниже 5", "Средний по предмету вырос больше чем на 0.5") and a line with the comparison period, when it is sent and for whom; a toggle per rule; tap to edit; "Добавить правило". Quiet hours. Rules whose event needs a capability the provider lacks are hidden.
- Alert rule editor (`#alertEdit`, section 6.4): pick the **event** (new mark, teacher comment without a mark, subject average changed, mark changed or removed, absence, lesson with a tag, homework digest, weekly summary); set the **condition** that belongs to the event: for a mark, any / worse than a value / not worse than a value / in a band, with values and bands from the scale; for an average, direction (dropped / rose / changed), step, the **period and what it is compared with** (week vs previous week, 2 weeks, month, term: calendar-aligned, named explicitly on screen), minimum marks; for a lesson with a tag, **which tags** (chips, several allowed) and **when to remind** (several allowed: как только появился, за N дней, вечером накануне, в субботу на следующую неделю), which replace the generic "when" choice; choose **for whom** (all students or one) and **which subjects** (none selected = all); choose **when** (immediately, evening digest at 19:00, weekly on Sunday). Below, "Проверка на данных" shows how often the rule would have fired in the last two weeks or which subjects match now, so the threshold is tangible before saving. Save, delete.
- Default rules, created per child on that child's scale for every user who may see the child, when the user joins a family and when a child comes into it (7.1; a student only about themselves; all editable, deletable): any new mark (students on, parents off), teacher comment without a mark (parents on, in the evening digest; students off), mark worse than the scale's first threshold (parents on, immediately), mark in the top band (parents on, evening digest: good news belongs in notifications too), subject average dropped by 0.5 of a by-10 point over a week versus the previous week on at least 2 marks (off), mark changed or removed, absence, "Теги: Контрольная, Стихотворение" (as soon as it appears, the evening before, in the Saturday list; everyone on), "Теги: Принести" (the evening before; students on), homework digest, weekly summary.
- Sync (`#sync`, admin and parents): one block per diary account of the family, each with its own state card (status dot and word, last data, last attempt with its outcome, failures in a row when any, next run and why, today's window and whose school day makes it, "сегодня 07:00–16:20 · уроки Милены и Марка", or "сегодня без обновлений · у детей каникулы", a plain-language note when something is wrong; for a child collected through another family's login, «Обновляется через другую семью» with the time of the last data and no controls), "Следующий запуск возьмёт" (the planned weeks and a request estimate, 10.4), re-scan status (the current term's weeks not checked for six days, taken in the next school-day runs), API drift notices (each with «Понятно, скрыть», for this family only), manual actions: "Обновить сейчас" and "Перепроверить" with a scope picker (student, period: quarter / school year / specific weeks), and the run log (90 days). Both buttons respect the one-login-per-hour rule and show when the next run is allowed; after a wrong-password failure the primary button becomes "Обновить пароль дневника" and opens Семья. Every student screen gets a `FreshnessBanner` under its header when the last success is older than 24 hours or the account is paused or needs action (D22); it opens this screen. Prototype: rail toggle "Состояние синхронизации" with scenarios fresh / device was off / paused after failures / wrong password.
- Настройки приложения: "Всегда начинать с последнего ребёнка" (per device; off: the picker appears after 12 hours of inactivity); simple mode for a student and Оформление are per person (5.7, 5.6a).
- Language: one of the twelve interface languages with its review status (`docs/i18n.md`); saved per user, also used for that user's notifications.
- **Оформление** (`#look`, an item in Ещё with a one-line summary "Светлая · палитра «Морская» · Manrope"), section 5.6a. Logout.

### 5.6a Оформление (`#look`)

Personal settings: stored per user (`users.settings.appearance`) and applied on every device the user signs in on, so a child and a parent can look at the same data in different clothes. Subject colours are the family's (6.6) and are only listed here.

- **Тема**: Светлая (default for a new user and on the login screen) / Тёмная / Как в системе.
- **Фон**: Цвет / Обои.
  - **Цвет → Палитра**: eight palettes (`tokens.json → palette`): Морская (default), Лесная, Небесная, Сливовая, Ягодная, Янтарная, Мятная, Графит. A palette sets the page background and the app accent (buttons, selected controls, links) in both themes. It never changes mark bands, severity or arrows, and on the subject screen the subject colour still overrides the accent (D45).
  - **Обои**: five built-in tiled patterns (Клетка, Линейка, Точки, Каракули, Волны: school-notebook motifs in one mid-tone, `web/public/wallpapers`) and **"Загрузить"** for an own picture (scaled down to 1600 px in the browser and sent as a JPEG; the server accepts JPEG/PNG/WebP up to 5 MB and 1600 px and strips the metadata, 14.1; stored per user in `user_files`, visible only to that user). Once there is one, the tile is **"Своё"** and two buttons under the slider replace it (**"Другое фото"**) or delete the file (**"Удалить фото"**, the background falls back to Клетка). **"Насколько видны обои"**: a slider 10 to 100 %, default 35 %. Cards stay solid; the wallpaper shows between them and behind headers; the sticky navigator gets a translucent blurred background so it stays readable.
- **Шрифт**: five body fonts with full Cyrillic, each shown with a sample "Аа" in itself: **Manrope** (default, even and compact), **Nunito** (soft and round, liked by children), **PT Sans** (classic, made for Cyrillic), **Inter** (neutral, like system apps), **Rubik** (slightly rounded, large and friendly). Numbers in statistics keep the display font.
- **Цвета предметов**: the student's subjects, each with its colour stripe and the colour's name ("авто", "синий"); a tap opens the same colour sheet as on the subject screen (6.6). The header names the child and says these colours are seen by the whole family. The child is the one this device continues with (the 12-hour rule, D7); with none, the list is not shown. Every change on the screen applies at once and is saved to the person; a quiet note at the bottom says theme, background and font are personal and subject colours are the family's.

### 5.8 Занятия (`#study`)

Reached from the card "Занятия сегодня" on Главная and from the card "Занятия" on a subject. Header with the StudentBar, the period kind control and a filter row **Все / Только таймер** (whether estimates count, 6.7); the body starts with the navigator ("12–18 окт · против 5–11 окт"), then:

- An entry row **"Заниматься"** (hidden while a session runs; the timer bar is then visible anyway).
- Two tiles: **Занятий** (total time for the period, "было 6 ч 56 мин") and **В учебный день** (total divided by school days of the period, with "было").
- **По предметам**: one row per subject with time, sorted by time: subject stripe, name, a proportional bar in the subject colour, the time. Time only: no averages next to it (6.7).
- **Динамика**: the Динамика card's buckets (same `trendBuckets` as marks): one bar of total time per bucket, all subjects together, in the screen's accent (no split by subject: a stack of fifteen colours says nothing; the per-subject view is the subject screen), the time as h:mm under the date. No average line.
- **По дням**: every day of the period with sessions, newest first, "Вчера · 2 ч 18 мин"; rows: start and end time on the left, the subject bar (dotted for an estimate), subject, what for ("к уроку завтра", "повторение", "по отметкам «готово»", "внесено вручную"), and the duration, "≈ 46 мин" for estimates. A batch is a row without time: "4 отметки «готово» за 2 минуты · время не посчитано".
- A note explains the three sources in two sentences.


### 5.9 Школа (`#school`)

The selected child's school, for reference: a student screen with back, title "Школа", the StudentBar (switching the child switches everything) and a segmented control with two tabs, each shown only when the provider has what it needs. The regular week and the teachers are not repeated here: they are on the subject screen («О предмете», 5.4), and the actual week is in Расписание (5.5). Reached from Ещё (5.6) and from the holidays fact in Внимание; Расписание has no entry to it, so the timetable stays about lessons. Everything is the child's own (ux-principles D51): no other class's bells, no other grade's holidays.

- **Звонки** (`bellSchedule`): drawn like the timetable (5.5), so the two read the same. A day header "1 смена · пн–сб · 08:00–14:30 · 7 уроков", then one card with a row per lesson: the lesson number on the left axis, the accent bar, the time «08:00 – 08:45» in bold and its length under it. Between rows a quiet row with a dashed bar, "перемена 15 мин". The lesson or break in progress is highlighted like the current lesson in Расписание, with «сейчас». No subjects: the bells are the same every day, the lessons are not. A note: these are the bells of this child's class; other classes may have another shift.
- **Четверти** (`terms`): study and holidays never share a colour. Study is the accent (it follows the palette); holidays have their own fixed sunny colour (`color.*.holiday` in tokens.json: a pale fill for cards, a strong fill for the strip, a dark text colour) and a sun icon, in every palette and theme. On top, a card «Сейчас: I четверть · 1 сен – 31 окт · осталось 17 дней · до каникул 17 дней» with a strip of the school year from the first to the last day of term: terms as accent segments labelled I–IV, holidays as sunny segments, a line for today, months under it and a two-item legend (учёба, каникулы). Under it the year as a list of cards in date order: a term is a white card with the accent bar and its length in weeks; holidays are a sunny card with the sun and the length in days. Holidays inside a term (the extra February week of grades 1 and 2) are indented under that term. The current item has an outline and «идёт»; past items are faded. A remark the provider could not apply to the child's dates (graduating grades ending earlier) is a small italic line in that card; it is never turned into a fact or a date.

### 5.7 Student mode

Same screens, with: no student switcher, no sync controls, no family settings, notification rules limited to own marks and homework digest, the target calculator pinned on the overview. That calculator is **«Близко к цели»**, after Внимание on Главная: the running term's subjects whose goal (the family's per subject, 5.4, or the scale's default) is not reached yet and at most one step of the scale away, with at least three marks and no final posted, nearest first, two at most: «Алгебра 7,3 → 7,5: ещё 1 × 9» (the quickest plan, 6.2); a tap opens the subject. The title names the goal when the subjects share it («Близко к итогу 8»), otherwise «Близко к цели» with the goal on each row. It is advice: `overview.nearGoals` is null with guidance off, and only a student sees the card (a parent has the goal rows on the subject screens).

**Simple mode** (`users.ui_mode = 'simple'`, for the youngest): a student's own setting, switched by the student in Ещё («Простой режим») or by the admin or a parent on the child's screen in Семья (one switch per student login of that child, `PUT /api/family/members/:id/ui-mode`); it follows the student into every family they are in and changes only the student's own screens: a parent looking at the same child sees the full app. Главная shrinks to three blocks built from the same components: **Сегодня** with today's marks as large chips (a tap opens the subject; grades without marks have no such block), **«Не забыть»** (tag hits for the next 7 days; with tags, M6), and the next school day's lessons (the compact LessonRow), each with a large **«Готово»** button under it: the same `lesson_prep` tick as the ⋯ menu's first action, pressed when ready, a second press takes it back (the one exception to D41; the ⋯ menu stays). Every lesson row in simple mode carries that button, in Расписание too. No period control, no statistics, no trends, no hints. The other tabs stay but open in their plainest form: the mark feed without the filter row (and the stored filter filters nothing), subjects as a list by name without the order control.

## 6. Mark semantics

- `mark` string from e-schools is parsed into `values: number[]` (`"7/9"` becomes `[7, 9]`); each value is a separate mark in averages.
- Kinds: `SINGLE`, `DOUBLE` count; `ABSENT` becomes an absence; `PASS`, `NOT_PASS`, `EXEMPT`, `MASTERED`, `NOT_MASTERED`, `NOT_TAKEN` are shown as text chips and excluded from averages.
- Average = sum(values) / count(values), one decimal, half-up. Shown as "8.3". No marks: "нет".
- Bands come from the student's `GradingScale` (`docs/providers.md` section 5); the four roles are fixed, their ranges are not. For `by-10`: 1..4 `critical` (низкие, red), 5..6 `low` (средние, orange), 7..8 `good` (хорошие, soft green), 9..10 `top` (отличные, filled deep green). Colours for the roles live in `tokens.json`. Non-numeric kinds use the neutral `ok` style. Chips always show the raw mark; colour is never the only signal. Thresholds offered in filters and notification rules are the scale's `thresholds` ("ниже 5" and "ниже 7" for `by-10`). For scales where lower is better, "below" becomes "worse than" and the arrow logic flips through one helper, `compare(scale, a, b)`.
- Absences are attendance records, not marks: `by-eschools` derives them from the `ABSENT` mark kind, other systems have a register. Averages never see them.
- Everything in this section that mentions a number (0.3 for the trend, 1.0 for a work-type gap, "4 and below" for a low mark, 7.5 for an 8) is the `by-10` instance of a scale-relative rule; the table in `docs/providers.md` section 5.4 lists each element and its derivation. The web app reads the scale through one hook, `useScale(studentId)`, and components never see raw numbers without it.
- Trend arrow: average for the period minus average for the previous calendar period; threshold 0.3 for an arrow, otherwise flat. No arrow when the previous period has no marks (first quarter, first week of September).
- Work type labels from `api-spec.md` 7.3, shown only when the diary set a type; `null` shows no label at all. Real data says how little to expect: in six weeks of one Belarusian school the work type was set on 1 mark of 72 and the lesson type on 3 lessons of 306 (api-spec 7.3). So the interface never relies on either: nothing is laid out around a work type label, no placeholder stands in for a missing one, and what a lesson is (a test, a poem, a dictation) comes from the family's tags (6.3), which match topic and homework text and use the diary's lesson type only as one more way to match. The `workTypes` capability stays and its features (the work type label, the homework and tests guidance rules) appear when the data is there; they must read well when it almost never is (D50).
- Periods are calendar-aligned, never rolling windows, so the numbers match how school works. A period is a **kind** plus an **instance**:
  - Kinds, in this order: Неделя, Месяц, Четверть (when the provider has terms, named by `Term.kind`), Год. No "2 weeks": it was an invented unit nobody thinks in. Default kind: Неделя.
  - Instances: the current one and every earlier one of the same kind back to the start of the school year (for Год: every school year Marksy has). The **period navigator** sits as the first line of the body on Главная, Оценки, Предметы and Предмет: ‹ and › step to the previous or next instance, the label ("Эта неделя · 12–18 окт", "Прошлая неделя · 5–11 окт", "Неделя · 28 сен – 4 окт", "Этот месяц · октябрь", "I четверть", "2026/27 · 7 класс") opens a picker listing every instance with its number of marks. Choosing a kind resets to the current instance. The navigator is content, not a control strip, so Оценки keeps two strips. It is the one sticky element on the screen: when the body scrolls, the navigator stays pinned to the top (with its own background) while the header, the kind control and the filters scroll away, so flipping to last week never requires scrolling back up.
  - **Swipe** does the same as ‹ ›: a horizontal swipe over the body moves one instance, finger to the right = previous (older), to the left = next (newer), like turning the pages of a calendar, with a short slide of the content in that direction. The gesture is recognised only when the horizontal travel is at least 48 px and the vertical drift is less than half of it; anything else is a scroll or a tap and is untouched. A swipe that starts inside a horizontally scrolling strip (filter chips, segmented controls) or while a sheet is open is ignored, and the click the browser fires after a swipe is swallowed, so a swipe never also opens the row under the finger. Nothing happens at the edges (no instance before the school year, nothing after the current one).
  - Ranges: a week runs from the first weekday of the calendar (manifest) to its end, the current week to today; a month from the 1st; a term from its start in `terms`; a year from the school year start. The current instance of any kind ends today.
  - Comparison: always the instance **right before the selected one**, whatever is selected: this week with last week, last week with the one before it, October with September, 2026/27 with 2025/26. The hint names it ("было 8.4 · прошлая неделя", "было 8.2 · 28 сен – 4 окт").
  - The API takes `period=week|month|quarter|year&offset=N` and resolves the dates on the server in the account's timezone; the response carries `from` and `to` so the UI can label the instance.

### 6.1 Comparison model ("better or worse than before")

The same question is answered at every level with one rule: compare the current value with the same kind of value for the previous calendar unit, and show the direction, the previous value and the delta.

| Level | Current value | Compared with | Where it shows |
|---|---|---|---|
| Week, month | average of marks in the instance | average of the instance before it | Overview tiles, movers, Subjects (Период), subject hero |
| Quarter (running) | running average (italic decimal) | final mark of the previous quarter, or its average if the final mark is not in the diary | Оценки → Итоги (Четверти), subject strip |
| Quarter (finished) | final mark from `final/whole` | final mark of the previous quarter | Оценки → Итоги (Четверти) |
| Year (running) | running average of the year (italic decimal) | year-final mark of the previous school year | Оценки → Итоги (Годы) |
| Year (finished) | year-final mark | year-final mark of the previous school year | Оценки → Итоги (Годы) |

- **Any past instance** is reachable through the navigator and the picker (section 6), so there is no separate custom-range control; a parent looks at "the week before the test" by stepping back to it.
- Threshold for an arrow is 0.3; below that the comparison is "flat" and shown as →.
- **Movers.** Core (`movers()` in `packages/core/src/marks/stats.ts`) returns every subject whose average has a trend (up or down, not flat) for the selected instance against the one before it, with the change, sorted by its absolute size. Limits belong to the screen, not to core: Внимание shows up to three drops (only subjects with at least two marks in the period) and the one biggest rise; Предметы uses the same comparison for its sorts «Сильнее всего упали» and «Сильнее всего выросли», where subjects without a change sort last.
- Final marks are integers on the 10-point scale; averages have one decimal. When an integer is compared with an average the delta is still shown with one decimal.
- **Missing data is a state, never a zero** (D23). An average over no marks is `null`, shown as "—", and an arrow needs two real values; a count of 0 against 15 on a Monday morning is not a drop. The four cases and their copy, identical in StatBlock, SubjectRow, the subject hero and the picker cells:

  | Current period | Previous period | Value | Arrow | Hint |
  |---|---|---|---|---|
  | has marks | has marks | `7.3` | yes | `было 8.4 · прошлая неделя` |
  | has marks | exists, no marks | `7.3` | no | `прошлая неделя: оценок не было` (StatBlock); SubjectRow shows nothing under the value |
  | has marks | does not exist | `7.3` | no | `I четверть, сравнить не с чем` / `до начала учебного года` |
  | no marks | has marks | `—` | no | `пока нет оценок · было 8.4`; band columns show `0` with `было N` only where either count is non-zero |
  | no marks | no marks | `—` | no | `оценок нет · прошлая неделя: тоже` |

  "Does not exist" is decided from the calendar (`Term` list and the school year start), not from the data: the first term has no previous term, the first week of September has nothing before it. The Внимание rows ("средний падает") require both averages and at least two marks behind the current one, so an empty week never produces a warning. The Subjects list explains the two silent cases in its footer note once, not per row.
- Multi-year data: Marksy keeps every school year it has ever synced. The e-schools API appears to serve only the current school year (`/education/diary/school_year` returns one object); whether past years can be requested is an open check. For years before Marksy existed, admin and parents can enter year-final marks (and optionally quarter finals) by hand from the paper report card; these rows are marked `source = manual` and shown with a small "введено вручную" hint. The year itself is a `school_years` row with `source = manual` whose label and dates are the current year's, shifted back ("2026-2027" gives "2024-2025"), so no calendar is written into code; a year the diary sends is never typed over (409 `year_from_diary`); the values must be the child's current scale's (a past year on another scale is entered on today's), at most eleven years back. Year finals only for now; past term finals are not typed in.
- Subjects across years are matched by normalised name within the same student. When a subject splits or renames (grade 6 "Математика" becomes "Алгебра" and "Геометрия" in grade 7) the rows stay separate; the admin can link a past subject to a current one in Family settings (stored in `subject_links`), after which the Годы table shows them on one row.

### 6.2 Guidance rules

Marksy should tell a parent or a child what to do next, not only what happened. Guidance is a deterministic rule engine of pure functions in `packages/core/src/guidance` (`subjectHints`, `lessonHint`, `topHints`), used by the API and by notifications alike. Every hint is `{rule, severity, fact, advice?}`: a severity (`critical`, `low`, `ok`, `good`), the **fact** with the numbers behind it, so nobody has to trust it blindly, and the optional **advice**, both as i18n keys with parameters (raw scale values, formatted by the UI through the scale). With `settings.guidance` off, `stripAdvice()` removes the advice and the facts stay. Rules are evaluated per student on the data already in the database; nothing is fetched for them.

"Is this a test" is never decided here: the input lesson carries `isTest`, which the server sets when the lesson has the family's tag «Контрольная» (6.3). The diary's lesson type alone does not make a test; it only marks lab and practical work, where the provider has `lessonTypes`.

**Quarter goal (subject screen).** The final mark for a term is derived with the scale's `finalRule`; for `by-10` it is assumed to be the average rounded half up (7.5 gives 8). This is an assumption until verified against real final marks; it is labelled as such in the UI. The goal picker offers the scale's `goalTargets` (7, 8, 9 for `by-10`). The card says what final is currently projected, how many marks of which value are needed to reach the chosen final (`targetPlan(scale, sum, count, neededAverage(scale, final))`, 7.5 for an 8), or, if already reached, the lowest next mark that keeps it (`keepMark`). When the scale's `finalRule` cannot be inverted (`teacher-decides`, `unknown`), `neededAverage` is `null` and the goal card is not shown. Student mode pins the same card on Overview for the two subjects closest to the next final.

**Subject hints ("Обратить внимание" on the subject screen).** Evaluated on the current quarter, shown in severity order, at most five:

Each rule declares the capabilities it needs (`requires`) and is skipped when the provider lacks them: the homework and test gap rules need `workTypes`, the comment quote needs `comments`, the absence rule needs `attendance`, the upcoming-test rule needs `lessonTypes` or a watch rule.

| Rule | Condition | Hint |
|---|---|---|
| Upcoming test | a lesson in this subject within 7 days that carries the tag «Контрольная» (`isTest`), or a lab lesson where the provider has `lessonTypes` | "Контрольная вт, 20 октября. Повторить темы последних уроков: …" (topics of the last two lessons) |
| Low mark to fix | a mark of 4 or lower in the last 14 days | "Разобрать: <teacher's comment>" or "Разобрать работу на 3", with the work type and date |
| Homework is the weak spot | 2+ homework marks and 2+ classwork marks, classwork average higher by 1.0 or more | "Слабое место: домашние задания. За д/з 6.0, за работу на уроке 8.2" |
| Tests go worse than daily work | 2+ test marks, 2+ other marks, others higher by 1.0 or more | "Контрольные идут хуже текущих оценок. Готовиться заранее" |
| Downward streak | the last three numeric marks are all below the quarter average | "Три последние оценки ниже среднего: 6, 5, 6 при среднем 7.4" |
| Absence to catch up | an ABSENT mark in the last 14 days | "Пропуск 15 октября. Уточнить тему урока и домашнее задание" |
| Nothing to do | none of the above | "Всё идёт ровно. Оценки держатся около 8.4" |

**Schedule hints.** For each lesson today or later, at most one hint, first match wins; the day card "Обратить внимание" lists the top three by severity:

| Rule | Hint |
|---|---|
| The lesson carries the tag «Контрольная» (`isTest`) | "Контрольная. Средний по предмету 5.5, последняя оценка 3. Повторить то, что не получилось" |
| Lesson type LABORATORY_WORK or PRACTICAL_WORK | "Оценку за такую работу ставят почти всегда. Подготовить тетрадь и повторить тему" |
| Last mark in the subject is 4 or lower and has a comment | "В прошлый раз 3: <comment>" |
| Subject quarter average below 7 and homework is set | "Предмет в зоне риска (средний 5.5). Сделать д/з особенно внимательно" |
| Homework is set and the homework average in the subject is below 7 | "За д/з по этому предмету средний 6.0: домашние здесь проверяют и оценивают" |

### 6.3 Tags (what kind of work a lesson needs)

The problem: a child sees "выучить стихотворение" in Thursday's homework, the poem is due Tuesday, and nothing happens until Monday night. Tests are the same: many schools, including the one Marksy was built for, mark a test only in the topic ("Контрольная работа «Системы уравнений»"), not as a lesson type. Teachers phrase these things in free text ("верш", "стихотворение", "наизусть", "на памяць", "принести", "контрольная"), differently per school and language, so what counts as a poem or a test is the family's vocabulary.

**Two things, kept apart.** A **tag** (`LessonTag`, "тег") says *what to find in the timetable and how to show it*. A **notification rule** of kind "Урок с тегом" (section 11) says *whom to tell and when*. A tag never sends anything; a notification rule never decides what a poem is. One tag can be used by several people's rules with different timing, and a parent can switch a reminder off without the timetable losing the tag.

**Tag.** `lesson_tags`: name ("Стихотворение"), icon from the app's line icon set, tone (`normal` → accent bar, `important` → orange bar, like a test), keyword stems (case-insensitive substrings, so "стих" matches "стихотворение" and "стихи"), where to look (topic, homework), optionally the diary's lesson types (`test`, `lab`) where the provider has `lessonTypes`, subjects (none = all), students (all or one), `prep_days` (how long this kind of work takes to prepare, or none), on/off, who created it. Presets per interface language ship in `packages/core/src/tags/presets/<lang>.ts` and are copied into the family on connect, then edited freely: for Russian and Belarusian "Стихотворение" (стих, наизусть, верш, на памяць, poem, by heart; 4 days), "Контрольная" (контрольн, кантрольн, к/р, тест, plus lesson type test; important; 3 days), "Сочинение" (сочинени, изложени, пераказ, сачыненн; 3 days), "Принести" (принести, прынес, взять с собой; homework only; no prep), "Проект" (off; 7 days). Students may add tags for themselves; parents edit the family's.

**Where a tag lands.** A match in the topic, or the lesson type, puts the tag on that lesson. A match in the homework puts it on the next lesson of the same subject that takes place (a cancelled lesson is skipped, 5.5), because that is when the diary's homework is checked; a provider that knows real due dates sets `Lesson.homeworkDueDate` and it wins (`docs/providers.md`, manifest `homeworkSemantics`). The lesson where the homework was set gets a quiet note "Задали: стихотворение, к вт, 20 октября".

**Hit.** `lesson_tag_hits` are materialised at sync and recomputed when a tag changes: tag, student, source lesson, due lesson, matched field, snippet (the matched text), created_at, removed_at; unique per tag and due lesson. Days left and urgency (`critical` 0 to 1 days, `low` 2 days, `ok` more) are computed on read. There is no separate done tick on a hit: the lesson's own "готово" (6.5) is the one mark of readiness, so a poem learned is the Tuesday literature lesson marked ready.

**Preparation.** `prep_days` decides when a hit starts to show in Внимание on Главная (the timetable's block is about the selected range only, 5.5): from `prep_days` before the due lesson (the day before when the tag has none). A hit is a fact, not advice: what the app can honestly say is that a lesson carries a tag, which lesson it is, how far away, and the diary's text that matched. It renders as **"Тег · Предмет"** with **"завтра, 2 урок · тема: …"** or **"вт, 20 окт, 4 урок · через 5 дней · задано чт, 15 окт: …"**. The matched text is quoted as the diary wrote it (abbreviations like "К/р №2", other languages, the teacher's own quotes), cut at 70 characters. No generated tips ("начать в выходные", "разбить на подходы"): they read nicely in a mockup and would be noise on real data.

**Surfaces.** The schedule: a пометка of kind **тег** on the due lesson (tag icon, bold name, for a homework match the text and "(задали 14 окт)"), "Задали: …" on the setting lesson, the timetable's "Обратить внимание" for the selected day or week; the home widget: the тег note, the same as in Расписание; Внимание and Events; the subject's "Обратить внимание"; the day header counts tests from the tag "Контрольная"; the Теги screen (tags and current hits); the mark filter on Оценки, Предметы and Предмет (5.3), where a mark carries its lesson's tags; the parent picker card (the nearest tagged lesson still ahead). Only lessons still ahead produce hits for planning surfaces: a lesson that ended today is not "скоро". Every place that used to ask "is this a test?" asks whether the lesson carries the tag "Контрольная"; the diary's lesson type is only one way for that tag to match.

**Not in v1.** Matching attachments' text, recurring tags by weekday, regular expressions. If a family needs them, the tag object has room.

**Overview (Внимание) and the Внимание screen** reuse the same facts as notifications: tests within 3 days, marks the family's rules call low (default: the critical band) in the last 7 days, absences, changed or removed marks, an account that needs a new password.

### 6.5 Preparation checklist (what is ready)

**The tick is per lesson, not per homework item.** The diary often shows no topic and no homework for a lesson although the teacher gave one (entered late, said aloud, written on the board), so a checklist built on diary homework would miss half of what the child actually has to do. Every upcoming lesson on the timetable therefore carries one tick, "готово": the child marks that they are prepared for that lesson, whatever the diary says. A parent sees the tick and may tick or untick too; the card remembers who and when ("готово · Милена, 17:40", "готово · папа, 19:12"). The tick never touches the diary (the collector is read-only); it is Marksy's own shared state, the same on every phone in the family.

- **Where.** The first action in the ⋯ menu of every lesson that has not passed yet (5.5), so a lesson with or without topic or homework is marked the same way; a marked lesson shows the пометка "Готово · кто, когда" first under it (check icon, green bar, like a tag). In the home widget "Готово" is the first item of the tag line, in green. In the day header: "готово 2 из 5". Tag hits have no tick of their own (6.3): a poem learned is Tuesday's literature lesson marked ready.
- **Homework the diary does not have.** The ⋯ menu of an upcoming lesson without homework offers **"Добавить задание"** (pen icon). It opens a sheet with one text field; anyone in the family, child or parent, types what was actually assigned and saves. The item is then shown in the lesson like the diary's homework, and the menu action becomes **"Изменить задание"**, which reopens the same sheet with the text filled in, a "Сохранить" button and "Удалить задание". Who added it is stored and not displayed; an edit keeps the original author and is not attributed. Only manual items can be edited; the diary's homework is read-only. When the diary later delivers the homework, both are shown; nothing is overwritten. A passed lesson has no menu, so its homework can no longer be added or edited.
- **Who may.** The student for their own lessons, every parent and the admin for any student they follow. A tick by a parent is shown as such; an untick is the lesson going back to open (the history of ticks is kept in `lesson_prep_events` for 180 days and is not shown).
- **Notifications.** `homework_digest` at 19:00 lists tomorrow's lessons with their ticks and what is still open ("Не отмечено: Алгебра, Английский"); parents may switch on "к 20:00 не всё отмечено" (event `prep_open`, 6.4). Nothing nags the child beyond the digest they chose.
- **What a tick is not.** Not a mark, not a promise, not surveillance: the family's shared list, in neutral copy ("готово", never "молодец" or "не сделано!").
- **Model.** `lesson_prep(student_id, lesson_id, done_at, done_by)`, one row per ticked lesson; `lesson_prep_events(lesson_id, student_id, kind done|undone, by, at)`. `homework_items` gains `source: diary | manual`, `created_by`, and manual items have no `external_id`.
- **API.** `PUT /api/students/:id/lessons/:lessonId/prep` and `DELETE …/prep` (returns `{done, doneBy, doneAt}`); `POST /api/students/:id/lessons/:lessonId/homework {text}` for a manual item; the lessons endpoint carries `prep` and `homework[]` (with `source`) so the card needs no second call.

### 6.6 Subject colours

Every subject has a colour of its own, chosen by the child or a parent from a palette of twelve (`tokens.json → color.subject`: red, orange, yellow, lime, green, teal, sky, blue, violet, purple, pink, grey) or left on "авто", a stable hue derived from the subject name. The choice is per subject per student and shared by the whole family: the parent's and the child's phones show the same colours. Picker: **"Настройки предмета"** at the top of the subject screen (5.4) and the list in Ещё → Оформление → Цвета предметов (5.6a); a bottom sheet with the twelve swatches and "Авто" (D32).

Where the colour appears: the **side stripe** of every row that is about one subject, a 3 px square bar like the timetable's subject bar (every side stripe in the app has this one shape, the severity stripes of Внимание, События, "С кого начнём?" and "Обратить внимание" included; the colour says what it is about): the timetable's subject bar, the home widget "Завтра", "Оценки сегодня" on Главная, the day groups in Оценки and the subject list in Предметы; and on the subject screen the tinted header and the screen's controls (5.4, D45). Внимание and Events keep their stripes in severity colours: a stripe there says how serious, a stripe on a subject or mark row says which subject. Where it never appears: mark chips, averages, band columns, severity stripes and arrows, which keep the colours of meaning; the lesson type badge and the test edge keep orange. The subject colour is wayfinding ("the physics one"), the band colour is judgement, and the two never swap roles (D36).

Model: `subject_colors(student_id, subject_id, color, set_by, updated_at)`, `color` a palette key or null for auto; subjects matched across years by name (6.1) keep their colour. API: `PUT /api/students/:id/subjects/:subjectId/color {color|null}`, student (own), parent, admin; the subjects and lessons endpoints carry `color`.

### 6.7 Study time (занятия)

The question: how long does the child actually work, per day and per subject, over the same periods as everything else. Time only, for now: it is not compared with marks (see the end of this section).

**Session.** `study_sessions`: student, subject (nullable: "без предмета"), the lesson it prepares for (nullable), kind (`homework` for a lesson, `review` otherwise), `started_at`, `ended_at`, `active_sec` (without pauses), `source` (`timer` | `inferred` | `manual`), who started it, note. `study_session_events` (start, pause, resume, stop) are kept 180 days. One session runs at a time per student: starting another pauses the running one.

**The timer.** Started from the ⋯ menu of any upcoming lesson, first action **"Заниматься"** (over "Отметить «готово»"), which binds the session to the subject and the lesson; or from **"Заниматься"** on Главная and on the Занятия screen, which opens a two-step sheet, so a child can start work for any lesson ahead, not only tomorrow's. Step one: **Скоро** (up to four lessons worth starting now: the next school day's lessons not yet ready, then lessons further ahead whose tag is already inside its prep days, e.g. a test on Tuesday), then **Предмет**: every subject as a row with its stripe and "следующий урок: вт, 20 окт", sorted by that next lesson, then "Без предмета". Step two, after a subject (with a back arrow): **"Повторение, без урока"** first, then **"К уроку · ближайшие 2 недели"**: every lesson of the subject still ahead in that window with day, number, homework or topic, its tags, and "готово" if already marked. One tap on any row starts the timer. While a session runs a **timer bar** (`StudyBar`) sits above the tab bar on every screen like a mini-player: green dot, subject, "к уроку завтра · 12:34", pause / resume, and ■ to finish. **Finishing a session never marks the lesson ready**: a child stops for a break, for dinner or for the day without being done, so "готово" stays its own tap in the lesson menu (the menu says "Закончить занятие · время запишется, «готово» отдельно"). The other way round holds: marking a lesson ready while its session runs stops the session. A lesson may collect several sessions over an evening. Paused time is not counted. A stopped session shorter than a minute is kept as one minute.

**Estimates when the timer was not used.** Children forget the timer, so the evening's "готово" ticks are turned into estimates, honestly labelled:
- ticks of one day sorted by time; a gap between two consecutive ticks of **3 to 90 minutes** becomes an inferred session for the subject of the later tick, from the earlier tick to the later one, `source = inferred`, shown everywhere with **≈** and a dotted subject bar;
- the first tick of the evening starts from the last app open if that was within 90 minutes, otherwise it gets no time;
- a gap under 3 minutes is a **batch**: no time is estimated, the fact is shown as it is ("4 отметки «готово» за 2 минуты · время не посчитано"), with no judgement in the copy;
- a gap over 90 minutes is a break, not studying;
- where a timer session overlaps the gap, no estimate is made: the timer wins.
Estimates are recomputed from `lesson_prep_events` after every tick (and nightly) and stored as rows with `source = inferred`, replaced on recompute. They count in the totals; the filter **Только таймер** on the Занятия screen leaves them out.

**Manual sessions.** A parent or the child may add a session after the fact ("занимался 40 минут, таймер забыл") or delete one; `created_by` is stored, not shown.

**Surfaces.** Главная: the card **"Занятия сегодня"** (total, per-subject chips with ≈ where estimated, "Заниматься" or "Закончить · Алгебра" while running, "Все занятия"). The subject screen: the card **"Занятия"** at the very end, under its own divider after Четверть: time for the period with "было", the same chart for this subject only (bars in the subject colour), the last three sessions, "Все занятия". The Занятия screen (5.8). The homework digest adds "занимался 1 ч 20 мин". An optional rule `study_long` reminds about a break (11).

**Who sees what.** Parents see everything; the child sees their own sessions and totals. Copy is neutral throughout: no "мало", no "лень", no praise; the numbers and the batches speak.

**Not now: time against marks.** Comparing study time with marks (averages next to time, an average line over the time chart, correlation) is deliberately left out. The hard part is attribution: a child prepares this week for lessons this week and for lessons next week, so time grouped by the day it was spent does not line up with the marks of that period. When this comes back, each session gets a second date, the lesson it prepares for (known from the timer or the tick; for review without a lesson, the subject's next lesson, flagged as approximate), and the comparison is made per lesson: the mark at a lesson against the time spent preparing for that lesson, a test against all sessions before it.

### 6.4 Who decides what: provider, scale, family

Three layers, never mixed. The provider says **what exists** (lessons, work types, comments, attendance, terms, finals: the capabilities). The grading scale says **how marks are shown and compared** (range, direction, bands, formatting, how averages and finals are computed). The family's **rules** say **what matters to them**: which values trigger an alert, how far ahead to warn, which tags exist and which of them notify, what counts as a drop. Rules have defaults derived from the scale so the app is useful on day one, and they are editable so a family that considers a 6 a problem is not stuck with the scale's idea of "low".

| Question | Decided by | Example on by-10 |
|---|---|---|
| Can a mark have a work type? a comment? | provider capability | yes, yes |
| What colour is an 8? | scale bands | good (green) |
| Which quick filters exist in the feed? | scale (band edges) | ниже 5, ниже 7 |
| Which mark sends a notification? | family alert rule, default from scale threshold | worse than 5, parent on; worse than 7, off |
| After how many lessons without a mark a subject is "давно без оценки" | family rule `callAfter` per child, default 4 lessons | 4 |
| What is a "low mark" in Внимание and hints? | family rule `lowMark` per child, default: the child's critical band | 4 and below |
| How many days ahead does a poem show in Внимание? | family tag `prep_days` | 4 |
| When to remind about a poem or a test? | user's notification rule "Урок с тегом" (moments) | as soon as it appears, the evening before, Saturday list |
| What counts as a drop worth a row? | family rule `dropStep` per child, default 0.3 of a by-10 point scaled to the child's range, on at least 2 marks | 0.3 |
| What is the goal for a subject? | family or student `goalTargets` choice, options from the scale | итог 8 |
| How is the term final computed? | scale `finalRule` (an assumption until verified) | round half up |

Alert rules are stored in `alert_rules` (user, event, condition JSON, scope JSON, when, enabled); the defaults are created per user from the scale when they join and are ordinary rules afterwards: a user can delete every default and compose their own. There is no fixed number of "below" rules and no fixed direction: a rule is an event plus a condition, and both good news ("оценка 9–10") and bad news are expressed the same way. For `average` the comparison period is part of the condition and is spelled out on screen ("за неделю против прошлой недели"), never implied. The `lowMark`, `dropStep` and `callAfter` rules are the family's but set **per child** (`family_students.settings`), because they are numbers of one scale and two children of a family may have different scales; they are edited from the same screen under "Что считать проблемой", one block per child. An alert rule scoped to all children whose scales differ is written in bands («в красной зоне», «в лучшей зоне») instead of values; the editor offers values only when every child in the scope has the same scale. Default rules are created per child, from that child's scale.

**Notifications** map to the same rules: `tag` with the tag "Контрольная" is the upcoming-test rule, `below` is the low-mark rule, `homework_digest` includes the schedule hints for tomorrow, `weekly_summary` includes the subject hints with severity `low` or `critical`.

Later rules worth adding once there is data: "the subject has had no marks for three weeks, a поll or test is likely", "the quarter ends in N days and these subjects are within 0.2 of the next final", comparison with the previous year's final ("last year 8, now heading for 6").

## 7. Accounts, authentication, tenancy

### 7.1 Model

```
user    n..n families         via memberships (role admin | parent | student per family); one login per person
family  1..n diary_accounts   credentials the family connected, any providers, several allowed
family  n..n students         via family_students: the children this family follows (status active | suspended)
student 1..n student_sources  every diary account that shows this child; the collector reads through one at a time
user    n..n students         via user_student_access, inside one family (admin and parents: all its children by default; student: self)
family  1..n invites          one-time codes to add members
```

Marksy logins are independent from the diaries. A Marksy username is unique per installation (`users.login`), chosen by the member when accepting an invite. Passwords are hashed with argon2id.

**What belongs to the child and what to the family** (ux-principles D54):

| Belongs to the child, shared by every family that follows them | Belongs to one family |
|---|---|
| everything the diary says: school years, terms, holidays, subjects, lessons, marks and their history, attendance, homework from the diary, behaviour, finals, bells, the regular week | members, roles, invites, join requests |
| the child's own work: «готово» ticks, study sessions, homework added by hand, «Урока не будет», subject colours, subject goals, the avatar | diary accounts and their sync log |
| sync coverage (a week is collected once, whoever's login fetched it) | tags and tag hits, alert rules, notifications, the inbox |
| | settings, including the per-child thresholds `lowMark`, `dropStep`, `callAfter` (`family_students.settings`) |

- **Access comes from the diary.** A family reaches a child only through an `active` `family_students` row, and a row is active only while at least one of the family's own diary accounts shows the child (`student_sources`, confirmed by `getAccount()` on that account's logins). Marksy adds no access the diary did not give: if a login loses the child (a school or a court changed who may see the diary), that family's link becomes `suspended`, the child disappears from its pickers and their data is not served to it until a login shows the child again.
- **Authors across families.** A shared row records who made it (`done_by`, `created_by`, `set_by`). The name is shown only to the author's own family; another family sees the act without the name: «отмечено в другой семье». The student's own acts are shown as the student's in every family.
- **The child as a user.** A child followed by two families has one Marksy login and a `student` membership in each; they see their own diary and work, the tags of both families, and their own notification rules (rules are per user). Adults of one family never see the other family's members, tags, rules, notifications or settings.
- **Leaving.** «Перестать следить» depends on whether one of the family's own logins still shows the child:
  - it does: the link becomes `stopped`. The child's data stays; «Следить снова» makes the link `active` again with the whole history. The collector leaves a `stopped` link alone: it never re-links it, never notifies the other family about it and never reads the child through this family's logins (if another family's login shows the child, the active source moves there). The child is not in this family's pickers or the student switcher; Семья shows the child with «Следить снова» and «Удалить данные». «Удалить данные» is offered only when no other family follows the child, after a typed confirmation, and deletes the link, which takes the child and the child's data with it.
  - it does not: the link is deleted; the child and the child's data go with the last link (14.1).
- **Notification rules per child.** Rules are per user and per child (6.4, D53): the default set of section 11 is created for every child the user may see, on that child's scale, when the user joins a family and, for every member, when a child comes into the family (a new diary, «Следить из своей семьи», a child appearing in a connected account). A student gets rules about themselves only.

### 7.2 Connecting a diary (creates the family, or adds to it)

1. Signed out, the first parent picks the provider, submits the credentials its manifest asks for (login and password for `by-eschools`) and the role, plus the Marksy login and password they want for themselves; this creates the family. Signed in, a parent of a family does the same from Семья → «Добавить дневник» without the Marksy fields; the account is added to the current family (a child at another school, possibly on another provider).
2. Backend calls `provider.login()` once through the shared HTTP client (same throttling, allow-list and login-interval rules; this counts as that hour's login for the account), then `provider.getAccount()`. The first sync goes on in this same login at once (10.4: a new account runs at once and backfills): standing weeks, then the history within the request cap, no second login; the answer to the connect does not wait for it, the app shows «загружаем» from `/api/sync/status`. A child the login shows whom another family follows is not read or linked until the parent chooses (step 3).
3. If a `diary_accounts` row with this `(provider_id, external_user_id)` already exists, refuse with "this diary is already connected, ask the family admin for an invite". Otherwise, for every child of the account, look up `student_identities (provider_id, external_id)`:
   - **new child**: create the student, the identity, a `student_sources` row for this account and an active `family_students` row;
   - **child already in this family** (through another of its accounts): only add the `student_sources` row (a second source; the collector still reads the child once);
   - **child followed by another family**: ask the parent, once per such child: «Присоединиться к семье …» (a join request the admin of that family approves, after which this login becomes a second diary account of that family, as before) or «Следить из своей семьи» (this family follows the same child: `student_sources` for this account and an active `family_students` row; no approval is asked, because the diary already gives this login access to the child, and the other family's admin gets one notice without names, «За Миленой теперь следит ещё одна семья»). There is never a second copy of the child. The same holds later: when a login already connected starts to show a child its family does not follow yet (a second parent added to the child at school), the collector links it as «Следить из своей семьи» and the other family's admins get the same one notice; «Присоединиться» is offered only here, at connect.
4. Store the credentials object in `diary_accounts.credentials_enc`, encrypted with AES-256-GCM using `CREDENTIALS_KEY` from `.env`.
5. Signed out: create the `admin` user and membership with access to all children, then issue a session: httpOnly, Secure, SameSite=Lax cookie with a random id stored in `sessions` (30 days, sliding). No JWT needed for a first-party PWA.
6. If the diary password changes later, the collector marks the account `auth_failed` after one failed login, stops trying, and notifies the admin; the admin re-enters the password in Family. A child who also has another source keeps being collected through it meanwhile.

### 7.3 Inviting members

1. Admin (or a parent, if allowed) taps "Пригласить", picks role and students, gets a 6-character code and a link (`/join/<code>`), valid 48 hours, single use.
2. The invitee opens the link or enters the code, sets display name, Marksy login and password; the backend creates the `users` row, the `memberships` row with the prepared role and `user_student_access`. Someone who already has a Marksy login (a child already in the other family, a grandparent of two households) signs in instead and gets a second membership; one person never needs two logins.
3. Admin can later change role, student access, reset a member's password (one-time code again) or remove the member.

### 7.4 Later logins

Marksy login and password only; verified against `users.password_hash`. e-schools is never called at login time after the diary is connected.

### 7.5 Student e-schools login (to verify)

`api-spec.md` documents only the parent endpoint. The bundle has about 640 endpoints; the probe script should look for `/auth/login/student` (or `/auth/login/pupil`) and the student variant of `/admin/auth/me`. It matters only for families where no parent login exists; the common case is a family connected through the parent login, with children using Marksy invites. Until verified, the UI keeps the role toggle on "Подключить дневник" but the backend returns a clear "student diary login is not supported yet" error.

### 7.6 Authorization

- Every `/api/students/:id/*` route checks that the user is a member of the current family, that the family's `family_students` link to the child is active, and `user_student_access`. Family-owned rows are filtered by the current family; child-owned rows by the child.
- `POST /api/sync/run`, `POST /api/sync/rescan`: `admin` and `parent`. Family management, invites, diary accounts: `admin` (parents may invite if the admin enables it; default on).
- All API routes except `/api/auth/login`, `/api/auth/connect`, `/api/invites/:code`, `/api/health` and `/api/docs` require a session.
- Rate limits: login 5 failed tries per 15 minutes per IP and per login (in memory: one process); sync and rescan share the login budget of the diary account (manifest `minLoginIntervalMinutes`) (section 10).
- Sessions: a random token in an httpOnly, SameSite=Lax cookie (`Secure` behind https), only its SHA-256 in `sessions.token_hash`, 30 days sliding, the current family on the session; invite codes as their HMAC under `SESSION_SECRET`. An unknown login and a wrong password get the same answer; an attempt is counted before the password is checked.
- Connecting a diary is a login to the diary: 5 tries per 15 minutes per address and per diary login; a diary login connected already is refused before the diary is called, and whether a Marksy login is taken is said only to someone the diary accepted. Invite codes: 5 lookups per 15 minutes per address. «Присоединиться» (handing the family's diary login to another family) is the admin's, and an approval moves nothing once the asker is no longer that family's admin.

## 8. Data model (PostgreSQL 16, Drizzle)

Every row has a Marksy `uuid` primary key (`gen_random_uuid()`); ids from the source system are kept in `external_id` with a unique index on `(provider_id, external_id)` (per student where the system scopes ids that way), because another provider may use integers or composite keys. All timestamps `timestamptz`. Family-owned tables carry `family_id` for isolation and indexes; child-owned tables (the diary and the child's own work, 7.1) carry `student_id` and no `family_id`, and are reached through `family_students`. Tables that mirror the source carry `provider_id`.

```
families            id, name, created_at, settings (jsonb: parents_can_invite, guidance, retention_years),
                    consent_version, consent_at, consent_by
users               id, login (unique), display_name, timezone (IANA, for notification times),
                    locale (ru|be|uk|kk|en|pl|de|es|pt|fr|nl|ro), ui_mode (full|simple),
                    settings (jsonb: guidance, appearance {theme light|dark|system, background color|wallpaper, palette,
                    wallpaper (built-in id | own), opacity 10..100, font manrope|nunito|ptsans|inter|rubik}),
                    password_hash, created_at, last_login_at
user_files          id, user_id, kind (wallpaper), mime, bytes, width, height, storage_key, created_at   (5.6a; one
                    wallpaper per user, replaced on upload; served only to its owner)
memberships         user_id, family_id, role (admin|parent|student), created_at, PK(user_id, family_id)
family_students     family_id, student_id, status (active|suspended|stopped: 7.1 «Перестать следить»), settings (jsonb: low_mark, drop_step, call_after),
                    linked_at, linked_by, PK(family_id, student_id)      (the children a family follows, 7.1)
student_identities  provider_id, external_id, student_id, UNIQUE(provider_id, external_id)   (one child, found at connect)
student_sources     student_id, diary_account_id, external_id, last_seen_at (the last getAccount() that listed the child),
                    active (the account the collector reads this child through now), PK(student_id, diary_account_id)
join_requests       id, family_id, from_user_id, diary_account_id, status, created_at, decided_by
sessions            id, token_hash (SHA-256 of the cookie token), user_id, family_id (the current family),
                    expires_at, created_at, user_agent
invites             code (SHA-256 of the code, unique), family_id, created_by, role, student_ids (uuid[]), expires_at,
                    used_by, used_at
diary_accounts      id, family_id, provider_id, tenant (jsonb: url | code | id, nullable), role (parent|student),
                    label (login or email shown in the UI), credentials_enc (bytea, encrypted JSON of the manifest's auth fields),
                    external_user_id, status (ok|auth_failed|blocked|needs_2fa), last_ok_at,
                    last_login_at, last_error, created_at
students            id, provider_id, external_id, timezone (the school's IANA zone: lesson dates and the sync window),
                    full_name, given_name, family_name, display_name, school_id, school_label, class_external_id (the provider's
                    class id, StudentRef.classExternalId), class_label, grade, grade_label, grading_scale_id (the
                    current year's, see student_years), is_active, avatar (jsonb: traits or {photo: storage key}), created_at
users               + avatar (jsonb), same shape
user_student_access user_id, family_id, student_id, PK(user_id, family_id, student_id)

school_years        id, student_id, provider_id, external_id, label, start_date, end_date,
                    source (api|manual)
terms               id, school_year_id, external_id, kind (quarter|trimester|semester|other),
                    index, label, start_date, end_date, note (the system's remark, shown as it is)
holidays            id, school_year_id, start_date, end_date, note
subjects            id, student_id, school_year_id, provider_id, external_id, name, name_norm
subject_links       student_id, from_subject_id, to_subject_id      (manual mapping across years)
subject_colors      student_id, subject_id, color (palette key, null = auto), set_by (user_id), updated_at   (6.6; the child's, shared)
subject_goals       student_id, subject_id, term_goal (any value of the scale, null = без цели), set_by (user_id), updated_at   (5.4)
student_years       student_id, school_year_id, class_label, grade, grading_scale_id (a built-in scale id, "manifest" for
                    an inline manifest scale, null = a year without marks, ux-principles D49)
bell_schedules      id, student_id, school_year_id, external_id, label, days (int[]), periods (jsonb: [{slot, start,
                    end}]), valid_from, valid_to, fetched_at      (the student's class bells; providers.md BellSchedule)
week_templates      id, student_id, term_id (nullable = whole year), cycle_weeks, entries (jsonb: [{cycle_week,
                    weekday, slot, start, end, subject_id, group_label, room, teacher_external_id, teacher_name,
                    template_ref}]),
                    fetched_at      (the student's own regular week; never another group's lessons)
lessons             id, student_id, provider_id, external_id, date, slot, start_time, end_time,
                    subject_id, subject_name, teacher_external_id, teacher_name, room, group_label, template_ref (the
                    opaque key that matches the week template, providers.md 4), lesson_type,
                    topic, homework, homework_due_date, has_attachments, cancelled, first_seen_at, fetched_at, removed_at
marks               id, student_id, provider_id, external_id, lesson_id (nullable), date,
                    posted_at, subject_id, raw, kind, values (double precision[]), scale_id, work_type, work_type_raw, title,
                    assessment_type, dimension, criterion, weight, max_points, modifier, status,
                    cohort (jsonb), comment, first_seen_at, changed_at, removed_at, last_seen_at
subjects            + short_name, teacher_external_id, teacher_name, group_label, level, level_label, lessons_per_week,
                    credits, grading_scheme (jsonb)   (the student's teacher and group, level of study; US courses)
attendance          id, student_id, provider_id, external_id, date, lesson_id (nullable),
                    subject_id (nullable), status (absent|late|left_early|present_other), excused (nullable),
                    code, minutes, reason, source (separate|derived), first_seen_at, removed_at
homework_items      id, student_id, provider_id, external_id (null for manual), subject_id, lesson_id, title,
                    description, set_date, due_date, source (diary|manual), created_by (user_id, nullable), mark_id (nullable),
                    first_seen_at, removed_at
lesson_prep         student_id, lesson_id, done_at, done_by (user_id), PK(student_id, lesson_id)      (6.5: "готово" per lesson)
lesson_prep_events  id, student_id, lesson_id, kind (done|undone), by (user_id), at        (180 days, 10.4)
study_sessions      id, student_id, subject_id (nullable), lesson_id (nullable), kind (homework|review),
                    source (timer|inferred|manual), started_at, ended_at, active_sec, created_by (user_id), note,
                    inferred_from (jsonb: the two tick event ids, nullable), created_at, updated_at   (6.7)
study_session_events id, session_id, kind (start|pause|resume|stop), at   (180 days, 10.4)
lesson_overrides    student_id, lesson_id, cancelled (bool), set_by (user_id), set_at, PK(student_id, lesson_id)
                    (5.5: "Урока не будет"; dropped when the diary records a mark or absence for the lesson)
behaviour_events    id, student_id, provider_id, external_id, date, points, polarity, category,
                    comment, subject_id (nullable), lesson_id (nullable), author_external_id,
                    first_seen_at, removed_at   (teacher remarks too: a comment without a mark, D56)
mark_history        id, mark_id, seen_at, raw_mark, kind, work_type, comment   (previous versions)
mark_events         id, student_id, mark_id, kind (new|changed|removed|restored),
                    diff (jsonb), created_at, notified_at
final_marks_raw     student_id, school_year_id, raw_json (jsonb), fetched_at
final_marks         id, student_id, school_year_id, subject_id (nullable for manual rows
                    with no API subject), subject_name, period_id (nullable = year), role (final|current|
                    predicted|proposed|adjusted|target|thematic|effort|behaviour), criterion, label, date,
                    raw (what the diary shows), mark, kind, source (api|manual), entered_by, updated_at,
                    first_seen_at (kept across re-reads while the value stays: the day a term was
                    «выставлена» when the diary sends no date)
                    UNIQUE(student_id, school_year_id, subject_name, period_id)
                    (API parser for `final/whole` written after 2026-10-30)
diary_accounts      + consecutive_failures, paused_until, pause_hours (current pause length),
                    requires_action (auth|blocked|needs_2fa|null), last_attempt_at, last_success_at,
                    alerted_at (the admin was told about the current pause or required action; cleared on success)
sync_runs           id, family_id, diary_account_id, provider_id, kind (scheduled|catchup|manual|
                    rescan (a manual re-scan, or a finished term's once-more during the holidays)|backfill|connect|source_check: a login of an account that is not the active source of
                    its children, only to confirm with getAccount() that it still shows them, 10.4), scope (jsonb: student_ids, weeks planned), trigger
                    (schedule|startup|cli|user:<id>), started_at, finished_at, status (running|success|partial|failed|
                    skipped_offline|skipped_paused|skipped_interval), error_class (offline|
                    provider_unavailable|auth|blocked|needs_2fa|partial|null), error (sanitised text),
                    requests, duration_ms, stats (jsonb: weeks_verified, new, changed, removed, warnings)
sync_coverage       student_id, week_start, verified_at, run_id, status (verified|failed),
                    PK(student_id, week_start)          (the planner's queue, see 10.4)
term_rescans        term_id, student_id, last_full_rescan_at, post_term_rescan_done
sync_daily          diary_account_id, date, runs, failures, requests   (compacted sync_runs older than 90 days)
raw_responses       id, sync_run_id, provider_id, endpoint (the allow-list entry the request matched, no ids), params
                    (jsonb), status, body (jsonb), student_id, week_start (what the collector was fetching), fetched_at;
                    the login response is never stored
api_drift_events    id, sync_run_id, provider_id, endpoint, kind (unknown_field|missing_field|
                    new_enum_value|type_mismatch|new_error_shape|status_change), path,
                    sample (jsonb, sanitised), first_seen_at, last_seen_at, count
api_drift_acks      family_id, drift_event_id, acknowledged_at   («Понятно, скрыть», per family: one family hiding
                    a change never hides it from another family on the same provider)

notification_channels id, user_id, type (webpush|telegram), config (jsonb), enabled, created_at
notifications         id, user_id, student_id (null = family-wide), rule_id (nullable), event_key (what fact it was
                      about, for "пришло" on Внимание and for deduplication), severity, title, body, link (screen +
                      params), params (jsonb: the i18n parameters of title and body, which are keys), channels (text[]:
                      push|telegram), created_at, sent_at, read_at (nullable)   (180 days, 10.4)
                      webpush: {endpoint, keys}; telegram: {chat_id}
alert_rules           id, user_id, family_id, student_id, preset_key (the default it started as),
                      event (mark|comment|average|changed|absence|tag|homework|summary),
                      condition (jsonb: mark {dir any|worse|better|band, value, band}; average {dir down|up|any,
                      step, period week|month|term|year, minMarks}; tag {tagIds [], moments [new|before|evening|saturday],
                      daysBefore}),
                      scope (jsonb: students all|id, subjects []), when (now|evening|weekly), channel
                      (all|push|telegram), enabled, updated_at   (defaults created from the scale, then ordinary rows)
telegram_link_codes   code, user_id, expires_at
user_seen             user_id, student_id, last_seen_at   (powers "new since last visit")

lesson_tags           id, family_id, created_by, name, icon, tone (normal|important), keywords (text[]),
                      fields (text[]: topic|homework), lesson_types (text[], nullable), subject_names (text[], empty = all),
                      student_ids (uuid[] | null = all), prep_days (nullable), enabled, preset_key (nullable), updated_at
lesson_tag_hits       id, family_id, student_id, tag_id, source_lesson_id, due_lesson_id, due_date, field (topic|homework|type),
                      snippet, created_at, removed_at   UNIQUE(tag_id, due_lesson_id)   (6.3; no done status: lesson_prep is the one tick)
```

Upsert rules, applied to every fetched date range whatever the run kind:

- lessons by `(provider_id, student_id, external_id)`, and when no row has that id, by the natural key `(student_id, date, slot, subject external id)`: a match there is the same lesson, its `external_id` is updated (a system that later assigns a real id, e.g. e-schools' null `lesson_uuid`, api-spec 7.5) and its ticks, homework and history stay. A lesson that disappears from a re-fetched range under both keys is soft-deleted (`removed_at`). The natural key is computed from canonical fields, so the rule works for every provider.
- marks by `(provider_id, student_id, external_id)`. New id: insert, `mark_events(new)`. Existing id with a different `raw_mark`, `kind`, `work_type` or `comment`: copy the old version to `mark_history`, update, set `changed_at`, `mark_events(changed)` with the diff. Existing mark whose lesson was fetched but which is no longer in the response: set `removed_at`, `mark_events(removed)`; if it comes back later, clear `removed_at`, `mark_events(restored)`. `last_seen_at` is updated on every fetch that contains the mark.
- Averages and feeds exclude marks with `removed_at`; the feed shows removed and changed marks as their own items ("оценка 6 изменена на 7", "оценка удалена") for 14 days.
- A week counts as "verified at" the moment a run stored it completely (one transaction per week); the Sync screen shows the oldest verified-at of the quarter so it is visible how stale the history is.

Materialised reads: averages are computed in SQL with a view `subject_period_stats(student_id, subject_id, period_id)`; small data, no caching needed.

## 9. API (Express, OpenAPI 3.1 at `/api/docs`)

Conventions: JSON, `camelCase`, dates as ISO strings, errors as `{ error: { code, message, details? } }`. All list endpoints accept `period` as `week` | `month` | `quarter` | `year` with `offset` (instances back, default 0) | `quarter:<id>` | `from=..&to=..`, resolved as in section 6; responses echo the resolved `from` and `to`. Zod schemas generate both validation and the OpenAPI document (`zod-to-openapi`).

```
POST /api/auth/login              {login, password}            -> {user, students[]}   Marksy login
POST /api/auth/connect            {providerId, credentials: {...manifest fields}, role,
                                   user: {login, password, displayName}, consentVersion}
                                                               -> creates family, admin session;
                                                                  409 needs_2fa with a prompt
POST /api/auth/logout
PATCH /api/me                     {locale?, displayName?, timezone?, uiMode?, avatar?}
PUT  /api/family/members/:id/ui-mode {uiMode}                 -> a student member's simple mode, by the admin or a parent (5.7)
PATCH /api/students/:id           {avatar: traits | null}      (admin, parent): the child's avatar, seen by every family that
                                                                   follows the child (D54)
PUT  /api/students/:id/photo      the picture's bytes            (admin, parent): JPEG, PNG or WebP up to 512 px, checked and
                                                                   stripped of metadata on the server (14.1)
GET  /api/students/:id/photo                                   -> the photo, to the families that follow the child
GET  /api/auth/me                                              -> {user, memberships[], family (current),
                                                                   students[] with provider, school,
                                                                   capabilities and gradingScale}
POST /api/auth/family             {familyId}                   -> switch the current family (member of several)

GET  /api/providers                                            -> registry: id, name, country,
                                                                   status, auth fields, roles (public)
GET  /api/invites/:code                                        -> {family, role, students[]} (public)
POST /api/invites/:code/accept    {login, password, displayName} -> session
GET  /api/family                                               -> members, accounts (provider, school, children),
                                                                   children (school, sharedWithOtherFamily, status)
POST /api/family/accounts         {providerId, credentials, role} -> add a diary to the current family (7.2);
                                                                   {account, children[], matches[]}: children
                                                                   already followed by another family
POST /api/family/accounts/:id/matches/:studentId {action: join|follow}   (7.2 step 3)
PATCH /api/family/students/:id    {settings: {lowMark?, dropStep?, callAfter?}}   (admin, parent)
DELETE /api/family/students/:id                                -> «Перестать следить» (admin): {outcome: stopped|removed} (7.1)
POST /api/family/students/:id/follow                           -> «Следить снова» (admin): a stopped link is active again
DELETE /api/family/students/:id/data {confirm}                 -> «Удалить данные» of a stopped child nobody else follows (admin);
                                                                   the child is deleted with the last link
GET  /api/family/export                                        -> everything the family owns and the data of
                                                                   the children it follows, JSON (admin)
DELETE /api/family                                             -> erase the family (admin, typed confirmation)
PATCH /api/family/join-requests/:id {approve}   (admin; a request is made by POST …/matches/:studentId {action: join})
POST /api/family/invites          {role, studentIds[]}          -> {code, url, expiresAt}
PATCH /api/family/members/:id     {role?, studentIds?}
DELETE /api/family/members/:id                                 (admin, or yourself to leave; the last admin cannot)
PUT  /api/family/accounts/:id/password {password}              -> re-check at next allowed login (admin)
DELETE /api/family {confirm: the family name}                  (admin; 14.1)

GET  /api/students                                             -> «С кого начнём?» in one request: per child the
                                                                   card (name, class, school when the schools differ,
                                                                   new marks, the week compared, absences, nextDay
                                                                   {date, lessons, homework} for a year without marks,
                                                                   «Сейчас» only within the school day (D52), alert (a
                                                                   critical row in this week's Внимание: the red badge
                                                                   on the avatar), nearest tag from M6)
GET  /api/students/:id/periods                                 -> the period kinds and every instance (the navigator),
                                                                   each with its count of marks, or of lessons in a year
                                                                   without marks (counts: marks|lessons), and the term's
                                                                   kind and number (the word «четверть» comes from i18n);
                                                                   finals: the entry row's state (running | ended |
                                                                   posted with postedOn; null without terms or finals)
GET  /api/students/:id/overview?period=&offset=                -> {period, comparison, marksCount, prevMarksCount,
                                                                   bands: [{band, labelKey, from, to, count, prevCount}] (the child's scale: its bands, labels and bounds; never fixed ranges),
                                                                   distribution [{from, to, count}], absences,
                                                                   prevAbsences, newCount, lessonTiles (a year without
                                                                   marks: lessons and homework with the previous ones),
                                                                   lastDay {date, marks[{subject, mark, workType,
                                                                   comment}]} (the last day with marks up to today,
                                                                   whatever the period), movers[], attention[] (five),
                                                                   attentionTotal, nextDay {date, lessons[] as the
                                                                   timetable has them}, now (subject, room; after lessons
                                                                   the next school day's first lesson)}
GET  /api/students/:id/subjects?period=&sort=&tags=&tagMode=&comments=
                                                                   -> [{subject (with color), comparison, count, last[]
                                                                   (of the filtered kind), absences, final (the posted
                                                                   term final while it is news), lessons (a year without
                                                                   marks: count, homework, next lesson)}]; every subject
                                                                   is listed whatever the filter
GET  /api/students/:id/finals/quarters                         -> {state, terms[], lastYear, rows: subject × {I..IV,
                                                                   year}: each {kind: final|running|none, raw, value,
                                                                   postedOn, source}, lastYear (last year's final by name)};
                                                                   the year cell is final only when the diary has it, else
                                                                   running by GradingScale.yearRule over posted term finals
GET  /api/students/:id/finals/years                            -> {years[], rows: subject name × school year (cells as
                                                                   above), subjectId (null: «в этом году нет»), isNew,
                                                                   trend against last year (D5)}
GET  /api/students/:id/subjects/:subjectId?period=&tags=&tagMode=&comments=
                                                                   -> {subject (teacher, group, level, lessons per week,
                                                                   color), settings {goal, goalAvailable}, attention {goal
                                                                   row, hints[]} (both empty with guidance off; 6.2 is
                                                                   served here, not by a separate route), comparison,
                                                                   count, prevCount, bands, distribution, timeline[] (marks
                                                                   and the teacher's comments without a mark, D56),
                                                                   upcoming[] (three lessons), lessonTiles (a year without
                                                                   marks), terms[] (cell, average), year, lastYear, week[]
                                                                   (the subject in the regular week: weekday, slot, times,
                                                                   room, group)}
PUT  /api/students/:id/final-marks {startYear, marks: [{subjectName, raw}]} -> a past year's year finals, typed in (admin, parents; 6.1)
                                                                   [{schoolYear, subjectName,
                                                                   period?, mark}] (admin, parent)
PUT  /api/students/:id/subject-links                           -> [{from, to}]
GET  /api/students/:id/marks?period=|from=&to=&subject=&comments=all|only|none&tags=a,b&tagMode=any|all&cursor=&limit=
                                                                -> the feed: items of type mark (each with its lesson's
                                                                   tagIds), comment (a teacher's comment without a mark,
                                                                   D56: never a mark, never in an average; only with
                                                                   capabilities.behaviour), absence (attendance, quiet,
                                                                   only with capabilities.attendance), finals (one card on
                                                                   the day a term's finals were posted), markChanged /
                                                                   markRemoved (14 days); in a day the finals card, the
                                                                   marks, the absences, the comments, the changes; absences
                                                                   and the card only without a filter
GET  /api/students/:id/subjects/:subjectId/trend?period=|from=&to=&tags=&tagMode=&comments= -> buckets [{from, to, future, selected, average, count, bands {critical, low, good, top}}] (the stacked bar, D26)
GET  /api/students/:id/trend?period=                           -> the same over all marks (TrendCard on Главная)
POST /api/students/:id/seen                                    -> marks everything as seen
GET  /api/students/:id/schedule?day=today|tomorrow|next|YYYY-MM-DD|week=N -> lessons by day (next = the next day with
                                                                   lessons; week=0 this week, 1 next, -1 last): times,
                                                                   room, group, teacher, homework, own homework, «готово»
                                                                   (the author's name only inside the family),
                                                                   «урока не будет», marks (work type and comment only
                                                                   when set), absence, teacherComment, the family's tags
                                                                   (due here, set here, isTest from «Контрольная»); for a
                                                                   lesson not passed yet the пометки факты, сигнал and
                                                                   подсказка (the last two only with guidance on);
                                                                   attention = «Обратить внимание» of the range
GET  /api/students/:id/schedule/days                           -> every day of the school year with lessons: {date,
                                                                   lessons, held} (the navigator and its picker, 5.5)
GET  /api/students/:id/school                                  -> Школа (5.9): bells, terms and holidays with notes
GET  /api/students/:id/absences?period=
GET  /api/students/:id/events?period=&offset=&skip=&limit=     -> ranked facts (low_mark, mark_changed, mark_removed,
                                                                   absence, average_down/up (at most three drops and the
                                                                   one biggest rise, 6.1), teacher_comment for 7 days,
                                                                   holidays_ahead), each {severity, date, subject, facts,
                                                                   link}; the words are the app's; Главная carries the
                                                                   first five as overview.attention
GET  /api/students/:id/guidance?day=                           -> lesson hints (section 6.2; the subject's hints and goal
                                                                   come with the subject route)
GET  /api/students/:id/tag-hits?horizon=14                     -> tag hits with due lesson, days left, advice (6.3)
POST /api/students/:id/study/start {subjectId?, lessonId?, kind}  -> the running session (pauses another running one)
POST /api/students/:id/study/pause  POST …/study/resume  POST …/study/stop  -> {session} (6.7; stop never touches lesson_prep)
GET  /api/students/:id/study?period=|from=&to=&onlyTimer=       -> sessions and batches by day, totals by subject and
                                                                   per bucket (same buckets as /trend), averages alongside
                                                                   when the viewer may see them
POST /api/students/:id/study {subjectId?, lessonId?, startedAt, endedAt}   PATCH/DELETE /api/students/:id/study/:sessionId  (manual)
PUT  /api/students/:id/lessons/:lessonId/prep  DELETE …/prep   -> {done, doneBy, doneAt} (6.5); student (own), parent, admin;
                                                                   every lesson action answers 409 lesson_passed once the
                                                                   lesson has passed (core lessonPassed, 5.5)
POST /api/students/:id/lessons/:lessonId/homework {text}      -> manual homework item (source: manual); one per lesson
                                                                   (409 homework_exists)
PUT  /api/students/:id/lessons/:lessonId/cancel  DELETE …/cancel -> {cancelled, setAt} (5.5); same roles as prep; the lessons endpoint carries `cancelled`;
                                                                   409 diary_has_lesson when the diary has a mark or an
                                                                   attendance record for it
PATCH /api/students/:id/homework/:itemId {text}   DELETE /api/students/:id/homework/:itemId   -> edit or remove a manual item (source: manual only)
PATCH /api/me/settings {guidance?, appearance?: {...any part}}   -> personal switches and appearance (5.6a); GET /api/auth/me
                                                                   returns user.appearance with hasOwnWallpaper
PUT /api/me/wallpaper (raw image body, ≤ 5 MB, ≤ 1600 px, 14.1)   DELETE /api/me/wallpaper   GET /api/me/wallpaper -> own picture only
PUT  /api/students/:id/subjects/:subjectId/goal {termGoal}     -> the subject's goal, shown as a row in "Обратить внимание" (5.4); student (own), parent, admin
PUT  /api/students/:id/subjects/:subjectId/color {color|null}  -> subject colour for the family (6.6); student (own), parent, admin
GET  /api/tags                        POST /api/tags    PUT /api/tags/:id    DELETE /api/tags/:id   (family's tags; student may create own)
GET  /api/periods                                              -> quarters, weeks, current

GET  /api/sync/status                                          -> per diary account: status (ok|stale|
                                                                   paused|auth_failed|blocked|needs_2fa),
                                                                   today's window and the children it comes from,
                                                                   children read through another family's login,
                                                                   lastSuccessAt, lastAttemptAt + outcome,
                                                                   consecutiveFailures, pausedUntil,
                                                                   nextAllowedAt, nextPlannedAt + reason (for the
                                                                   next school day its date, the window's opening
                                                                   when known and whether holidays come first),
                                                                   plan (weeks per student, request
                                                                   estimate), oldest verified week,
                                                                   drift events. Only the children the person
                                                                   sees; for a student no diary login (label)
                                                                   and no plan, only the freshness of their
                                                                   own data. /api/me carries the same
                                                                   `status` + lastSuccessAt per student so
                                                                   the FreshnessBanner needs no extra call
POST /api/sync/run {accountId}                                 -> «Обновить сейчас» (admin, parent): {started, reason: interval|action|null,
                                                                   retryAt}; the run goes on after the answer and records its
                                                                   own decision (a skipped row for a try inside the interval)
POST /api/sync/rescan {accountId, studentIds?, period: term|year} -> the period's weeks lose their check, so the planner reads them
                                                                   again as unverified weeks (freshest first, a catch-up allowed),
                                                                   then the same as /run; {weeks} says how many
GET  /api/sync/runs?limit=                                     -> history with stats
POST /api/sync/drift/:id/ack                                   -> «Понятно, скрыть» for a change on one of the family's diary
                                                                   systems, for this family only (kind and place only; samples never leave the server)

GET  /api/notifications?before=<cursor>                         -> inbox, newest first, {items, unread, next}
POST /api/notifications/read                                   -> {ids} or {all: true}
GET  /api/notifications/settings
PUT  /api/notifications/settings                               -> rules, quiet hours
POST /api/notifications/push/subscribe                         -> store PushSubscription
DELETE /api/notifications/push/subscribe
POST /api/notifications/telegram/link                          -> {code, botUrl}
POST /api/telegram/webhook                                     -> bot updates (secret path)

GET  /api/health                                               -> {ok, db, lastSyncAt}
```

Shapes worth fixing now:

```ts
type MarkChip = { id: string; values: number[]; raw: string; kind: MarkKind; band: Band | null };
type SubjectRow = { subjectId: string; name: string; average: number | null; count: number;
                    trend: 'up' | 'down' | 'flat' | null; last: MarkChip[]; absences: number };
type FeedItem  = { id: string; date: string; subjectId: string; subject: string; mark: MarkChip;
                   workType: WorkType | null; topic: string | null; comment: string | null;
                   isNew: boolean };
```

## 10. Collector in this architecture

The collector is generic. It asks a provider for data through the `DiaryProvider` interface (`docs/providers.md`) and never knows which system is behind it. Belarus-specific request mechanics are in `api-spec.md` (the `by-eschools` provider's documentation); this section covers scheduling, scope and drift, which are the same for every provider.

### 10.1 Where it runs

One Node process (`server/`) runs the HTTP API and the scheduler (`node-cron`, timezone from the provider manifest per account). `SYNC_ENABLED=false` lets a cloud copy of the API run without touching any diary. The shared HTTP client (`packages/core/src/http/throttled-client.ts`) implements throttle, backoff and the read-only allow-list from the manifest; providers receive it in `ctx.http` and have no other way to make requests. Fixtures live in each provider's `fixtures/` and feed the conformance test.

### 10.0 Provider layer in one paragraph

`packages/core` holds the canonical types (`Student`, `Term`, `Subject`, `Lesson`, `Mark`, `FinalMark`), the `DiaryProvider` interface, grading scales, marks math and guidance. `providers/<id>` implement the interface for one system and ship a manifest, Zod schemas, a mapper, `sanitize()` and fixtures. The registry lists them; the login screen shows them; the server picks one per `diary_accounts.provider_id`. Limits and the allow-list come from the manifest and are enforced centrally. A single school with its own site is a provider with `scope: "school"`; a national system is `scope: "national"`. Full contract and contributor guide: `docs/providers.md`.

### 10.2 Schedule

Goal: look like a parent who opens the diary a few times during the school day, not like a cron job.

- **Hourly run, only during a child's school day.** Each child has a window per date: from an hour before their first lesson to two hours after their last (the same span as «Сейчас» on Главная), from that child's own timetable and bells. A day without lessons for the child (weekend, the child's holidays, an empty timetable) has no window. When the day's lessons are known without times (no `bellSchedule`, no start times), or the day is not fetched yet, the manifest's `syncWindow` (by-eschools `08:00` to `14:00`) stands in. An account's window is the union of the windows of the children it is the active source for, so a family with a first-grader finishing at 11:45 and a seventh-grader finishing at 14:30 stops at 16:30, and two children at different schools are each followed through their own day (ux-principles D55). A run starts a random 0 to `SYNC_JITTER_MIN` (20) minutes after the moment the login interval allows it (the delay is fixed per account and slot, so tests can rely on it), and the tick itself fires a few seconds late, so the timestamps in the school's logs drift from run to run. Scope: the current week, the next school week (where the provider shows lessons ahead, `capabilities.futureTimetable`: the week of the child's first school day after the current week, holiday weeks skipped, at most three weeks ahead, so a Friday before the holidays of 2 to 8 November reads the week of 9 November) and the previous week per student, plus final marks once a day. Today's timetable is part of the standing set, so the window for the next day is known from the last run of the previous one; and since teachers set Monday's homework on Friday while no run reads at the weekend, Friday's runs bring next week's lessons and homework, which Главная and Расписание show on Sunday.
- **A child is collected once.** When several accounts show the same child (`student_sources`, two parents' logins, possibly in two families), the collector reads the child only through the `active` source; another source takes over when the active one needs action, is paused, or no longer shows the child. Every source account still logs in once a school day inside the child's window for `getAccount()` only, so a lost access is noticed within a day (7.1) and the family's own diary logs show normal use.
- **One diary login per `minLoginIntervalMinutes` (60 for by-eschools) per account, hard limit.** Hourly run, manual "Обновить", manual re-scan and source checks all draw from the same budget (`diary_accounts.last_login_at`). When the budget is used the manual action is queued for the next allowed time and the UI shows it.
- **One run on a day without school, when Friday failed.** On a weekend or holiday day (no child the account reads has school by their calendar) nothing is read, with one exception: when a child's nearest school week was not read on their last school day or since (the machine was off on Friday, the diary did not answer), one run is allowed in the manifest's `syncWindow`, kind `ahead`, at most one per stretch without school (a run that reached the diary counts even when it failed; an offline attempt does not). A Friday missed gives one run on Saturday and none on Sunday; the autumn holidays get one run that reads the week school starts again. The planner's `aheadDue` decides it from the coverage table (10.4). On such a day the last success growing older than `SYNC_CATCHUP_AFTER` is no reason to read: nothing new appears in the diary when there is no school; only a real backlog (a week never fetched after it ended) catches up.
- **Re-scan inside the school day.** There is no evening slot (D55): every week of the current term last verified more than 6 days ago is taken again by the ordinary school-day runs, after the standing weeks and the gap, same parser, same upsert, so changed and removed marks are detected (section 8). Over a week of school days every week of the term is checked about once, a few requests per run within the per-run cap (10.4). Stale weeks are verified data, so they never open a catch-up outside the window. The one exception: a finished term (or year) is fetched once more two weeks after its end (10.4); when that falls into the holidays, when no child has a window, it gets one run in the manifest's `syncWindow` on a weekday, or the year's finals would wait for September.
- **Manual re-scan** from the Sync screen: student(s) and period (current quarter, school year, specific weeks). The API fetches per week, not per subject, so a subject filter in the UI does not reduce requests; the UI offers period and student only and explains why.
- **Backfill** after connecting a diary: every week of the school year so far that was never verified, newest first. It is the lowest-priority set of any allowed run (10.4), so a school year arrives over a few runs, each within the request cap; a new account starts its first run at once, at any hour.
- Limits come from the provider manifest (`limits`) and can be tightened globally in `.env` (`SYNC_WINDOW` as an outer bound on every child's window, `SYNC_MIN_LOGIN_INTERVAL`, `SYNC_MAX_REQUESTS_PER_RUN`); windows are intersected and limits take the stricter value, never the looser one. There is no family setting for the window: it follows the children's school days. `SYNC_JITTER_MIN` sets the delay and adds no requests. The two hours after the last lesson are a working assumption (teachers enter most marks during or right after lessons); if evening marks turn out to be common, add a single evening run rather than widening the hourly window.
- **Manual runs in development.** The developer's command-line runs against a real diary (`pnpm probe`, `pnpm sync:once`, `pnpm dev:connect`) pass the login guard (`server/src/cli/login-guard.ts`) under a mode (`server/src/cli/mode.ts`). In `MARKSY_ENV=development` (exactly; the default of `env.example`) they may log in once per account every `DEV_MIN_LOGIN_INTERVAL_MINUTES` (10, which the variable can only raise), at any hour, with no daily cap. Every other value, a missing one included, is production, and so is any build with `NODE_ENV=production`, whatever `MARKSY_ENV` says: the runs draw from the manifest's interval like every other run, and Claude Code (`MARKSY_RUNNER=claude`) is held to three runs a day between 07:00 and 20:00 school time. `SYNC_MIN_LOGIN_INTERVAL` tightens both modes. In both, Claude Code is refused while the account is paused and after the diary refused the login (the account's `requires_action`, or `cli_logins.outcome` of the last run) until the owner's own run succeeds (ux-principles D57). Every such login still stamps `last_login_at`, so the scheduler's next run waits its full interval after it. The mode never touches scheduled runs: in both, they keep each child's school-day window, the manifest's interval and D55.

The schedule above describes the ideal day. Section 10.4 describes what happens on every other day: the server is a home machine that can be off for an hour, a day or a week, and the diary can be down. The scheduler is therefore not a list of cron expressions but a planner that looks at recorded state and decides what to fetch now.

### 10.4 Resilience: planner, coverage, failures, retention

**Principle.** Every attempt to talk to a diary is recorded with its outcome and timestamps, and every week of data carries the time it was last verified. The planner never asks "is it the top of the hour"; it asks "what has not been verified recently, and am I allowed to ask for it now".

**Tick, not cron.** `node-cron` fires a tick every 5 minutes (jittered by a few seconds) and once at process start after a 1 to 3 minute delay. The tick is idempotent and takes a Postgres advisory lock per diary account so two ticks never overlap. It compares wall-clock times from the database, so a machine that was asleep or off for a week behaves exactly like one that was never off: the first tick sees the gap and plans a catch-up. If the clock went backwards (`now < last_attempt_at`), the login interval is treated as elapsed.

**Coverage.** `sync_coverage` has one row per `(student_id, week_start)` with `verified_at`, `run_id` and `status`. A week is *verified* when it was fetched and upserted completely in one run; a run that dies halfway keeps the weeks it finished, so progress is never lost and a short run after a long outage still moves the watermark. Per student the planner derives:

- *standing set*: the current week, the next school week where the provider has `futureTimetable` (homework and topics set ahead; the week of the first school day after the current week, holiday weeks skipped, at most three weeks ahead, never past the school year) and the previous week (late marks and corrections are normal), in that order;
- *gap set*: every school week from the week before the last successful run up to today that was not fetched after it ended, newest first (a week fetched only while it was still running may have missed marks);
- *re-scan set*: the weeks of the current term last verified more than 6 days ago, taken by the school-day runs (10.2); and once more two weeks after a term ends, every week of that term not fetched since, so final marks and late edits are caught (`term_rescans.post_term_rescan_done` then marks the term finished; `last_full_rescan_at` records when the current term last had no stale week);
- *backfill set*: every week of the school year never verified, newest first: the whole year so far right after a diary is connected, and any week no run has reached yet.

**One run** = standing set (every student's, before anyone's gap), the final marks once a day, then gap set, then re-scan, then backfill, until the manifest's `limits.maxRequestsPerRun` (by-eschools: 40, `SYNC_MAX_REQUESTS_PER_RUN` may lower it) is used; the standing weeks are fetched again in every run, so a long backlog moves by what is left of the cap after them. Whatever did not fit is simply still unverified and is first in line next time, so a week-long outage is caught up over two or three runs with the freshest data first. Nothing is ever "scheduled for later"; the queue is the coverage table itself.

**When a run may start.** All of these must hold: the account needs no action (`requires_action` is null; nothing, not even the button, logs in with credentials the diary refused); `paused_until` is null or past (a manual refresh may try once anyway, see below); `last_attempt_at + minLoginIntervalMinutes <= now` (an attempt counts even if it failed, because the diary saw a login); and either now is inside the school-day window of at least one child the account is the active source for (10.2), or the run is a *catch-up* (last success older than 24 hours on a day some child has school, or an unverified week older than the standing set exists at any time), or it is the one *ahead* run of a stretch without school (10.2: the nearest school week was not read on the child's last school day or since; manifest window only). A new account (no success yet) runs at once, at any hour, and backfills. Stale re-scan weeks are not unverified weeks: they wait for the next school day. A finished term's once-more that falls into the holidays runs once in the manifest's window on a weekday (10.2). A catch-up may run at any hour because the data it fetches already exists; the end of the window only argues that *today's* marks will not appear later. Manual "Обновить" is a run like any other and draws from the same login budget; the UI shows when it becomes possible.

**Source checks.** An account that is not the active source of any of its children (the other parent's login, 7.1) logs in once a school day inside one of those children's windows for `getAccount()` only, as a run of kind `source_check`. It spends no requests on data: no calendar, subjects or weeks, so it does not count against `maxRequestsPerRun` beyond the login and the account call, and it never writes `sync_coverage` or moves any planner set. It updates `student_sources.last_seen_at`, and a child it no longer lists is handled as in 7.1 (the family's link is suspended when none of its accounts shows the child). It draws on the account's own login budget like any run.

**Connectivity first.** Before logging in, the run checks that this machine is online at all: DNS resolution and a TCP connect to the provider host, no HTTP request. If that fails the run ends as `skipped_offline`, nothing is counted against the provider, and the next tick retries in 10 minutes. Being offline is the home server's problem, not the diary's, and must never trigger a pause.

**Failure classes and what they do**

| Class | Examples | Effect |
|---|---|---|
| `offline` | DNS or TCP to the provider host fails | run `skipped_offline`, retry at the next tick after 10 min, no counter touched |
| `provider_unavailable` | 5xx, 429, timeout, reset after the connection was made | run `failed`, `consecutive_failures += 1`, next attempt at the next allowed time |
| `auth` | 401 or the provider's "wrong credentials" shape | account `status = auth_failed`, `paused_until = null` but `requires_action = true`: no login is attempted until the credentials row changes; admin notified once |
| `blocked` / `needs_2fa` | provider says the account is locked or needs a second factor | same as `auth`, with its own status so the UI can explain |
| `drift` | unexpected shape, parse error on part of the body | run `success` with `warnings`, raw body kept, `api_drift_events` row (10.3); never counted as a failure. A week whose response cannot be used at all stays unverified and the run goes on |
| `partial` | some weeks fetched, then a provider error | finished weeks verified, run `partial`, the rest stays unverified; counts as one failure |
| our own error | a request refused by our own policy, a database error | run `failed` with the error name, logged; never counted against the diary, never pauses |

**Pause after repeated failures.** When `consecutive_failures` reaches `SYNC_FAILURES_BEFORE_PAUSE` (default 3), the account gets `paused_until = now + SYNC_PAUSE_HOURS` (default 24 hours), the admin is notified once ("Дневник не отвечает, следующая попытка завтра после 08:00"; an inbox row with i18n keys from M3, delivery over push and Telegram with M9) and the Sync screen shows the reason. With one attempt per hour, three consecutive failures mean the diary was down for roughly three hours of the window, which is not a blip. If the first run after a pause fails again, the pause doubles (48 h, 96 h, cap 7 days); a single success resets both the counter and the pause length. A manual refresh is allowed during a pause (one attempt, still inside the login interval) because a human pressing the button is the best signal that the service is back; if it fails, the pause stays as it was. Auth failures never auto-retry at all: repeated bad logins can lock the real diary account.

**What the user sees.** When the last successful run is older than 24 hours, or the account is paused or needs action, every student screen shows one `FreshnessBanner` under the header ("Данные от пн 12 окт, 13:05. Приложение не обновлялось 3 дня…") that opens the Sync screen; when data is fresh nothing is shown except the "Обновлено сегодня в 12:17" footer on Overview. The Sync screen shows state (last data, last attempt and its outcome, failures in a row, next run and why), what the next run will take (the planned sets and an estimate of requests), the re-scan card, drift events, the refresh and re-scan buttons, and the run log. Prototype: rail toggle "Состояние синхронизации" with four scenarios.

**Retention.** Operational data is kept only as long as it is useful; marks and their history are kept for as long as at least one family follows the student, because that is the product.

| Data | Keep | Why |
|---|---|---|
| `join_requests` | a decided request 180 days (`RETENTION_MARK_EVENTS_DAYS`); a pending one until the admin decides | the decision is in the family's members and accounts; the request itself is only history |
| `cli_logins` | 90 days (`RETENTION_SYNC_RUNS_DAYS`) | the login guard of `pnpm probe`, `pnpm sync:once` and `pnpm dev:connect` needs a day, and the last run's `outcome` (a login the diary refused); the rest is for diagnosis. Only a hash of the login is stored |
| `sync_runs` | 90 days, then one row per day is compacted into `sync_daily` (date, runs, failures, requests) | the log is for diagnosing recent problems; the daily line is enough for "how often did this break" |
| `sync_coverage` | current and previous school year; older rows deleted with the year's compaction | the planner never looks further back |
| `raw_responses` | 14 days; the response that verified a `(student, week)` of the current term is kept until the term ends. Stored without the personal fields the mapper never uses (the provider's `redactRaw()`), never the login response | re-parsing after a drift fix needs recent bodies, not a year of them |
| `api_drift_events` | 180 days after it was last seen, once every family whose diaries use the provider has hidden it (`api_drift_acks`, which go with the event); `count` and `last_seen_at` keep updating | an acknowledged event that stopped occurring is noise |
| `mark_events`, `lesson_prep_events`, `notifications` (the inbox, which is also the delivery log) | 180 days | the feed shows "new since last visit", not an audit trail; `mark_history` keeps the versions themselves |
| `study_sessions` | current and previous school year; `inferred` rows are replaced on every recompute | the comparison goes back a year at most |
| `study_session_events` | 180 days | pauses are for the running session, not history |
| `lesson_overrides` | current and previous school year | "N уроков назад" and `callAfter` count real lessons of this year; older overrides change nothing on screen |
| `lesson_tag_hits` | until 30 days after the due date; recomputed hits replace removed ones | the schedule and Внимание look ahead, not back |
| `bell_schedules`, `week_templates` | replaced on every fetch (once a day); previous school years deleted with the year's compaction | reference data for today and the current term; teacher names inside them are kept only while current |
| `mark_history` | lifetime of the mark | that is the change detection the product promises |
| `lessons`, `marks`, `attendance`, `homework_items`, `behaviour_events`, `final_marks` | while at least one family follows the student; older than the shortest `families.settings.retention_years` among those families when one set a limit (14.1; finals by the end of their school year) | the product; the limit is the family's choice |
| `sync_daily` | while the diary account exists | one small line per account and day |
| `invites`, `telegram_link_codes` | until they expire | single-use secrets |
| `user_files` (wallpaper) | while the user exists; replaced on upload, deleted with the user | a personal picture, one per user |
| picture files under `UPLOADS_DIR` (a child's photo, a wallpaper) | while a row points at them: a replaced picture is deleted at once, and the janitor removes every file no `students.avatar` or `user_files` row points at (older than an hour), whatever removed the row | a child's photo must go with the child's data, never linger on disk |
| `user_seen`, sessions | sessions expire by TTL; `user_seen` keeps only the last visit per screen | nothing historical is needed |

A daily janitor job (same process, after the first planner tick of each day) applies these limits; each limit is a constant in `server/src/retention.ts` with a matching `RETENTION_*` env override in `env.example`. Deleting a diary account removes its `student_sources`; a family whose last source of a child is gone loses that link (7.1). Removing the last `family_students` link of a child cascades to everything the child owns immediately; retention never keeps data about a child no family follows.

### 10.3 API drift detection

Unofficial APIs change. Every provider's response passes through its Zod schema built with `z.looseObject` and the core `driftChecker` (`packages/core/src/drift`), and `ctx.drift` records what the schema did not expect (`docs/providers.md` 3):

- unknown top-level or nested field (`unknown_field`), missing required field (`missing_field`), type change (`type_mismatch`), new value of `kind`, `type`, `lesson type`, `time_activities.type` (`new_enum_value`), unknown error body shape (`new_error_shape`); a broken list item is skipped and the rest of the response is used;
- each finding becomes an `api_drift_events` row keyed by `(endpoint, kind, path)` with a sanitised sample (names, uuids and comments replaced, same rules as fixtures), `count` and `last_seen_at`. Core enforces it before anything is stored: a sample is kept only as an UPPER_SNAKE enum value, a short number or a type name, and every path segment that is not a schema key (uuids, numbers, hex ids, logins) becomes `*`, so one change in a map keyed by ids is one row, not one per id;
- the first occurrence is logged at `warn` and pushed to the admin through their notification channels ("e-schools API: новое поле `slots[].foo` в lessons"), later occurrences only increment `count`;
- parsing never fails on unknown fields; the raw body is in `raw_responses`, so support can be added later without re-fetching;
- the probe script from `api-spec.md` section 10 doubles as a contract check: `pnpm probe --compare` runs each endpoint once and diffs against `fixtures/`, usable on demand when a drift event appears.

## 11. Notifications

Events come from `mark_events`, `api_drift_events`, account status and lessons (tests scheduled, homework). Delivery is a small worker inside the same process, run right after each sync and on a 5-minute tick for digests. Each user has their own channels and rules; a child's phone never receives the parents' alerts.

| Rule | Trigger | Default |
|---|---|---|
| `new_mark` | any `mark_events(new)` | on for students, off for parents (digest instead) |
| `mark_changed` | `mark_events(changed|removed|restored)` | on for parents, grouped per run |
| `api_drift` | first occurrence of an `api_drift_events` row; account `auth_failed` | admin only, always on |
| `mark` with condition | new mark that is: any / worse than a value / not worse than a value / in a band | defaults: any (students), worse than first threshold (parents), top band in the evening digest (parents) |
| `average` with condition | a subject's average dropped / rose / changed by more than a step over a chosen calendar period (week, month, term, year) versus the previous period of the same kind, on at least N marks | one rule, off: dropped by 0.5 over a week, 2 marks |
| `absence` | new `ABSENT` | on for parents |
| `comment` | a teacher's comment on a lesson without a mark appears (D56, `behaviour_events`); a changed or removed comment follows the diary and is not sent again | parents on, in the evening digest (19:00; may be switched to immediately); students off. Digest line: «Милена · Математика, 3-й урок: «Нет домашнего задания»», opening the lesson |
| `tag` | a lesson carries one of the chosen tags (6.3); sent at the chosen moments: when the hit first appears, N days before the lesson, the evening before (19:00), in the Saturday 09:00 list of next week | "Контрольная, Стихотворение" (appears, evening before, Saturday) on for everyone who follows the student; "Принести" (evening before) on for students |
| `homework_digest` | daily at `time` (default 19:00): tomorrow's lessons with homework and ticks, what is still open, today's study time | on for students and grade 1 parents |
| `prep_open` | tomorrow's lessons not all ticked at `time` (default 20:00) | off; parents may switch it on (6.5) |
| `study_long` | a timer session running longer than `hours` without a pause (6.7): a reminder to take a break, to the child and the parents who follow them | off |
| `weekly_summary` | Sunday 18:00: averages, movers, absences | on for parents |

- Quiet hours (default 22:00 to 07:00): events are queued and sent as one message afterwards.
- Grouping: several marks found in one sync go out as one message per student.
- Web Push via `web-push` with VAPID keys in `.env`; service worker shows the notification and deep-links to the feed. iOS needs the PWA installed to the home screen.
- Telegram via `grammy`: `/start <code>` links a chat to a user; messages in Russian with mark chips as text (`Алгебра: 9 (контрольная)`).
- Every message states the student, so a parent with two children is never confused.
- **Inbox.** Every message sent is stored once per user in `notifications` with its text and deep link, whatever the channel, and listed on Уведомления (5.2b) for 180 days. Grouped messages are one row. The unread count on the bell is the number of rows without `read_at`; opening a row or "Прочитать все" sets it. A notification that matches a Внимание row (same student and fact) is shown there as "пришло …".

## 12. Design tokens and Tailwind

`docs/tokens.json` is the single source for colours, type, radius and spacing. `pnpm --filter @marksy/web tokens` (`web/scripts/tokens-to-css.ts`) writes `web/src/styles/tokens.css`: the CSS variables of the prototype (`--bg`, `--accent`, `--band-good-fg`, `--r-lg`, `--av-skin-light`) for the light theme, the dark theme under `prefers-color-scheme` and `[data-theme="dark"]`, and a Tailwind 4 `@theme inline` block that maps the utilities onto those variables (`bg-surface`, `text-ink3`, `text-band-good-fg`, `rounded-lg`, `shadow-card`, `text-h1`) and resets Tailwind's own colours, fonts, radii and shadows, so nothing outside the tokens can be used. There is no `tailwind.config.ts`. A test fails when `tokens.css` is older than `tokens.json`, and a lint rule rejects a hex value anywhere in `web/`. The prototype in `docs/mockups.html` uses the same variable names. Band *ranges* are not tokens: they belong to the grading scale and come from the API per student; tokens only give the four band roles their colours.

Token groups: `color.light` and `color.dark` (`bg`, `surface`, `surface2`, `ink`, `ink2`, `ink3`, `line`, `accent`, `accentInk`, `accentSoft`, `band.{critical,low,ok,good,top}` with `bg` and `fg`, `holiday`), `color.subject` (the twelve subject hues, 6.6), `avatar` (the trait colours of generated avatars, D9), `font.display`, `font.body`, `typeScale`, `radius.{sm,md,lg,pill}`, `space` (n × 4 px, Tailwind's `--spacing`), `shadow.card` and `shadow.cardDark`, `tap.min`, `palette` and `wallpaper` (Оформление, 5.6a).

Typography: Manrope for UI text and numbers (tabular figures), Fraunces for the large average on the hero and tiles, with system fallbacks. The fonts are always served from the app's own origin (the `@fontsource` packages, bundled by Vite); the app never requests anything from a font CDN or any other third party (14.1). Only the prototype in `docs/` links Google Fonts.

## 13. Frontend structure

```
web/src/
  app/            router (App.tsx), guards (session, picked child, the 12-hour rule), Frame (column, body, tab bar)
  api/            openapi.json (written by the server), schema.d.ts (openapi-typescript), client.ts (openapi-fetch,
                  relative to the page's own origin), queries.ts (TanStack Query hooks)
  features/
    auth/  pick/  overview/  marks/  subjects/  subject/  schedule/  more/  notifications/  settings/
  hooks/          useScale(studentId), useCapabilities(studentId), useSchoolTz(studentId): every scale-, capability-
                  or time-dependent element reads these; no component checks a provider id; useSwipe
  components/     ScreenHeader, StudentBar (avatars only), Avatar (SVG from traits or photo), StudentPickerCard, MarkChip, StatBlock, SubjectRow, HintRow, LessonRow, LessonNote, LessonMenu, StudyBar, SessionRow, StudyChart, SegmentedControl,
                  PeriodBar and PeriodNav, FreshnessBanner, BottomSheet, TabBar, EmptyState   (one component per kind of
                  information; a block that exists on one screen is reused, never re-implemented, on another)
  lib/            time.ts (the school's timezone), period.ts (labels of kinds and instances), pick.ts (the 12-hour
                  rule), swipe.ts, fit-bar.ts, freshness.ts: pure and unit-tested
  i18n/           react-i18next setup over packages/i18n (see docs/i18n.md)
  styles/         tokens.css (generated, 12), base.css (Tailwind, tokens, fonts)
  sw.ts           service worker: offline shell, push handler (M8)
```

State: TanStack Query for server data (keys by student and period), a tiny Zustand store for the child picked on this device (with the time of the last activity and «Всегда начинать с последнего», in `localStorage`) and for the period kind and instance, which every screen shares and a child switch keeps. Marks math stays in `packages/core` and on the server; the web app formats what the API computed.

**Types from the API.** `pnpm --filter @marksy/web api:types` runs `pnpm --filter @marksy/server openapi` (the document of every route, built without a database) and then openapi-typescript. A test in each package fails when `openapi.json` or `schema.d.ts` is older than the routes.

**Time is the school's.** Today, now, the last school day and the edges of weeks and periods are the child's school timezone (`StudentSummary.timezone` from `/api/auth/me`), never the device's: a phone abroad shows the school's day (`web/src/lib/time.ts`, tested with the device in another zone). Calendar dates (`2026-10-19`) are formatted as dates, without a timezone shift.

## 13.1 Localisation

Summary of `docs/i18n.md`: one `packages/i18n` package with a JSON file per language, consumed by the web app (react-i18next) and by the server for notifications and user-facing errors; `en.json` is the source of truth and the fallback, `ru.json` the second complete file; CLDR plurals; dates and numbers through `Intl` with the user's locale, never through translation files; diary content (subject names, topics, homework, comments) is never translated; grading scale labels and canonical enums (work types, mark kinds) are keys. Language resolution: user setting, then provider default, then browser, then English. CI fails on missing keys and on literal strings in components. German and French are the layout stress test: the five bottom tabs, tiles and chips must fit their labels without truncation.

## 14. Non-functional

### 14.1 Data protection

Marksy stores data about children, and a public project will be run in jurisdictions with different rules (GDPR in the EU and UK, FERPA and COPPA in the US, national laws elsewhere). The design gives every instance the same tools; which rules apply is the operator's decision.

- **Consent record.** Connecting a diary stores `families.consent_version`, `consent_at`, `consent_by`: the text shown on the connect screen (`connect.consent` per interface language, its version `CONSENT_VERSION` in `packages/i18n/src/consent.ts`) says what is collected (the children's names and classes, timetable, marks, absences, homework, teachers' comments), where it is stored (only on the server the app runs on, with whoever set it up; deleted with the family), and that the collector only reads. The API accepts only the version the app shows, so a stale client cannot record a text that was never on screen. Changing the text bumps the version and asks again.
- **Retention.** `families.settings.retention_years` (default: keep everything, which is the point of the product; a family or operator can set a limit, applied by the janitor of 10.4). Operational data has its own limits (10.4, `RETENTION_*` in `env.example`); raw responses are kept 14 days (`RETENTION_RAW_RESPONSES_DAYS`; the one that verified a week of the current term until the term ends) because they hold more than the app needs, and the provider's `redactRaw()` removes the personal fields the app never uses before they are stored.
- **Export.** `GET /api/family/export` returns everything the family owns and the data of the children it follows as JSON (students, marks, history, rules, settings), admin only. Names of another family's members are not in it.
- **Erasure.** `DELETE /api/family` removes the family and all its rows, including notification subscriptions, after a typed confirmation; a child's own data and raw responses go with it unless another family still follows the child, in which case only this family's link and rows go. A member can leave and be erased without deleting the family.
- **Hosted instances.** Every family's credentials are encrypted with a per-family key derived from `CREDENTIALS_KEY` and the family id (HKDF, AES-256-GCM, `server/src/crypto/credentials.ts`), so when one server serves many families (friends, a school club) a database dump does not expose every diary password at once (the login itself is the account's label in Семья and is stored as it is); operators are told in `README` that hosting other people's children's data makes them a data controller, and the consent text names the operator.
- **Minors' accounts.** Marksy stores no birth dates. A student user is a minor by assumption; student accounts cannot change family settings, export data or invite others.
- **Pictures people upload** (a child's photo for the avatar, a wallpaper; owner, 2026-10-25). The browser scales them down first (canvas: the avatar to 512 px square, a wallpaper to 1600 px), but the server trusts nothing it is sent: it accepts only JPEG, PNG and WebP recognised by their signature bytes (never the file name or the declared type), checks the byte size and the pixel size read from the image header, and strips the metadata itself, with no image library: a JPEG keeps only its frame, tables, scans and the JFIF, ICC and Adobe segments (EXIF, XMP, GPS and comments go, also between the scans of a progressive file, and nothing after its end is kept); a PNG and a WebP keep only the chunks a picture needs (an allow-list: text, EXIF, XMP and any private or unknown chunk go, and nothing after IEND or the RIFF size); a second frame header is refused. When a child's data or a family is erased, the pictures go at once with it; the daily janitor, which runs whether the collector is on or not, sweeps any file no row points at. Files live under `data/uploads/` on the server, outside git and outside the web root. A child's photo is seen by the families that follow the child (D54); a wallpaper only by its owner.
- **No third parties.** No analytics, no crash reporting that sends content, and every asset (fonts included) served from the app's own origin: a child's phone never sends a request to Google Fonts or any other CDN.

- Privacy: data about minors. HTTPS only, httpOnly cookies, no analytics, no third-party scripts except fonts. Credentials encrypted at rest; `CREDENTIALS_KEY` never in the repo. Logs redact login, password, tokens, full names.
- Performance: the overview query returns in under 100 ms on a few thousand marks; the PWA shell loads in under 1 s on 4G.
- Offline: the shell and the last overview, feed and lessons per student are cached; a banner shows the age of the data.
- Accessibility: band colours always paired with the number or a label; 44 px tap targets; focus states; `prefers-reduced-motion`.
- Timezone: the school's, per child (`students.timezone`, from the provider or its tenant, falling back to the manifest), for lesson dates, periods and the sync window; notification times ("вечером в 19:00") in the user's own timezone (`users.timezone`), since two families of one child may live apart. Dates stored as `date` for lessons, `timestamptz` for events; displayed in the user's locale. Week start and weekend from `manifest.calendar`, never from code.
- Localisation: twelve interface languages, per user, section 13.1 and `docs/i18n.md`.

## 15. Repository layout and local setup

```
packages/core/        canonical types, DiaryProvider interface, grading scales, marks math,
                      guidance rules, throttled HTTP client, provider conformance tests
providers/_template/  starting point for a new provider
providers/by-eschools/  Belarus, diary.e-schools.by: manifest, schemas, mapper, fixtures
server/               Express API + collector + Drizzle schema and migrations, Vitest + Supertest
web/                  Vite + React PWA, Vitest
docs/                 design.md, providers.md, api-spec.md (by-eschools system notes), tokens.json,
                      mockups.html
docker-compose.yml    postgres:16 with a named volume, port 5432; docker/postgres/init.sql adds marksy_test
env.example          every variable the code reads, with a comment
pnpm-workspace.yaml   packages/*, providers/*, server, web
scripts/              privacy-check.mjs (pnpm privacy)
.claude/              Claude Code: settings.json (permissions), skills next, check, ui-check, privacy-check;
                      agents privacy-reviewer, ux-reviewer
.vscode/              recommended extensions and shared editor settings
```

Build order, milestones, acceptance criteria and the way of working with Claude Code: `docs/build-plan.md`.

## 16. Screen audit: what each element depends on

Every element on every screen was checked against the three layers of section 6.4 and the capability table in `docs/providers.md` section 10. The result is the contract for the implementation: an element may depend only on what its row says. Capabilities and the scale are the **selected child's** (their provider), never the family's: switching the child re-evaluates every row, so two children in different systems each get the interface their diary allows (ux-principles D53).

| Screen | Element | Depends on | Without it |
|---|---|---|---|
| Start | student picker with per-child facts | number of students the user may see; facts gated like Overview | skipped for one student and for student users |
| Every student screen | StudentBar | number of students | hidden for one student; segmented for 2–3, pill with sheet for 4+ |
| Login | provider picker, credential fields, role toggle | provider registry, manifest `auth`, `roles` | one-role providers show no toggle |
| Login | school or district picker | manifest `tenant` | omitted for single-instance systems (by-eschools) |
| Login | language picker | i18n (all twelve, provider only orders) | never hidden |
| Overview | period presets | calendar; the fourth preset from `terms` | three presets when `terms: none` |
| Overview | StatBlock average, count, bands | scale | ordinal scales: level counts, no average |
| Overview | absences column | capability `attendance` | hidden |
| Overview | last school day's marks | marks by date | n/a |
| Overview | Внимание rows | family rules over capabilities: drops, tag hits (tests are the tag "Контрольная"), low marks (`lowMark`), absences (`attendance`), changed marks, account status | each row type disappears with its capability |
| Overview | next school day | capability `futureTimetable` | hidden |
| Overview | "до конца четверти N дней" | `terms` | hidden |
| Marks | filters new / all | always | |
| Marks | tag filter | `lessons` (a mark needs its lesson to carry tags) | hidden |
| Marks | worse-than filters | scale thresholds | hidden for ordinal and pass-fail |
| Marks | absences filter | `attendance` | hidden |
| Marks | StatBlock over the selection | scale | same as Overview |
| Marks | row: work type label, topic, comment icon | `workTypes` / `workTypeRaw`, `topics`, `comments` | each omitted |
| Marks | row: cohort line "class average 72, rank 5/32" | `cohortStats` | omitted (by-eschools) |
| Marks | status chips: missing, excused, late, proposed | `Mark.status`, `FinalMark.role` | omitted; a missing assignment is a zero-valued chip with a "missing" style and counts in the average as the system does |
| Marks | weight badge "×3" | `weights` | omitted |
| Subjects | Период list with trend and "было" | scale compare | ordinal: trend by level |
| Оценки → Итоги | Четверти table | `terms` and, for finals, `finalMarks`; named by term kind | the Итоги view itself needs `finalMarks`; Четверти hidden when `terms: none`; exam table when `exams` |
| Оценки → Итоги | Годы table, manual entry | Marksy's own history; scale per year | always; "другая шкала" badge when scales differ |
| Subject | StatBlock with deltas | scale, `attendance` for the absences column | |
| Subject | "итог за четверть" line, По четвертям strip | `terms`, `finalMarks` | hidden |
| Subject | target / predicted / current row | `targets` | hidden (by-eschools) |
| Subject | distribution chart | scale `distribution` | buckets for points and percent |
| Subject | trend chart: buckets by the selected period, labels under points, band lines | scale, calendar (week start), terms | |
| Subject | goal row in Обратить внимание | `terms` + scale `finalRule` not unknown; goals from scale | hidden; a plain average target calculator stays |
| Subject | Обратить внимание hints | each rule's `requires` | rules skipped |
| Subject | timeline rows | as Marks rows | |
| Schedule | tab itself | `lessons` of any child the user sees | tab hidden only when no such child has lessons, so switching children never moves the tab bar; for a child whose diary has no lessons the tab shows «У дневника Марка нет расписания»; homework items still listed under Главная when `homeworkAssignments` |
| Schedule, Оценки, Предмет, Внимание | teacher comment without a mark | capability `behaviour` | not shown; the Комментарии filter chip and the `comment` rule are hidden |
| Schedule | slot number, time, topic, homework, attachments | each optional field | line omitted |
| Schedule | lesson type badge | `lessonTypes` | omitted |
| Schedule | lesson hints | rule `requires` | skipped |
| Schedule | тег notes and "Обратить внимание" | tags over `homework` / `topics` / `lessonTypes` / `homeworkAssignments` | fields that exist |
| Schedule | several mark chips on one lesson | `marksPerLesson: many` | one chip |
| More | Теги | `lessons` or `homeworkAssignments` | hidden |
| Notifications | alert rules list | family rules; each rule's capability | rules hidden with their capability |
| Family | diary accounts with provider name and status | registry | |
| Sync | "перепроверка четверти" | `terms` ("перепроверка периода" otherwise) | wording |
| Sync | API drift card | always | |

Two things were found by this audit and fixed in the design: notification thresholds were scale constants and are now family rules with scale defaults (section 6.4), and the term vocabulary ("четверть") was hard-coded in several labels and is now taken from `Term.kind` through i18n keys (`term.quarter`, `term.trimester`, `term.semester`, `term.other`).

### 16.1 Assumptions that were found and folded into the model

Each of these was a hidden assumption in the first design and is now an explicit field or setting (details in `docs/providers.md`, "Calendar, names and the rest"):

- Week start and weekend: `manifest.calendar`, used by period presets, "next school day" and tag advice. The prototype's rail switches between Monday / Saturday–Sunday and Sunday / Friday–Saturday.
- Names: `givenName`, `familyName`, `displayName` and `manifest.nameOrder`.
- A child followed by two households: one child, shared through `family_students`; the second parent joins the existing family or follows the child from their own family, without a copy (7.1, 7.2, ux-principles D54).
- Children of one family in different schools and systems: a family has several diary accounts, and provider, capabilities, scale, calendar, bells and the sync window are the child's (D53, D55).
- Simple mode for the youngest students: `users.ui_mode` (section 5.7).
- Guidance can be switched off per family and per user; facts stay, advice goes.
- Data protection: section 14.1.
- The thinnest provider, `providers/demo-minimal`, is part of CI, so "works without lessons, work types, comments, attendance, terms and finals" is tested on every change rather than assumed.

## 17. Open questions

- **School names for e-schools.** The picker names the school only when two children's schools differ, with `StudentRef.schoolName` or, without it, the diary's name (5.1). e-schools gives no school name Marksy may keep (`school_name` in `/me` is personal, api-spec 6.1); `/institution/schools` (6.10.6) is not verified and not in the allow-list. Decide when the second child at another school appears.

- The first non-Belarusian provider will test the canonical model. Candidates with a public or semi-public API and many families: Russia (dnevnik.ru, МЭШ), Ukraine (nz.ua), Poland (Librus, Vulcan), Germany (regional portals), Kazakhstan (Kundelik). Each has its own grading scale and auth; `docs/providers.md` is written so that the second provider is a pull request, not a redesign.

- Student e-schools login endpoint and whether a student token can read the same diary routes (section 7.5).
- Whether e-schools gives the same pupil id to two parents' logins (the shared-child match of 7.2 depends on it). Check when a second parent connects; until then a mismatch only means two copies, as before.
- A child who changes school and system mid-year: two identities of one person. Not merged automatically; a later "это тот же ребёнок" action in Семья could link them like `subject_links` do for subjects.
- Whether teachers enter marks after 14:00 often enough to justify an evening run (section 10.2). Measure with `marks.first_seen_at` versus `lessons.date` after a month.
- How the school computes the quarter final from the marks (plain rounded average, weighted tests, or teacher's judgement). Compare projected finals with real ones after 2026-10-31 and adjust the goal calculator (section 6.2).
- `final/whole` populated shape (after 2026-10-31).
- Whether `subjects.id` is stable across school years and shared across classes of the same school.
- Whether the API can return a past school year (a `school_year` parameter on the diary routes, or a different `school_year` uuid in `time_activities`). If yes, backfill previous years automatically; if not, manual entry of year finals stays the only source for history before Marksy.
- Hosting of the PWA: same home machine via Cloudflare Tunnel, or a split setup with the API in the cloud reading a database the home collector writes to (api-spec 9.1). The schema supports both; `SYNC_ENABLED` switches the collector off in the cloud copy.
