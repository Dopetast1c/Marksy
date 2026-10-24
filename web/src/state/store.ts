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
