# First run on the owner's machine

Claude Code follows this file when `_setup/` exists in the repository root (CLAUDE.md, "First run"). It turns the folder into a working, pushed repository. The owner only answers the questions it asks and signs in to GitHub once when git asks. Shell commands run in Git Bash on Windows.

## 1. Tools

Check `node -v` (22 or newer), `git --version`, `docker version` (the server part must answer: Docker Desktop is running) and `pnpm -v`.

- pnpm missing: `npm install -g pnpm@10.28.0` (user-level, no admin rights needed).
- Node, Git or Docker missing, or Docker not running: stop and tell the owner exactly what to install or start. Do not try to install them.

## 2. Claude Code and VS Code settings

Move `_setup/claude` to `.claude` and `_setup/vscode` to `.vscode`, then delete `_setup`. If `.claude` or `.vscode` already exists, merge file by file and keep the owner's local `settings.local.json`. Tell the owner to restart the Claude Code session afterwards, so the project permissions and skills load.

## 3. Environment

Run `pnpm setup:env`. It creates `.env` from `.env.example` and generates `SESSION_SECRET` and `CREDENTIALS_KEY`, printing no values. Do not open `.env`. Tell the owner which lines are left for them (the diary login and the dev Marksy login, needed from M2).

## 4. Install and verify

```
pnpm install
pnpm db:up
pnpm check
```

All must be green. Then start `pnpm dev`, check that http://localhost:5173/api/health answers `{"status":"ok"}`, and stop it.

## 5. Git and GitHub

1. Identity: `git config user.name` and `git config user.email`. If either is empty, ask the owner. The repository is public, so suggest the GitHub no-reply address (GitHub, Settings, Emails, "Keep my email addresses private") instead of a work or personal e-mail. Set them for this repository only (`git config user.name ...` without `--global`).
2. If there is no `.git`: `git init -b main` and `git remote add origin https://github.com/Dopetast1c/Marksy.git`.
3. `git fetch origin`. If `origin/main` exists (for example a README or LICENSE created on GitHub), merge it: `git pull origin main --allow-unrelated-histories --no-rebase`. On a conflict keep the local version of the file, unless the remote one is clearly newer, and say which files were affected.
4. `pnpm privacy`, then `git add -A` and read `git status`: nothing from `.env`, `data/`, `Claude outputs/` or `node_modules/` may be staged.
5. Commit: `Docs, prototype and workspace scaffold`. Push: `git push -u origin main`. The first push opens the Git Credential Manager sign-in in the browser; tell the owner to complete it.

## 6. GitHub page

The repository is public, so its page should explain the app well. The README already does; set the short description and topics too. If `gh` is installed and `gh auth status` succeeds:

```
gh repo edit Dopetast1c/Marksy --description "Family app for school marks, free for non-commercial use. Connects to your school's e-diary through its API and adds averages and trends, the full history of every mark, a plan for the days ahead, study time, notifications and a login for every parent and child. Self-hosted PWA in twelve languages." --add-topic school --add-topic education --add-topic grades --add-topic e-diary --add-topic parents --add-topic family --add-topic pwa --add-topic self-hosted --add-topic typescript --add-topic react --add-topic nodejs --add-topic postgresql
```

Otherwise give the owner the description and topics to paste into the repository's About settings. Copy for the GitHub page (README, description, topics) is positive and generic: it describes what Marksy builds on top of a school diary's API, does not name a country or a specific diary system, does not criticise any existing diary, and never calls the project open source (it is source-available under PolyForm Noncommercial 1.0.0).

## 7. Report

Say in a few lines what was done, what the owner still has to do (fill the diary login in `.env` before M2; on Windows allow Node.js on private networks the first time `pnpm dev:lan` runs) and that the next step is `/next M1`.
