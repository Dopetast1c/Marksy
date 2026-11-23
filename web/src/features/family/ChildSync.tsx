import { CADENCE_OPTIONS, CADENCE_PRESETS, estimateDay } from '@marksy/core';
import type { SyncCadence, SyncPreset } from '@marksy/core';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { api, data } from '../../api/client';
import { useChildSync } from '../../api/queries';
import type { ChildSync as View } from '../../api/queries';
import { BottomSheet, SheetOption } from '../../components/BottomSheet';
import {
  AvgNoteIcon,
  BagNoteIcon,
  ClockIcon,
  MarksNoteIcon,
  SchoolIcon,
  SunIcon,
  SyncIcon,
  UndoIcon,
} from '../../components/icons';
import { MenuCard, MenuRow } from '../../components/MenuRow';
import { useT } from '../../i18n';

// "Reading the diary" (family.sync.title) in Family → the child (docs/design.md 5.6, 10.2, ux-principles D63): the
// family's sync mode for this child, a preset or its own settings, each in a sheet that explains the choices (D32).
// Only the settings the child's provider serves are shown; the estimate below follows every change at once
// (estimateDay in @marksy/core, from the inputs the server sends). The mode that fits the child's year carries
// "default" (family.sync.default); choosing it again stores nothing, so the child follows a change of year by itself.

const PRESETS: SyncPreset[] = ['marks', 'noMarks', 'light'];
const ICONS: Record<keyof SyncCadence, ReactNode> = {
  day: <ClockIcon />,
  previousWeek: <UndoIcon />,
  nextWeek: <BagNoteIcon />,
  termRecheck: <MarksNoteIcon />,
  finals: <AvgNoteIcon />,
  school: <SchoolIcon />,
  calendar: <SunIcon />,
};

type Sheet = { kind: 'mode' } | { kind: 'setting'; key: keyof SyncCadence } | null;

export function ChildSync({ studentId, name }: { studentId: string; name: string }) {
  const t = useT();
  const queries = useQueryClient();
  const query = useChildSync(studentId);
  const view = query.data;
  const [sheet, setSheet] = useState<Sheet>(null);
  const [error, setError] = useState(false);
  if (!view) return null;

  const mode = view.mode ?? view.defaultMode;
  const estimate = (c: SyncCadence) => estimateDay(c, view.estimate);
  const save = async (body: { mode: View['mode']; custom?: Partial<SyncCadence> }) => {
    setSheet(null);
    setError(false);
    try {
      const next = await data(api.PUT('/api/family/students/{id}/sync', { params: { path: { id: studentId } }, body }));
      queries.setQueryData(['child-sync', studentId], next);
    } catch {
      setError(true);
    }
  };
  const pick = (m: View['defaultMode'] | 'light' | 'custom') =>
    void save(
      m === 'custom'
        ? { mode: 'custom', custom: view.settings }
        : // the year's default stores nothing: a move into a year with marks changes it by itself
          { mode: m === view.defaultMode ? null : m },
    );
  const now = estimate(view.effective);
  const differs = view.offered.some((k) => view.effective[k] !== view.settings[k]);

  return (
    <section className="flex flex-col gap-2">
      <MenuCard>
        <MenuRow
          icon={<SyncIcon />}
          title={t('family.sync.title')}
          sub={
            view.mode === null
              ? `${t(`family.sync.mode.${mode}`)} · ${t('family.sync.default')}`
              : t(`family.sync.mode.${mode}`)
          }
          onClick={() => setSheet({ kind: 'mode' })}
        />
        {mode === 'custom' &&
          view.offered.map((key) => (
            <MenuRow
              key={key}
              icon={ICONS[key]}
              title={t(`family.sync.${key}`)}
              sub={t(`family.sync.${key}.${view.settings[key]}`)}
              onClick={() => setSheet({ kind: 'setting', key })}
            />
          ))}
      </MenuCard>
      <p className="m-0 text-small text-ink3">
        {t('family.sync.estimate', { count: now.requests })}
        {' · '}
        {now.markWithinMinutes === null
          ? t('family.sync.markAfterSchool')
          : t('family.sync.markWithin', { count: Math.max(1, Math.round(now.markWithinMinutes / 60)) })}
      </p>
      {differs && <p className="m-0 text-small text-ink3">{t('family.sync.otherFamily', { name })}</p>}
      {error && (
        <p role="alert" className="m-0 text-small font-semibold text-band-critical-fg">
          {t('family.error.failed')}
        </p>
      )}
      <BottomSheet
        open={sheet !== null}
        onClose={() => setSheet(null)}
        label={sheet?.kind === 'setting' ? t(`family.sync.${sheet.key}`) : t('family.sync.choose')}
      >
        {sheet?.kind === 'mode' && (
          <>
            <span className="text-label text-ink3 uppercase">{t('family.sync.choose')}</span>
            {PRESETS.map((p) => (
              <SheetOption
                key={p}
                title={t(`family.sync.mode.${p}`)}
                sub={
                  p === view.defaultMode
                    ? `${t('family.sync.default')} · ${t(`family.sync.mode.${p}.sub`)}`
                    : t(`family.sync.mode.${p}.sub`)
                }
                value={t('family.sync.perDay', { count: estimate(CADENCE_PRESETS[p]).requests })}
                selected={mode === p}
                onSelect={() => pick(p)}
              />
            ))}
            <SheetOption
              title={t('family.sync.mode.custom')}
              sub={t('family.sync.mode.custom.sub')}
              selected={mode === 'custom'}
              onSelect={() => pick('custom')}
            />
          </>
        )}
        {sheet?.kind === 'setting' && (
          <>
            <span className="text-label text-ink3 uppercase">{t(`family.sync.${sheet.key}`)}</span>
            {(CADENCE_OPTIONS[sheet.key] as readonly string[]).map((v) => (
              <SheetOption
                key={v}
                title={t(`family.sync.${sheet.key}.${v}`)}
                selected={view.settings[sheet.key] === v}
                onSelect={() => void save({ mode: 'custom', custom: { ...view.settings, [sheet.key]: v } })}
              />
            ))}
          </>
        )}
      </BottomSheet>
    </section>
  );
}
