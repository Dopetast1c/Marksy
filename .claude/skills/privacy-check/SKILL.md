---
name: privacy-check
description: Run the privacy script and a privacy and security review of the current changes before merging.
---

1. Run `pnpm privacy` and fix every finding.
2. Use the `privacy-reviewer` agent to review `git diff main...HEAD` plus uncommitted changes.
3. Report its findings, most severe first, and fix the confirmed ones. Never weaken a rule to make the check pass.
