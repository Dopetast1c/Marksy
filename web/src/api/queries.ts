import { useQuery } from '@tanstack/react-query';
import { api, ApiFailure, data } from './client';
import type { Schemas } from './client';

// Server data through TanStack Query (docs/design.md 13): keys by student and period, so a child switch or a period
// step reads from the cache when it can. Every number on a screen comes from these answers.

export type Me = Schemas['Me'];
export type StudentSummary = Schemas['StudentSummary'];

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

/** Freshness of every account and child (the banner, D22) */
export const useSyncStatus = () =>
  useQuery({
    queryKey: ['sync-status'],
    queryFn: () => data(api.GET('/api/sync/status')),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });
