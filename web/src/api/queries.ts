import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SubjectSort } from '../state/store';
import { api, ApiFailure, data } from './client';
import type { Schemas } from './client';
import type { paths } from './schema';

// Server data through TanStack Query (docs/design.md 13): keys by student and period, so a child switch or a period
// step reads from the cache when it can. Every number on a screen comes from these answers.

export type Me = Schemas['Me'];
export type StudentSummary = Schemas['StudentSummary'];
export type Overview = paths['/api/students/{id}/overview']['get']['responses'][200]['content']['application/json'];
export type ChildEvent = Schemas['ChildEvent'];
export type Lesson = Schemas['Lesson'];

export const meKey = ['me'] as const;

/** Who is signed in; null when nobody is (a 401) */
export function useMe() {
  return useQuery({
    queryKey: meKey,
    queryFn: async (): Promise<Me | null> => {
      try {
        return await data(api.GET('/api/auth/me'));
      } catch (e) {
        if (e instanceof ApiFailure && e.status === 401) return null;
        throw e;
      }
    },
    staleTime: 60_000,
    retry: false,
  });
}

/** The cards of "Who first?" (pick.title), one request (docs/design.md 9) */
export const useStudentCards = () =>
  useQuery({ queryKey: ['students'], queryFn: () => data(api.GET('/api/students')), staleTime: 60_000 });

/** The kinds and instances of the period navigator */
export const usePeriods = (id: string) =>
  useQuery({
    queryKey: ['periods', id],
    queryFn: () => data(api.GET('/api/students/{id}/periods', { params: { path: { id } } })),
    staleTime: 5 * 60_000,
  });

/**
 * While the next period loads, the previous one stays on screen (dimmed by the screen); never another child's numbers
 * under this child's header (D53): the placeholder is kept only when it belongs to the same child
 */
const sameChild =
  (id: string) =>
  <T>(prev: T | undefined, query?: { queryKey: readonly unknown[] }): T | undefined =>
    query?.queryKey[1] === id ? prev : undefined;

type PeriodQuery = { period: 'week' | 'month' | 'term' | 'year'; offset: number };
const periodParams = (id: string, q: PeriodQuery) => ({ params: { path: { id }, query: q } });

/** Home (tabs.home) for one child and period */
export const useOverview = (id: string, q: PeriodQuery) =>
  useQuery({
    queryKey: ['overview', id, q.period, q.offset],
    queryFn: () => data(api.GET('/api/students/{id}/overview', periodParams(id, q))),
    placeholderData: sameChild(id),
  });

/** Trend (stat.trend) over all marks (TrendCard on Home) */
export const useTrend = (id: string, q: PeriodQuery) =>
  useQuery({
    queryKey: ['trend', id, q.period, q.offset],
    queryFn: () => data(api.GET('/api/students/{id}/trend', periodParams(id, q))),
    placeholderData: sameChild(id),
  });

/** Every row of Attention (screen.events) for one child and period */
export const useEvents = (id: string, q: PeriodQuery) =>
  useQuery({
    queryKey: ['events', id, q.period, q.offset],
    queryFn: () => data(api.GET('/api/students/{id}/events', periodParams(id, q))),
    placeholderData: sameChild(id),
  });

/** The child's school: bells, terms, holidays (School more.school, the empty slots of a day) */
export const useSchool = (id: string) =>
  useQuery({
    queryKey: ['school', id],
    queryFn: () => data(api.GET('/api/students/{id}/school', { params: { path: { id } } })),
    staleTime: 60 * 60_000,
  });

/** Freshness of every account and child (the banner, D22) */
export const useSyncStatus = () =>
  useQuery({
    queryKey: ['sync-status'],
    queryFn: () => data(api.GET('/api/sync/status')),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });

/**
 * Whether the server answers, and which version it runs: the update prompt names a newer one, and a failed check shows
 * the banner «no connection» over the data already on screen instead of an error (docs/running.md, updates)
 */
export const useServerHealth = () =>
  useQuery({
    queryKey: ['health'],
    queryFn: () => data(api.GET('/api/health')),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: false,
  });

export type FeedItem = Schemas['FeedItem'];
export type FinalCell = Schemas['FinalCell'];
export type FinalsState = Schemas['FinalsState'];
export type TermRef = Schemas['TermRef'];
export type TermFinals = Schemas['TermFinals'];
export type YearFinals =
  paths['/api/students/{id}/finals/years']['get']['responses'][200]['content']['application/json'];

type FilterQuery = { comments: 'all' | 'only'; tags?: string; tagMode?: 'any' | 'all' };
const FEED_PAGE = 100;

/** Marks (screen.marks): the feed of the period under the mark filter, a page at a time */
export const useMarksFeed = (id: string, q: PeriodQuery, f: FilterQuery) =>
  useInfiniteQuery({
    queryKey: ['marks', id, q.period, q.offset, f.comments, f.tags ?? '', f.tagMode ?? 'any'],
    queryFn: ({ pageParam }) =>
      data(
        api.GET('/api/students/{id}/marks', {
          params: { path: { id }, query: { ...q, ...f, cursor: pageParam, limit: FEED_PAGE } },
        }),
      ),
    initialPageParam: 0,
    getNextPageParam: (last) => last.next ?? undefined,
    placeholderData: sameChild(id),
  });

