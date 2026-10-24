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

/** The cards of «С кого начнём?», one request (docs/design.md 9) */
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

/** Главная for one child and period */
export const useOverview = (id: string, q: PeriodQuery) =>
  useQuery({
    queryKey: ['overview', id, q.period, q.offset],
    queryFn: () => data(api.GET('/api/students/{id}/overview', periodParams(id, q))),
    placeholderData: sameChild(id),
  });

/** Динамика over all marks (TrendCard on Главная) */
export const useTrend = (id: string, q: PeriodQuery) =>
  useQuery({
    queryKey: ['trend', id, q.period, q.offset],
    queryFn: () => data(api.GET('/api/students/{id}/trend', periodParams(id, q))),
    placeholderData: sameChild(id),
  });

/** Every row of Внимание for one child and period */
export const useEvents = (id: string, q: PeriodQuery) =>
  useQuery({
    queryKey: ['events', id, q.period, q.offset],
    queryFn: () => data(api.GET('/api/students/{id}/events', periodParams(id, q))),
    placeholderData: sameChild(id),
  });

/** The child's school: bells, terms, holidays (Школа, the empty slots of a day) */
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

export type FeedItem = Schemas['FeedItem'];
export type FinalCell = Schemas['FinalCell'];
export type FinalsState = Schemas['FinalsState'];
export type TermRef = Schemas['TermRef'];
export type TermFinals = Schemas['TermFinals'];
export type YearFinals =
  paths['/api/students/{id}/finals/years']['get']['responses'][200]['content']['application/json'];

type FilterQuery = { comments: 'all' | 'only'; tags?: string; tagMode?: 'any' | 'all' };
const FEED_PAGE = 100;

/** Оценки: the feed of the period under the mark filter, a page at a time */
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

/** Итоги → Четверти: the current year's terms, every subject's cells, last year's finals */
export const useTermFinals = (id: string) =>
  useQuery({
    queryKey: ['finals', id, 'terms'],
    queryFn: () => data(api.GET('/api/students/{id}/finals/quarters', { params: { path: { id } } })),
    placeholderData: sameChild(id),
  });

/** Итоги → Годы */
export const useYearFinals = (id: string) =>
  useQuery({
    queryKey: ['finals', id, 'years'],
    queryFn: () => data(api.GET('/api/students/{id}/finals/years', { params: { path: { id } } })),
    placeholderData: sameChild(id),
  });

export type SubjectInfo = Schemas['SubjectInfo'];
export type Hint = Schemas['Hint'];
export type GoalRow = Schemas['GoalRow'];
/** A palette key of docs/tokens.json, or null for «Авто» */
export type SubjectColor = NonNullable<
  paths['/api/students/{id}/subjects/{subjectId}/color']['put']['requestBody']
>['content']['application/json']['color'];

export type SubjectRowData = NonNullable<ReturnType<typeof useSubjects>['data']>['subjects'][number];

/** Предметы: every subject of the child under the period, the mark filter and the order */
export const useSubjects = (id: string, q: PeriodQuery, f: FilterQuery, sort: SubjectSort) =>
  useQuery({
    queryKey: ['subjects', id, q.period, q.offset, f.comments, f.tags ?? '', f.tagMode ?? 'any', sort],
    queryFn: () =>
      data(api.GET('/api/students/{id}/subjects', { params: { path: { id }, query: { ...q, ...f, sort } } })),
    placeholderData: sameChild(id),
  });

const subjectKey = (id: string, subjectId: string, q: PeriodQuery, f: FilterQuery) =>
  ['subject', id, subjectId, q.period, q.offset, f.comments, f.tags ?? '', f.tagMode ?? 'any'] as const;

/** Предмет: everything the subject screen shows for the period and the filter */
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

/** Динамика of one subject */
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
 * «Настройки предмета» (design.md 5.4, 6.6): the colour and the goal, applied at once behind the sheet (the subject's
 * answers are patched in the cache), then everything of the child is read again: the colour is on every stripe
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
