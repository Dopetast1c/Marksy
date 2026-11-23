// How often the collector reads each kind of a child's diary data (docs/design.md 10.2): the child's sync mode, a
// preset of these settings or the family's own. Every setting names a canonical kind of data, never a request of a
// provider; which of them apply comes from the provider's capabilities, and the provider's limits (one login per
// minLoginIntervalMinutes, maxRequestsPerRun) stay hard bounds whatever is chosen here.

/** How often during the child's school day the current week is read */
export const DAY_RATES = ['hourly', 'every2h', 'thrice', 'afterSchool'] as const;
/** The previous week (late marks): in every run, in the first run of the day, or only once after it ended */
export const PREVIOUS_WEEK = ['everyRun', 'daily', 'off'] as const;
/**
 * The next school week (homework set ahead; capabilities.futureTimetable): in every run, in the first run of the day
 * and every run on the child's last school day of the week, only on that last day, or never
 */
export const NEXT_WEEK = ['everyRun', 'daily', 'lastSchoolDay', 'off'] as const;
/** Every other week of the current term again (changed and removed marks) */
export const TERM_RECHECK = ['weekly', 'biweekly', 'monthly', 'off'] as const;
/** Final marks (capabilities.finalMarks): daily from two weeks before a term ends until it closes, weekly, never */
export const FINALS = ['termEnd', 'weekly', 'off'] as const;
/** Subjects, bells, the regular week, rooms and teachers; the start of a term and an unknown subject refresh them too */
export const SCHOOL_REFRESH = ['weekly', 'monthly', 'onChange'] as const;
/** The school year, terms, holidays and the child's class; a date outside them refreshes them too */
export const CALENDAR_REFRESH = ['monthly', 'onChange'] as const;

export type DayRate = (typeof DAY_RATES)[number];
export type PreviousWeek = (typeof PREVIOUS_WEEK)[number];
export type NextWeek = (typeof NEXT_WEEK)[number];
export type TermRecheck = (typeof TERM_RECHECK)[number];
export type FinalsRead = (typeof FINALS)[number];
export type SchoolRefresh = (typeof SCHOOL_REFRESH)[number];
export type CalendarRefresh = (typeof CALENDAR_REFRESH)[number];

export interface SyncCadence {
  day: DayRate;
  previousWeek: PreviousWeek;
  nextWeek: NextWeek;
  termRecheck: TermRecheck;
  finals: FinalsRead;
  school: SchoolRefresh;
  calendar: CalendarRefresh;
}

/** Each setting's options, the most frequent first (mergeCadences relies on the order) */
export const CADENCE_OPTIONS: { readonly [K in keyof SyncCadence]: readonly SyncCadence[K][] } = {
  day: DAY_RATES,
  previousWeek: PREVIOUS_WEEK,
  nextWeek: NEXT_WEEK,
  termRecheck: TERM_RECHECK,
  finals: FINALS,
  school: SCHOOL_REFRESH,
  calendar: CALENDAR_REFRESH,
};

export const SYNC_MODES = ['marks', 'noMarks', 'light', 'custom'] as const;
export type SyncMode = (typeof SYNC_MODES)[number];
export type SyncPreset = Exclude<SyncMode, 'custom'>;

export const CADENCE_PRESETS: Readonly<Record<SyncPreset, Readonly<SyncCadence>>> = {
  /** A year with marks: today's marks within the hour, late ones and next week's homework once a day */
  marks: {
    day: 'hourly',
    previousWeek: 'daily',
    nextWeek: 'daily',
    termRecheck: 'weekly',
    finals: 'termEnd',
    school: 'monthly',
    calendar: 'monthly',
  },
  /** A year without marks (grades 1 to 2 in some systems): homework and absences once a day after lessons */
  noMarks: {
    day: 'afterSchool',
    previousWeek: 'off',
    nextWeek: 'lastSchoolDay',
    termRecheck: 'off',
    finals: 'off',
    school: 'monthly',
    calendar: 'monthly',
  },
  /** Marks once a day after lessons, the term checked every two weeks */
  light: {
    day: 'afterSchool',
    previousWeek: 'daily',
    nextWeek: 'lastSchoolDay',
    termRecheck: 'biweekly',
    finals: 'termEnd',
    school: 'monthly',
    calendar: 'monthly',
  },
};

/** What a family stores for one child (family_students.settings.sync) */
export interface ChildSyncSettings {
  /** Absent: the preset that fits the child's year (marks or noMarks), so it follows a change of year by itself */
  mode?: SyncMode;
  /** With mode custom: the settings changed from the year's preset; anything unknown is ignored */
  custom?: Partial<Record<keyof SyncCadence, string>>;
}

/** The preset a child's year gets when the family chose none */
export const defaultPreset = (hasMarks: boolean): SyncPreset => (hasMarks ? 'marks' : 'noMarks');

