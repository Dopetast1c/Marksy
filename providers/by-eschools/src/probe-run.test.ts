import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import unsanitisedMe from '../fixtures/unsanitised/me.json';
import { denyValues } from './deny';
import { findRun, loadRun, replayTransport, timeOfRun } from './probe-replay';
import { KEPT_RUNS, keepLatestRuns, runProbe } from './probe-run';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = resolve(here, '../fixtures');

/** A saved run made of the committed (fictional) fixtures, named as a real run names its files */
function savedRunOf(root: string, folder: string) {
  const dir = join(root, 'data', 'probe', folder);
  mkdirSync(dir, { recursive: true });
  const names = Object.values(
    JSON.parse(readFileSync(join(fixtures, 'routes.json'), 'utf8')) as Record<string, string>,
  );
  names.forEach((name, i) =>
    writeFileSync(
      join(dir, `${String(i + 1).padStart(2, '0')}-${name}.json`),
      readFileSync(join(fixtures, `${name}.json`), 'utf8'),
    ),
  );
  return dir;
}

let tmp: string | undefined;
afterEach(() => tmp && rmSync(tmp, { recursive: true, force: true }));

describe('pnpm probe --offline', () => {
  it('replays a saved run by name: every request is answered, nothing reaches the network', async () => {
    tmp = mkdtempSync(join(tmpdir(), 'marksy-probe-'));
    // the eighth week of the fixtures' school year, read with the five before it
    const weeks = JSON.parse(readFileSync(join(fixtures, 'week_activities.json'), 'utf8')) as { start_ts: number }[];
    const clock = new Date(weeks[7]!.start_ts + 2 * 86_400_000);
    const folder = clock.toISOString().replace(/[:.]/g, '-');
    savedRunOf(tmp, folder);
    const run = loadRun(findRun(join(tmp, 'data', 'probe'))!);
    expect(run.startedAt).toEqual(clock);
    expect(run.weeks).toBe(8);
    const replay = replayTransport(run);
    const out: string[] = [];
    const fixturesOut = join(tmp, 'fixtures');
    mkdirSync(fixturesOut);
    const code = await runProbe({
      transport: replay.transport,
      credentials: { login: 'offline', password: 'offline' },
      clock: () => run.startedAt,
      sleep: async () => undefined,
      weeks: 6,
      root: tmp,
      fixturesDir: fixturesOut,
      saveRaw: false,
      out: (l) => out.push(l),
      err: (l) => out.push(l),
    });
    expect(replay.missing).toEqual([]);
    expect(out.join('\n')).toContain('School details (6.7a, 6.10), per student');
    // no raw responses are written offline; the deny-list is rebuilt
    expect(readdirSync(join(tmp, 'data', 'probe'))).toEqual([folder]);
    expect(existsSync(join(tmp, 'data', 'deny-list.json'))).toBe(true);
    expect([0, 1]).toContain(code);
  });

  it('the newest run by default, a named one on request; three runs are kept', () => {
    tmp = mkdtempSync(join(tmpdir(), 'marksy-probe-'));
    const probe = join(tmp, 'data', 'probe');
    const names = [
      '2026-10-20T05-00-00-000Z',
      '2026-10-21T05-00-00-000Z',
      '2026-10-22T05-00-00-000Z',
      '2026-10-23T05-00-00-000Z',
    ];
    for (const n of names) mkdirSync(join(probe, n), { recursive: true });
    expect(findRun(probe)).toBe(join(probe, names[3]!));
    expect(findRun(probe, names[0])).toBe(join(probe, names[0]!));
    expect(findRun(probe, 'nope')).toBeNull();
    keepLatestRuns(probe, KEPT_RUNS);
    expect(readdirSync(probe).sort()).toEqual(names.slice(1));
    expect(timeOfRun('2026-10-23T05-32-26-676Z')).toEqual(new Date('2026-10-23T05:32:26.676Z'));
  });

  it('cannot log in: the offline script loads no network transport, no credentials and not the live probe', () => {
    const seen = new Set<string>();
    const walk = (file: string) => {
      if (seen.has(file)) return;
      seen.add(file);
      const text = readFileSync(file, 'utf8');
      expect(text, file).not.toMatch(/fetchTransport|DIARY_LOGIN|DIARY_PASSWORD|process\.env/);
      for (const m of text.matchAll(/^\s*(?:import|export)\s+(?!type\b)[^;]*?from\s+'(\.[^']+)'/gms)) {
        if (m[1]!.endsWith('.json')) continue;
        const base = resolve(dirname(file), m[1]!);
        const next = existsSync(`${base}.ts`) ? `${base}.ts` : resolve(base, 'index.ts');
        expect(next.replace(/\\/g, '/'), file).not.toMatch(/scripts\/probe\.ts$/);
        walk(next);
      }
    };
    walk(resolve(here, '../scripts/probe-offline.ts'));
    expect([...seen].some((f) => f.endsWith('probe-replay.ts'))).toBe(true);
    const pkg = JSON.parse(readFileSync(resolve(here, '../package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts['probe:offline']).not.toMatch(/env-file/);
  });
});

describe('the deny-list of the pre-commit guard', () => {
  it('holds family names, patronymics, full names and ids; not given names', () => {
    const list = denyValues([
      { name: 'me', raw: unsanitisedMe },
      {
        name: 'student_subjects-1',
        raw: [{ id: 's-1', teacher: 'Петровская Анна Сергеевна', teacher_id: 't-1' }],
      },
      {
        name: 'planning-1',
        raw: [{ templates: [{ teacher: { id: 't-2', name: 'Ольга', surname: 'Ковальчук', patronymic: 'Ивановна' } }] }],
      },
    ]);
    expect(list.phrases).toContain('петровская анна сергеевна');
    expect(list.phrases).toContain('ковальчук ольга');
    expect(list.words).toEqual(expect.arrayContaining(['петровская', 'сергеевна', 'ковальчук', 'ивановна']));
    expect(list.words).not.toContain('анна');
    expect(list.words).not.toContain('ольга');
    for (const kid of unsanitisedMe.students_for_parent) {
      expect(list.ids).toContain(kid.profile_id.toLowerCase());
      expect(list.phrases).toContain(kid.full_name.toLowerCase());
    }
  });
});
