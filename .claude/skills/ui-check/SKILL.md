---
name: ui-check
description: Compare an implemented screen with docs/mockups.html and the UX invariants, and list the differences.
argument-hint: "[screen, e.g. Главная, Оценки, Предмет]"
---

Check the screen $ARGUMENTS against the reference.

1. In `docs/mockups.html` find the render function of the screen (`renderHome`, `renderMarks`, `renderSubjects`, `renderSubject`, `renderLessons`, `renderEvents`, `renderInbox`, `renderStudy`, `renderMore`, ...) and the CSS it uses. Write down the blocks in order, their states (empty, loading, no data for the period, class without marks, student mode, capability missing) and the copy.
2. Read the screen's section in `docs/design.md` 5 and the invariants and decisions in `docs/ux-principles.md` that apply to it.
3. Read the implementation in `web/src`. Compare block order, states, copy (as i18n keys), components used (one kind of information, one component: `CLAUDE.md`), stripes (3 px, square), PeriodBar plus PeriodNav, colours from tokens only.
4. If the dev server is running (`pnpm dev`) and Playwright is available, take screenshots of the prototype and the app at 390 px wide and compare them.
5. Report the differences as a list, most important first, each with the file and what to change. Fix the ones that are clearly bugs; ask before changing anything that is a design choice.
