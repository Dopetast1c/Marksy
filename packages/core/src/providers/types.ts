import type { HttpClient } from '../http/types';
import type {
  AccountInfo,
  Attendance,
  BehaviourEvent,
  BellSchedule,
  Calendar,
  DateRange,
  FinalMark,
  HomeworkItem,
  Lesson,
  Mark,
  StudentRef,
  Subject,
  Term,
  WeekTemplate,
} from '../model/schemas';
import type { ProviderManifest } from './manifest';

// The DiaryProvider contract (docs/providers.md section 4). A provider only maps; scheduling, retries across runs,
// pauses and storage belong to the core and the server.

/** Whatever the provider needs to stay logged in (a token, cookies). Opaque to the rest of the code; never logged. */
export type Session = Readonly<Record<string, unknown>>;

export interface Logger {
  debug(msg: string, data?: Record<string, unknown>): void;
  info(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown>): void;
}

/**
 * mass_removal is recorded by the collector, not a schema: one fetched week would have removed all or many stored
 * records at once, so it removed none (docs/design.md 8)
 */
export type DriftKind =
  'unknown_field' | 'missing_field' | 'type_mismatch' | 'new_enum_value' | 'new_error_shape' | 'mass_removal';

/** Something in a response that the schemas did not expect. Recorded, pushed to the admin, never fatal. */
export interface DriftEvent {
  kind: DriftKind;
  /** The provider's own name for the endpoint, e.g. 'lessons' */
  endpoint: string;
  /** JSON path of the field, e.g. 'days[].lessons[].mark.kind' */
  path: string;
  /** A sanitised sample value, short; never personal data */
  sample?: string;
}

export interface DriftReporter {
  report(event: DriftEvent): void;
}

/**
 * What reference data a memo entry is (docs/providers.md 4): `calendar` for the school year, its terms, holidays, the
 * list of weeks and the student's class; `school` for subjects and the school's details. The collector reads it again
 * by the child's settings (SyncCadence.calendar, SyncCadence.school) and when something shows it changed.
 */
export type MemoKind = 'calendar' | 'school';

export interface MemoOptions<T> {
  /** False when a kept value can no longer serve (a week list that ends before today): it is fetched again */
  valid?(value: T): boolean;
}

export interface ProviderContext {
  /** The only way to make requests: serial, delayed, backoff, allow-list. */
  http: HttpClient;
  /** Redacts credentials and tokens. */
  log: Logger;
  now(): Date;
  drift: DriftReporter;
  /**
   * Reference data the provider needs for its requests but the canonical model does not hold (a system's own ids of
   * weeks or classes), kept between runs per diary account. Returns the kept value while it is fresh for its kind and
   * `valid`, otherwise calls `fetch` and keeps what it returns. Keep only what the mapper needs, as JSON: no names, no
   * free text that may carry one. Without a store (tests, the first read) it simply calls `fetch`.
   */
  memo<T>(kind: MemoKind, key: string, fetch: () => Promise<T>, opts?: MemoOptions<T>): Promise<T>;
}

export interface DiaryProvider {
  readonly manifest: ProviderManifest;

  /** Exchange credentials for a session. Called at most once per run and per limits.minLoginIntervalMinutes. */
  login(credentials: Record<string, string>, ctx: ProviderContext): Promise<Session>;
  getAccount(session: Session, ctx: ProviderContext): Promise<AccountInfo>;
  getCalendar(session: Session, student: StudentRef, ctx: ProviderContext): Promise<Calendar>;
  getSubjects(session: Session, student: StudentRef, ctx: ProviderContext): Promise<Subject[]>;
  /** Required when capabilities.lessons is true. */
  getLessons?(session: Session, student: StudentRef, range: DateRange, ctx: ProviderContext): Promise<Lesson[]>;
  /** Required when capabilities.marksPerLesson is 'none' or unattachedMarks is true. */
  getMarks?(session: Session, student: StudentRef, range: DateRange, ctx: ProviderContext): Promise<Mark[]>;
  /** capabilities.attendance = 'separate' */
  getAttendance?(session: Session, student: StudentRef, range: DateRange, ctx: ProviderContext): Promise<Attendance[]>;
  /** capabilities.finalMarks */
  getFinalMarks?(session: Session, student: StudentRef, ctx: ProviderContext): Promise<FinalMark[]>;
  /**
   * capabilities.finalMarks, optional: the finals of a stored getFinalMarks response, without a session, so that a
   * mapping fixed later re-reads what was fetched (final_marks_raw, raw_responses). `endpoint` is the stored response's
   * endpoint; null when the body is not a final-marks response. Drift is not reported here.
   */
  mapStoredFinals?(
    stored: { endpoint: string; body: unknown },
    known: { subjects: readonly Subject[]; terms: readonly Term[] },
  ): FinalMark[] | null;
  /** capabilities.homeworkAssignments */
  getHomework?(session: Session, student: StudentRef, range: DateRange, ctx: ProviderContext): Promise<HomeworkItem[]>;
  /** capabilities.behaviour = 'separate' (with 'derived' the remarks come on Lesson.behaviour) */
  getBehaviour?(
    session: Session,
    student: StudentRef,
    range: DateRange,
    ctx: ProviderContext,
  ): Promise<BehaviourEvent[]>;
  /** The bell schedules of the student's class this school year (capabilities.bellSchedule). */
  getBellSchedule?(session: Session, student: StudentRef, ctx: ProviderContext): Promise<BellSchedule[]>;
  /**
   * The student's own regular week for the current term (capabilities.weekTemplate): only the student's lessons,
   * never another group's. Called with the school's reference data (design.md 10.2), after the run's lessons; a provider may then also return richer
   * subjects from getSubjects (teacher, group, level), which the collector reads again.
   */
  getWeekTemplate?(session: Session, student: StudentRef, ctx: ProviderContext): Promise<WeekTemplate | null>;
  /** Lessons ahead without marks; falls back to getLessons. */
  getTimetable?(session: Session, student: StudentRef, range: DateRange, ctx: ProviderContext): Promise<Lesson[]>;

  /** Replace names, ids and free text in a raw response before it is saved as a fixture. */
  sanitize(endpoint: string, raw: unknown): unknown;

  /**
   * Drop the personal fields the mapper never uses from a response before the collector stores it (raw_responses,
   * 14 days). Unlike sanitize() it keeps ids and texts, so the body can be parsed again. Optional: a provider whose
   * responses carry nothing beyond what it maps may leave it out. `endpoint` is the name the provider gave the request.
   */
  redactRaw?(endpoint: string, raw: unknown): unknown;
}
