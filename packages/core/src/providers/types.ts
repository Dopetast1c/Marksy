import type { HttpClient } from '../http/types';
import type {
  AccountInfo,
  Attendance,
  BehaviourEvent,
  Calendar,
  DateRange,
  FinalMark,
  HomeworkItem,
  Lesson,
  Mark,
  StudentRef,
  Subject,
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

export type DriftKind = 'unknown_field' | 'missing_field' | 'new_enum_value' | 'new_error_shape';

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

export interface ProviderContext {
  /** The only way to make requests: serial, delayed, backoff, allow-list. */
  http: HttpClient;
  /** Redacts credentials and tokens. */
  log: Logger;
  now(): Date;
  drift: DriftReporter;
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
  /** capabilities.homeworkAssignments */
  getHomework?(session: Session, student: StudentRef, range: DateRange, ctx: ProviderContext): Promise<HomeworkItem[]>;
  /** capabilities.behaviour */
  getBehaviour?(
    session: Session,
    student: StudentRef,
    range: DateRange,
    ctx: ProviderContext,
  ): Promise<BehaviourEvent[]>;
  /** Lessons ahead without marks; falls back to getLessons. */
  getTimetable?(session: Session, student: StudentRef, range: DateRange, ctx: ProviderContext): Promise<Lesson[]>;

  /** Replace names, ids and free text in a raw response before it is saved as a fixture. */
  sanitize(endpoint: string, raw: unknown): unknown;
}
