# Adding a diary system

Marksy reads a school's electronic diary through small plug-ins called *providers*. Every screen, average, filter, goal and the rest of the app works the same for every provider; a provider only knows how to sign in to one diary system and how to turn what it answers into Marksy's common format. This page explains what that takes, so you can ask for your school's system or connect it in your own copy. The full technical contract is in [`providers.md`](providers.md).

## Before you start

- **You need an account.** A parent's or a student's login to the diary, the same one you use in its website or mobile app. Marksy signs in with it on your behalf; it never needs a school's or a teacher's access.
- **The diary must answer a program.** Most diary websites and apps load their data from an API in the background. Open the diary in a desktop browser with the developer tools' *Network* tab open and look for requests that return JSON when you open the marks or the timetable. If you see them, a provider is very likely possible.
- **Read the terms of use.** Some systems forbid automated access or limit how often you may ask. A provider must respect that, and be gentler than the limit, not harder.
- **Read-only, always.** A provider only reads. It never sends a mark, a message, a signature or a password change, and Marksy's HTTP client refuses every request the provider has not declared as a read.

## Ask for it

If you would rather have Marksy support your school's system than build it yourself, [open an issue](https://github.com/Dopetast1c/Marksy/issues) and describe it:

- the system's name and its website, and who uses it (a country, a region, one school);
- the grading scale (for example 1 to 10, 1 to 5, letters, percentages) and the kind of terms (quarters, trimesters, semesters);
- what it shows: a timetable with dates, homework, lesson topics, teachers' comments, attendance, term and year marks;
- how you sign in (a login and password, a code sent to your phone, a sign-in through another service).

Never paste a real name, a mark with a child's name, a login, a password or a screenshot with personal data into an issue. If a sample of a response helps, replace every name, id and comment first.

## Build it in your own copy

Marksy is free for personal and other non-commercial use, so you may build a provider for your own family in your own copy of the repository. You need Node.js 22, pnpm and Docker, and some TypeScript. The steps, in short (the details of each are in [`providers.md`](providers.md), section 9):

1. **Start from the template.** Copy `providers/_template` to `providers/<id>`, where the id is the country code and the system's name in lower case.
2. **Describe the system in a manifest** (`provider.json`): its name and website, the fields of its login form, the grading scale, the time zone, the calendar (the first day of the week, the school days), what it offers (its *capabilities*), how often it may be asked, and the exact list of read requests it may make.
3. **Write down how the API works** in the provider's own `README.md`: every request the official website makes, what it returns, and how sure you are of each field.
4. **Write the schemas and the mapping.** A schema per response that tolerates fields it does not know, and a mapping from the responses to Marksy's common types: students, terms, subjects, lessons, marks, final marks. All requests go through the shared client the provider is given; a provider has no network access of its own.
5. **Make test data that is not real.** Write a `sanitize()` function that replaces every name, id and comment, record the responses of your own account once with it, and keep only the sanitised result as the provider's fixtures. Check them twice for names: nothing real may ever be committed.
6. **Pass the shared test.** `pnpm test:provider <id>` checks the manifest, the mapping, the stable ids, the grading scale, unknown fields, the sanitising and that every request was an allowed read with exactly one sign-in.
7. **List it.** Add the provider to `packages/registry/src/index.ts` with the status `beta`, then sign in to it from the app with your own account and watch a few days of syncing.

## What the app does with it

Everything a diary may or may not have is optional. If your system has no lesson types, no comments, no attendance, no terms or no timetable ahead, the provider says so in its capabilities, and every screen shows what exists instead of empty columns. The grading scale decides the colours of the marks, how averages are computed and shown, and how goals are counted, so a 5-point, a 12-point or a letter scale works without any change to the screens.

The provider also says what its system expects from the network, for example that it answers only from its own country or not through a VPN. Marksy checks the connection before it signs in, and never counts a host that is offline against the diary.

## Keeping it working

Diaries change their APIs without notice. Marksy validates every response, records fields that appear, disappear or change type, and tells the family's admin, so a change is noticed before a mark goes missing. When that happens, update the schemas and the mapping, make new sanitised fixtures and run the shared test again.

Pull requests are not accepted. If your provider would help other families, describe it in an issue: the system, what works, and how long you have used it.
