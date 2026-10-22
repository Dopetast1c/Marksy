---
name: check
description: Format, typecheck, lint, test and privacy-check the whole workspace and fix what fails.
---

1. Run `pnpm format`, then `pnpm check` (formatting, typecheck, lint, tests, privacy check).
2. If something fails, fix the cause, not the symptom: no `@ts-ignore`, no disabled lint rules, no skipped or weakened tests, no `privacy-ok` markers unless the match is a deliberate fictional example, and then say why in the same comment.
3. Repeat until `pnpm check` is green.
4. Report in a few lines: what failed, what you changed, and anything you could not fix.
