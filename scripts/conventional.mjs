// Conventional Commits as this project uses them (CLAUDE.md, "Commits and releases"): one shared reading for the
// commit-msg hook, the CI check, the version proposal and the release notes.

export const TYPES = ['feat', 'fix', 'perf', 'refactor', 'docs', 'test', 'chore', 'ci', 'build'];

const HEADER = new RegExp(`^(${TYPES.join('|')})(?:\\(([a-z0-9][a-z0-9./-]*)\\))?(!)?: (\\S.*)$`);

/** The message without git's comment lines, trimmed */
export const cleanMessage = (message) =>
  message
    .split(/\r?\n/)
    .filter((l) => !l.startsWith('#'))
    .join('\n')
    .trim();

/**
 * The parts of a message, or null when its first line is not a conventional header. A merge or a revert made by git
 * is { kind: 'merge' | 'revert' } and has no type.
 */
export function parseCommit(message) {
  const text = cleanMessage(message);
  const [header = '', ...rest] = text.split('\n');
  if (/^Merge /.test(header)) return { kind: 'merge', header };
  if (/^Revert "/.test(header)) return { kind: 'revert', header };
  const m = header.match(HEADER);
  if (!m) return null;
  const body = rest.join('\n');
  return {
    kind: 'commit',
    type: m[1],
    scope: m[2] ?? null,
    subject: m[4],
    breaking: !!m[3] || /^BREAKING[ -]CHANGE: /m.test(body),
    body,
    header,
  };
}
