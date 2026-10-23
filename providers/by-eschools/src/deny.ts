import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// The local deny-list of the pre-commit guard (CLAUDE.md "Real diary runs", .githooks/pre-commit): the names and ids
// of the latest real responses, so that none of them can reach a commit. It lives in data/ (gitignored) and holds the
// values themselves, like the raw responses beside it; the guard reports a file and a line, never the value.
// Given names and patronymics are left out as single words on purpose: they are common words («Петровна», «Анна»)
// that fictional examples use too, and alone they point to nobody; they still count inside a full name.

export interface DenyList {
  /** Family names, matched as whole words */
  words: string[];
  /** Full names, matched anywhere in a line */
  phrases: string[];
  /** Ids of the account, the children, their classes and schools, matched anywhere */
  ids: string[];
}

/** Keys whose string is a person's full name, family name first (6.1, 6.7a) */
const FULL_NAME = new Set(['full_name', 'teacher', 'fio']);
/** Keys of one part of a person's name that identifies them; first_name and name (given names) are not */
const FAMILY_NAME = new Set(['last_name', 'surname']);
const ID_KEYS = new Set(['user_id', 'profile_id', 'school_id', 'our_school_id', 'school', 'class_id']);

const words = (s: string) => s.split(/[^\p{L}-]+/u).filter((w) => w.length >= 4);

export function denyValues(responses: readonly { name: string; raw: unknown }[]): DenyList {
  const w = new Set<string>();
  const p = new Set<string>();
  const ids = new Set<string>();
  const walk = (v: unknown, key: string | null, endpoint: string, depth: number) => {
    if (Array.isArray(v)) return v.forEach((x) => walk(x, key, endpoint, depth));
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      // a teacher as an object (6.10.3): "Фамилия Имя" as a phrase, the family name as a word
      if (key === 'teacher' && typeof o.surname === 'string' && typeof o.name === 'string')
        p.add(`${o.surname} ${o.name}`.trim().toLowerCase());
      // the class itself (6.6): its uuid is in every diary URL of the child
      if (/^classes-/.test(endpoint) && depth === 0 && typeof o.uuid === 'string') ids.add(o.uuid.toLowerCase());
      for (const [k, x] of Object.entries(o)) walk(x, k, endpoint, depth + 1);
      return;
    }
    if (typeof v !== 'string' || !key) return;
    const s = v.trim().replace(/\s+/g, ' ');
    if (!s) return;
    if (FULL_NAME.has(key)) {
      if (s.length >= 6) p.add(s.toLowerCase());
      // family name first: only the first word on its own (a short one would match too much)
      const [family] = s.split(/[^\p{L}-]+/u).filter(Boolean);
      if (family && family.length >= 4) w.add(family.toLowerCase());
    } else if (FAMILY_NAME.has(key)) {
      for (const x of words(s)) w.add(x.toLowerCase());
    } else if (ID_KEYS.has(key) && s.length >= 6) {
      ids.add(s.toLowerCase());
    }
  };
  for (const r of responses) walk(r.raw, null, r.name, 0);
  return { words: [...w].sort(), phrases: [...p].sort(), ids: [...ids].sort() };
}

/**
 * data/deny-list.json, merged with what earlier runs found (an offline run on an older run never drops a newer name);
 * `login` is the diary login of a real run, kept as an id
 */
export function writeDenyList(root: string, list: DenyList, login?: string): void {
  const file = join(root, 'data', 'deny-list.json');
  const old: Partial<DenyList> = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Partial<DenyList>) : {};
  const merge = (a: readonly string[] = [], b: readonly string[] = []) => [...new Set([...a, ...b])].sort();
  const ids = login && login.trim().length >= 4 ? [...list.ids, login.trim().toLowerCase()] : list.ids;
  mkdirSync(join(root, 'data'), { recursive: true });
  writeFileSync(
    file,
    JSON.stringify(
      {
        builtAt: new Date().toISOString(),
        source: 'by-eschools probe',
        words: merge(old.words, list.words),
        phrases: merge(old.phrases, list.phrases),
        ids: merge(old.ids, ids),
      },
      null,
      2,
    ),
  );
}