/** Finals (finals.screen) → terms: the current year's terms, every subject's cells, last year's finals */
export const useTermFinals = (id: string) =>
  useQuery({
    queryKey: ['finals', id, 'terms'],
    queryFn: () => data(api.GET('/api/students/{id}/finals/quarters', { params: { path: { id } } })),
    placeholderData: sameChild(id),
  });

/** Finals → Years (finals.years) */
export const useYearFinals = (id: string) =>
  useQuery({
    queryKey: ['finals', id, 'years'],
    queryFn: () => data(api.GET('/api/students/{id}/finals/years', { params: { path: { id } } })),
    placeholderData: sameChild(id),
  });

export type SubjectInfo = Schemas['SubjectInfo'];
export type Hint = Schemas['Hint'];
export type GoalRow = Schemas['GoalRow'];
/** A palette key of docs/tokens.json, or null for "Auto" (color.auto.title) */
export type SubjectColor = NonNullable<
  paths['/api/students/{id}/subjects/{subjectId}/color']['put']['requestBody']
>['content']['application/json']['color'];

export type SubjectRowData = NonNullable<ReturnType<typeof useSubjects>['data']>['subjects'][number];

/** Subjects (screen.subjects): every subject of the child under the period, the mark filter and the order */
export const useSubjects = (id: string, q: PeriodQuery, f: FilterQuery, sort: SubjectSort) =>
  useQuery({
    queryKey: ['subjects', id, q.period, q.offset, f.comments, f.tags ?? '', f.tagMode ?? 'any', sort],
    queryFn: () =>
      data(api.GET('/api/students/{id}/subjects', { params: { path: { id }, query: { ...q, ...f, sort } } })),
    placeholderData: sameChild(id),
  });

const subjectKey = (id: string, subjectId: string, q: PeriodQuery, f: FilterQuery) =>
  ['subject', id, subjectId, q.period, q.offset, f.comments, f.tags ?? '', f.tagMode ?? 'any'] as const;

/** The subject screen: everything it shows for the period and the filter */
export const useSubject = (id: string, subjectId: string, q: PeriodQuery, f: FilterQuery) =>
  useQuery({
    queryKey: subjectKey(id, subjectId, q, f),
    queryFn: () =>
      data(
        api.GET('/api/students/{id}/subjects/{subjectId}', {
          params: { path: { id, subjectId }, query: { ...q, ...f } },
        }),
      ),
    placeholderData: sameChild(id),
  });

export type SubjectDetail = NonNullable<ReturnType<typeof useSubject>['data']>;

/** Trend (stat.trend) of one subject */
export const useSubjectTrend = (id: string, subjectId: string, q: PeriodQuery, f: FilterQuery) =>
  useQuery({
    queryKey: ['subject-trend', id, subjectId, q.period, q.offset, f.comments, f.tags ?? '', f.tagMode ?? 'any'],
    queryFn: () =>
      data(
        api.GET('/api/students/{id}/subjects/{subjectId}/trend', {
          params: { path: { id, subjectId }, query: { ...q, ...f } },
        }),
      ),
    placeholderData: sameChild(id),
  });

/**
 * "Subject settings" (subject.settings.title; design.md 5.4, 6.6): the colour and the goal, applied at once behind the
 * sheet (the subject's answers are patched in the cache), then everything of the child is read again: the colour is on every stripe
 */
export function useSubjectSettings(id: string, subjectId: string) {
  const client = useQueryClient();
  const patch = (fn: (d: SubjectDetail) => SubjectDetail) =>
    client.setQueriesData<SubjectDetail>({ queryKey: ['subject', id, subjectId] }, (d) => (d ? fn(d) : d));
  const refresh = () => client.invalidateQueries({ predicate: (q) => q.queryKey[1] === id });
  const color = useMutation({
    mutationFn: (value: SubjectColor) =>
      data(
        api.PUT('/api/students/{id}/subjects/{subjectId}/color', {
          params: { path: { id, subjectId } },
          body: { color: value },
        }),
      ),
    onMutate: (value) => patch((d) => ({ ...d, subject: { ...d.subject, color: value } })),
    onSettled: refresh,
  });
  const goal = useMutation({
    mutationFn: (value: number | null) =>
      data(
        api.PUT('/api/students/{id}/subjects/{subjectId}/goal', {
          params: { path: { id, subjectId } },
          body: { termGoal: value },
        }),
      ),
    onMutate: (value) => patch((d) => ({ ...d, settings: { ...d.settings, goal: value } })),
    onSettled: refresh,
  });
  return { color, goal };
}

export type Schedule = Schemas['Schedule'];
export type ScheduleLesson = Schedule['days'][number]['lessons'][number];
export type ScheduleQuery = { day: string } | { week: number };