/** The settings a child is read with: the family's choice, or the preset of the child's year */
export function resolveCadence(settings: ChildSyncSettings | undefined, hasMarks: boolean): SyncCadence {
  const mode = settings?.mode;
  if (mode && mode !== 'custom' && mode in CADENCE_PRESETS) return { ...CADENCE_PRESETS[mode] };
  const out: SyncCadence = { ...CADENCE_PRESETS[defaultPreset(hasMarks)] };
  if (mode !== 'custom') return out;
  const custom = settings?.custom ?? {};
  for (const key of Object.keys(CADENCE_OPTIONS) as (keyof SyncCadence)[]) {
    const value = custom[key];
    if (value !== undefined && (CADENCE_OPTIONS[key] as readonly string[]).includes(value))
      (out as unknown as Record<string, string>)[key] = value;
  }
  return out;
}

/**
 * One child followed by several families is read once (design.md 7.1): with the most frequent of their settings, so
 * that no family gets its data later than it chose
 */
export function mergeCadences(list: readonly SyncCadence[]): SyncCadence | null {
  if (!list.length) return null;
  const out = { ...list[0]! };
  for (const c of list.slice(1)) {
    for (const key of Object.keys(CADENCE_OPTIONS) as (keyof SyncCadence)[]) {
      const order = CADENCE_OPTIONS[key] as readonly string[];
      if (order.indexOf(c[key]) < order.indexOf(out[key])) (out as unknown as Record<string, string>)[key] = c[key];
    }
  }
  return out;
}

/** Days after which a week of the current term is read again; null: not at all */
export const termRecheckDays = (v: TermRecheck): number | null =>
  ({ weekly: 7, biweekly: 14, monthly: 30, off: null })[v];

/** Days after which the school's reference data is read again by the clock alone; null: only on a change */
export const schoolRefreshDays = (v: SchoolRefresh): number | null => ({ weekly: 7, monthly: 30, onChange: null })[v];

/** Days after which the calendar and the class are read again by the clock alone; null: only on a change */
export const calendarRefreshDays = (v: CalendarRefresh): number | null => ({ monthly: 30, onChange: null })[v];

/** What the estimate of a child's school day needs: the server knows it, the app recomputes as the settings change */
export interface DayEstimateInput {
  /** The child's school-day window in minutes (an hour before the first lesson to two hours after the last) */
  windowMinutes: number;
  /** The diary's login interval: one run at most per interval */
  intervalMinutes: number;
  /** Requests one week costs: 1, or one per school day for a provider that answers per day */
  weekRequests: number;
  /** School days in a week */
  schoolDays: number;
  /** Weeks of the current term */
  termWeeks: number;
  /** The provider shows lessons ahead (capabilities.futureTimetable) */
  readsAhead: boolean;
  /** The provider has final marks (capabilities.finalMarks) */
  finalMarks: boolean;
}

export interface DayEstimate {
  /** Runs that read the child on a school day */
  runs: number;
  /** Requests to the diary for the child on an ordinary school day: the logins, the weeks, the finals */
  requests: number;
  /** About how long a mark given today waits before it shows; null: until the run after the lessons */
  markWithinMinutes: number | null;
}

/**
 * An ordinary school day of one child with these settings (ux-principles D63): the runs, the requests and how soon a
 * new mark shows. Reference data is left out (a few requests a month), and so is a login shared with a sibling: a
 * family's total is at most the sum of its children's.
 */
export function estimateDay(c: SyncCadence, x: DayEstimateInput): DayEstimate {
  const days = Math.max(1, x.schoolDays);
  const step = (gap: number) => Math.max(gap, x.intervalMinutes);
  const most = Math.max(1, Math.ceil(x.windowMinutes / step(60)));
  const runs = {
    hourly: most,
    every2h: Math.max(1, Math.ceil(x.windowMinutes / step(120))),
    thrice: Math.min(3, most),
    afterSchool: 1,
  }[c.day];
  const previous = { everyRun: runs, daily: 1, off: 0 }[c.previousWeek];
  // daily: the first run of the day, and every run of the last school day of the week
  const next = x.readsAhead
    ? { everyRun: runs, daily: 1 + (runs - 1) / days, lastSchoolDay: runs / days, off: 0 }[c.nextWeek]
    : 0;
  const recheck = termRecheckDays(c.termRecheck);
  const term = recheck === null ? 0 : (x.termWeeks * 7) / (recheck * days);
  // an ordinary week reads the finals once (termEnd reads them daily only near a term's end)
  const finals = x.finalMarks && c.finals !== 'off' ? 1 / days : 0;
  const weeks = runs + previous + next + term;
  return {
    runs,
    requests: Math.round(runs + weeks * Math.max(1, x.weekRequests) + finals),
    markWithinMinutes: {
      hourly: step(60),
      every2h: step(120),
      thrice: Math.round(x.windowMinutes / 3),
      afterSchool: null,
    }[c.day],
  };
}
