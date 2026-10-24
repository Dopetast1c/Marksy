import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { StoredPick } from '../lib/pick';

// The app's small client state (docs/design.md 13): the child picked on this device and when, the device's
// «Всегда начинать с последнего», and the period the screens show. Switching the child never changes the screen,
// the period or the filters (CLAUDE.md, ScreenHeader), so the period lives here, not per child.

export type PeriodKind = 'week' | 'month' | 'term' | 'year';

interface DeviceState {
  pick: StoredPick | null;
  alwaysLast: boolean;
  /** remembers the choice and counts it as activity */
  choose: (id: string, now?: number) => void;
  touch: (now?: number) => void;
  forget: () => void;
  setAlwaysLast: (on: boolean) => void;
}

/** Per device, not per account (docs/design.md 4): the parent's phone and the kitchen tablet differ */
export const useDevice = create<DeviceState>()(
  persist(
    (set, get) => ({
      pick: null,
      alwaysLast: false,
      choose: (id, now = Date.now()) => set({ pick: { id, lastActive: now } }),
      touch: (now = Date.now()) => {
        const p = get().pick;
        if (p) set({ pick: { ...p, lastActive: now } });
      },
      forget: () => set({ pick: null }),
      // turning it off also forgets the child (docs/design.md 4)
      setAlwaysLast: (on) => set(on ? { alwaysLast: true } : { alwaysLast: false, pick: null }),
    }),
    { name: 'marksy.device', storage: createJSONStorage(() => localStorage) },
  ),
);

interface PeriodState {
  kind: PeriodKind;
  offset: number;
  setKind: (kind: PeriodKind) => void;
  /** +1 is older, -1 newer; never past the current instance */
  step: (delta: number) => void;
  setOffset: (offset: number) => void;
}

/** Choosing a kind resets to its current instance (docs/design.md 6) */
export const usePeriod = create<PeriodState>()((set) => ({
  kind: 'week',
  offset: 0,
  setKind: (kind) => set({ kind, offset: 0 }),
  step: (delta) => set((s) => ({ offset: Math.max(0, s.offset + delta) })),
  setOffset: (offset) => set({ offset: Math.max(0, offset) }),
}));

export type TagMode = 'any' | 'all';

interface MarkFilterState {
  /** Комментарии: only the teacher's comments without a mark (D56) */
  comments: boolean;
  /** Ticked tags (M6); several combine by tagMode */
  tags: string[];
  tagMode: TagMode;
  /** Все: no filter */
  clear: () => void;
  setComments: (on: boolean) => void;
  toggleTag: (id: string) => void;
  setTagMode: (mode: TagMode) => void;
  clearTags: () => void;
}

/**
 * The mark filter (MarkFilter, docs/design.md 5.3, D27): one piece of state for Оценки, Предметы and Предмет, so moving
 * between them never changes what is being looked at; switching the child keeps it too. Комментарии and tags exclude
 * each other: the comments have no tags.
 */
export const useMarkFilter = create<MarkFilterState>()((set) => ({
  comments: false,
  tags: [],
  tagMode: 'any',
  clear: () => set({ comments: false, tags: [] }),
  setComments: (on) => set(on ? { comments: true, tags: [] } : { comments: false }),
  toggleTag: (id) =>
    set((s) => ({ comments: false, tags: s.tags.includes(id) ? s.tags.filter((t) => t !== id) : [...s.tags, id] })),
  setTagMode: (tagMode) => set({ tagMode }),
  clearTags: () => set({ tags: [] }),
}));

/** The filter as the API reads it (`/marks`, `/subjects`, `/subjects/:id`, its trend) */
export function markFilterQuery(f: Pick<MarkFilterState, 'comments' | 'tags' | 'tagMode'>) {
  return {
    comments: f.comments ? ('only' as const) : ('all' as const),
    ...(f.tags.length ? { tags: f.tags.join(','), tagMode: f.tagMode } : {}),
  };
}

export type SubjectSort = 'alpha' | 'weak' | 'strong' | 'fell' | 'rose';

/** The order of Предметы (design.md 5.3a): kept when the child or the period changes */
export const useSubjectSort = create<{ sort: SubjectSort; setSort: (s: SubjectSort) => void }>()((set) => ({
  sort: 'alpha',
  setSort: (sort) => set({ sort }),
}));

export type ScheduleKind = 'day' | 'week';

interface ScheduleViewState {
  kind: ScheduleKind;
  /** the day shown in День; null: today */
  day: string | null;
  /** the week shown in Неделя: 0 this week, 1 next, -1 last */
  week: number;
  showDay: (day: string | null) => void;
  showWeek: (week: number) => void;
}

/**
 * What Расписание shows (docs/design.md 5.5): День or Неделя and which one. Like the period of the marks screens it
 * survives a child switch and moving between tabs; «Всё расписание» and «Сейчас» set it before opening the screen.
 */
export const useScheduleView = create<ScheduleViewState>()((set) => ({
  kind: 'day',
  day: null,
  week: 0,
  showDay: (day) => set({ kind: 'day', day }),
  showWeek: (week) => set({ kind: 'week', week }),
}));
