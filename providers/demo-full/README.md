# demo-full

A fictional diary with a rich capability set, served only from `fixtures/`. There is no real system behind it and it is never offered to families (status `experimental`).

It exists for two reasons:

- `pnpm db:seed` creates the demo family on this provider, so the app shows quarters, lessons, work types, comments and absences without a diary account and without naming a real system outside its provider folder.
- The collector tests in `server/` use it for everything `demo-minimal` does not have: lessons with ids that appear later, several marks per lesson, absences in the mark cell, finals.

## The fictional API

All paths are relative to `https://api.diary.demo.example.com`.

| Request | Fixture | Notes |
|---|---|---|
| `POST /api/v2/auth` | `auth` | `{ access_token }` |
| `GET /api/v2/profile` | `profile` | the parent and their pupils with class id, title and year |
| `GET /api/v2/pupils/{id}/year` | `year-1`, `year-2` | school year, four `QUARTER` periods, breaks, `graded: false` for a class without marks |
| `GET /api/v2/pupils/{id}/subjects` | `subjects-1`, `subjects-2` | |
| `GET /api/v2/pupils/{id}/diary?week=YYYY-MM-DD` | `diary-1-w1`, `diary-1-w2`, `diary-2-w1`, `diary-empty` | Monday-to-Saturday week; a lesson `uid` may be `null` until the school fills it in |
| `GET /api/v2/pupils/{id}/finals` | `finals-1`, `finals-2` | rows of subject, period (`null` = year) and value |

Mark cells: a number or `n/m` is numeric on the 10-point scale; `зач`, `незач`, `осв`, `н/а` are pass, fail, exempt and not assessed; `н` is an absence and becomes attendance, never a mark. Work types: `CLASS`, `HOME`, `TEST`, `QUIZ`, `LAB`, `ESSAY`, `DICTATION`, `ORAL`; anything else is reported as drift and kept as `other`.
