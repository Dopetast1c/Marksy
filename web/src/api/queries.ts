import { useQuery } from '@tanstack/react-query';
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
