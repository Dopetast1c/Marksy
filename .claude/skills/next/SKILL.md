---
name: next
description: Implement the next milestone of docs/build-plan.md (or the one given), plan first, then code, tests and docs.
argument-hint: "[milestone, e.g. M3]"
---

Work on milestone $ARGUMENTS of `docs/build-plan.md`. If no milestone is given, take the first one whose status is not `done`.

1. Read `CLAUDE.md`, the milestone's section in `docs/build-plan.md` and every doc section it lists under **Read**. For UI milestones also open the matching `render*` functions in `docs/mockups.html`.
2. Check the branch with `git status` and `git branch`. If you are not on the milestone branch from the status table, create it with `git switch -c <branch>` from `main`.
3. Write a plan and stop for approval: the files you will add or change, the tests, the doc sections each part relies on, and the questions the docs do not answer. Do not write code before the plan is approved. If the milestone is large, propose how to split it across sessions and commits.
4. Implement in small steps. After each step run the tests for the touched package (`pnpm --filter <pkg> test`). Keep the rules in `CLAUDE.md`: provider boundary, read-only collector, no real data, family scoping, tokens instead of colours, i18n keys instead of strings.
5. Run the `check` skill until it is green.
6. If a decision or a detail changed, edit the docs in place (`docs/design.md`, `docs/ux-principles.md` decision log, `docs/providers.md`, `docs/api-spec.md`, `README.md`). Set the milestone status in `docs/build-plan.md` (`in progress` or `done`) and add a line under **Notes** if something was decided.
7. Commit with a short message that names the milestone (`M3: planner catch-up and pause`) and push the branch (`git push -u origin <branch>` the first time).
8. When the milestone's **Done when** list is met and the `check` and `privacy-check` skills are green: set its status to `done` in `docs/build-plan.md`, commit, `git switch main`, `git pull`, `git merge --no-ff <branch>`, run `pnpm check` on `main`, push `main`. If anything in the list needs the owner (a check on the phone, a command with real credentials), ask for it before merging.
9. End with a summary: what was built, what is left in the milestone, what the owner should check on the phone, open questions.