/** Timetable (screen.schedule): one day or one week of lessons with their notes and "Worth a look"
 * (subject.attention; design.md 5.5) */
export const useSchedule = (id: string, q: ScheduleQuery) =>
  useQuery({
    queryKey: ['schedule', id, 'day' in q ? q.day : `week:${q.week}`],
    queryFn: () => data(api.GET('/api/students/{id}/schedule', { params: { path: { id }, query: q } })),
    placeholderData: sameChild(id),
  });

/** The days of the school year with lessons: where the navigator can step and what its picker counts */
export const useScheduleDays = (id: string) =>
  useQuery({
    queryKey: ['schedule-days', id],
    queryFn: () => data(api.GET('/api/students/{id}/schedule/days', { params: { path: { id } } })),
    staleTime: 5 * 60_000,
  });

/**
 * The lesson menu (design.md 5.5, 6.5, D41): ready (lessonMenu.ready), "Lesson won't take place"
 * (lessonMenu.cancel) and own homework. The tick and the
 * cancellation show at once in every cached day and week of the child (the sheet closes, nothing scrolls), then
 * everything of the child is read again: Home's next day, the subject's coming lessons, the picker card.
 */
export function useLessonActions(id: string) {
  const client = useQueryClient();
  const me = useMe();
  const patch = (lessonId: string, fn: (l: ScheduleLesson) => ScheduleLesson) =>
    client.setQueriesData<Schedule>({ queryKey: ['schedule', id] }, (d) =>
      d
        ? {
            ...d,
            days: d.days.map((day) => ({ ...day, lessons: day.lessons.map((l) => (l.id === lessonId ? fn(l) : l)) })),
          }
        : d,
    );
  // Home's next day comes with the overview: its rows change at once too
  const patchOverview = (lessonId: string, fn: (l: Lesson) => Lesson) =>
    client.setQueriesData<Overview>({ queryKey: ['overview', id] }, (d) =>
      d?.nextDay
        ? { ...d, nextDay: { ...d.nextDay, lessons: d.nextDay.lessons.map((l) => (l.id === lessonId ? fn(l) : l)) } }
        : d,
    );
  const refresh = () =>
    client.invalidateQueries({ predicate: (q) => q.queryKey[1] === id || q.queryKey[0] === 'students' });
  const path = (lessonId: string) => ({ params: { path: { id, lessonId } } });
  const prep = useMutation({
    mutationFn: ({ lessonId, done }: { lessonId: string; done: boolean }) =>
      data(
        done
          ? api.PUT('/api/students/{id}/lessons/{lessonId}/prep', path(lessonId))
          : api.DELETE('/api/students/{id}/lessons/{lessonId}/prep', path(lessonId)),
      ),
    onMutate: ({ lessonId, done }) => {
      const ready = done
        ? { at: new Date().toISOString(), by: { name: me.data?.user.displayName ?? null, otherFamily: false } }
        : null;
      patch(lessonId, (l) => ({ ...l, ready }));
      patchOverview(lessonId, (l) => ({ ...l, ready }));
    },
    onSettled: refresh,
  });
  const cancel = useMutation({
    mutationFn: ({ lessonId, cancelled }: { lessonId: string; cancelled: boolean }) =>
      data(
        cancelled
          ? api.PUT('/api/students/{id}/lessons/{lessonId}/cancel', path(lessonId))
          : api.DELETE('/api/students/{id}/lessons/{lessonId}/cancel', path(lessonId)),
      ),
    onMutate: ({ lessonId, cancelled }) => patch(lessonId, (l) => ({ ...l, cancelled })),
    onSettled: refresh,
  });
  const homework = useMutation({
    mutationFn: (
      a:
        | { op: 'add'; lessonId: string; text: string }
        | { op: 'edit'; itemId: string; text: string }
        | { op: 'remove'; itemId: string },
    ): Promise<unknown> => {
      if (a.op === 'add')
        return data(
          api.POST('/api/students/{id}/lessons/{lessonId}/homework', { ...path(a.lessonId), body: { text: a.text } }),
        );
      const item = { params: { path: { id, itemId: a.itemId } } };
      return a.op === 'edit'
        ? data(api.PATCH('/api/students/{id}/homework/{itemId}', { ...item, body: { text: a.text } }))
        : data(api.DELETE('/api/students/{id}/homework/{itemId}', item));
    },
    onSettled: refresh,
  });
  return { prep, cancel, homework };
}

export type FamilyView = Schemas['Family'];

/** Family (family.title; design.md 5.6): members, diaries, children, join requests; admin and parents */
export const useFamily = (enabled = true) =>
  useQuery({ queryKey: ['family'], queryFn: () => data(api.GET('/api/family')), staleTime: 30_000, enabled });

export type SyncStatus = Schemas['SyncStatus'];

/** The run log of Sync (sync.title; design.md 5.6, 90 days kept) */
export const useSyncRuns = () =>
  useQuery({
    queryKey: ['sync-runs'],
    queryFn: () => data(api.GET('/api/sync/runs', { params: { query: { limit: 30 } } })),
    staleTime: 30_000,
  });
