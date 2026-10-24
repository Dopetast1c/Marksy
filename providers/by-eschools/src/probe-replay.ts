import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Transport } from '@marksy/core';
import { currentClass } from './map';
import { endpointName } from './probe';
import { schoolClass } from './schemas';

// `pnpm probe --offline` (CLAUDE.md "Real diary runs"): the saved raw responses of a probe run (data/probe/<time>/,
// one file per request, "07-subjects-1.json") served again by name, so schemas, sanitize(), the drift checks and the
// fixture writing run without a login. A request with no saved answer gets a 404 and is listed in `missing`: that
// response needs a real run.

export interface SavedRun {
  dir: string;
  /** The time of the original run: what "today" was */
  startedAt: Date;
  weeks: number;
  /** weeks after today's that the run read too (--next) */
  ahead: number;
  files: Map<string, { text: string; status: number }>;
}

/** The newest run folder, or the one named */
export function findRun(probeDir: string, name?: string): string | null {
  if (!existsSync(probeDir)) return null;
  const runs = readdirSync(probeDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^\d{4}-\d{2}-\d{2}T/.test(d.name))
    .map((d) => d.name)
    .sort();
  const run = name ? runs.find((r) => r === name) : runs.at(-1);
  return run ? join(probeDir, run) : null;
}

/** "2026-10-23T05-32-26-676Z", the folder name of a run, back to its time */
export const timeOfRun = (folder: string) =>
  new Date(folder.replace(/T(\d\d)-(\d\d)-(\d\d)-(\d{3})Z$/, 'T$1:$2:$3.$4Z'));

export function loadRun(dir: string): SavedRun {
  const files = new Map<string, { text: string; status: number }>();
  const statusOf = new Map<string, number>();
  const indexFile = join(dir, 'index.json');
  if (existsSync(indexFile)) {
    for (const e of JSON.parse(readFileSync(indexFile, 'utf8')) as { file: string; status: number }[])
      statusOf.set(e.file, e.status);
  }
  for (const f of readdirSync(dir)) {
    const m = /^\d+-(.+)\.json$/.exec(f);
    if (!m || m[1] === 'other') continue;
    files.set(m[1]!, { text: readFileSync(join(dir, f), 'utf8'), status: statusOf.get(f) ?? 200 });
  }
  const runFile = join(dir, 'run.json');
  const meta = existsSync(runFile)
    ? (JSON.parse(readFileSync(runFile, 'utf8')) as { startedAt: string; weeks: number; ahead?: number })
    : undefined;
  const folder = dir.split(/[\\/]/).at(-1)!;
  // the most recent weeks were read, one file each: as many as the first student has
  const weeksSeen = Math.max(1, [...files.keys()].filter((n) => /^lessons-1-w\d+$/.test(n)).length);
  return {
    dir,
    startedAt: meta ? new Date(meta.startedAt) : timeOfRun(folder),
    weeks: meta?.weeks ?? weeksSeen,
    ahead: meta?.ahead ?? 0,
    files,
  };
}

/** Serves a saved run by request name; ids for the names come from the saved me, classes and weeks */
export function replayTransport(run: SavedRun): { transport: Transport; missing: string[] } {
  const json = (name: string) => {
    const f = run.files.get(name);
    return f ? (JSON.parse(f.text) as unknown) : undefined;
  };
  const me = json('me') as { students_for_parent?: { profile_id: string; school_id: string }[] } | undefined;
  const kids = me?.students_for_parent ?? [];
  const students = kids.map((k) => k.profile_id);
  const schools = [...new Set(kids.map((k) => k.school_id))];
  const weeks = ((json('week_activities') as { uuid: string }[] | undefined) ?? []).map((w) => w.uuid);
  const classes = students.map((_, i) => {
    const list = json(`classes-${i + 1}`);
    const parsed = Array.isArray(list) ? list.map((c) => schoolClass.safeParse(c)).filter((r) => r.success) : [];
    return currentClass(parsed.map((r) => r.data!))?.uuid ?? '';
  });
  const missing: string[] = [];
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const transport: Transport = async (req) => {
    const name = endpointName(req.method, new URL(req.url), students, weeks, classes, schools);
    const saved = name ? run.files.get(name) : undefined;
    if (name === 'login') return { status: 200, headers, text: JSON.stringify({ auth_token: 'offline' }) };
    if (!saved) {
      missing.push(name ?? 'an unnamed request');
      return { status: 404, headers, text: '{}' };
    }
    return { status: saved.status, headers, text: saved.text };
  };
  return { transport, missing };
}
