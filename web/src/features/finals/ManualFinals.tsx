import { bandOf, scaleValues } from '@marksy/core';
import type { GradingScale } from '@marksy/core';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, data } from '../../api/client';
import type { useYearFinals } from '../../api/queries';
import { BottomSheet } from '../../components/BottomSheet';
import { Button } from '../../components/Field';
import { MarkChip } from '../../components/MarkChip';
import { SegmentedControl } from '../../components/SegmentedControl';
import { useT } from '../../i18n';
import { schoolYearLabel } from '../../lib/finals';
import { numbers } from '../../lib/numbers';

// "Enter last year's finals" (finals.manual.button; docs/design.md 5.3b, 6.1): the admin or a parent types a school
// year before Marksy in from the paper report card, one year final per subject on the child's scale. The years the diary sends are not
// offered; a year already typed in opens with its values. Saving writes the whole year: a subject left at "—" (finals.manual.none) goes.

type Years = NonNullable<ReturnType<typeof useYearFinals>['data']>;

/** How many years back are offered: as many as Years (finals.years) shows next to the current one (its YEARS_SHOWN less one) */
const YEARS_BACK = 2;

/** The past years that may be typed in: the ones before the current year the diary does not send */
export function manualYears(years: Years): number[] {
  const current = years.years.find((y) => y.current);
  if (!current) return [];
  const fromDiary = new Set(years.years.filter((y) => y.source === 'api').map((y) => y.startYear));
  return Array.from({ length: YEARS_BACK }, (_, i) => current.startYear - 1 - i).filter((y) => !fromDiary.has(y));
}

/** A year's name from its first calendar year, in the Years tab's own short form ("2024/25") */
const yearLabel = (y: number) => schoolYearLabel(`${y}-${y + 1}`);

export function ManualFinals({
  studentId,
  years,
  scale,
  onClose,
}: {
  studentId: string;
  years: Years;
  scale: GradingScale;
  onClose: () => void;
}) {
  const t = useT();
  const queries = useQueryClient();
  const choices = manualYears(years);
  const [startYear, setStartYear] = useState(choices[0] ?? null);
  const [extra, setExtra] = useState<string[]>([]);
  const [other, setOther] = useState('');
  const [error, setError] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const typedIn = (year: number | null) => {
    const y = years.years.find((x) => x.startYear === year && x.source === 'manual');
    const out = new Map<string, string>();
    if (y)
      for (const r of years.rows) {
        const c = r.cells.find((x) => x.yearId === y.id);
        if (c?.source === 'manual' && c.raw) out.set(r.subjectName, c.raw);
      }
    return out;
  };
  const [values, setValues] = useState(() => typedIn(startYear));
  if (startYear == null) return null;

  const n = numbers(scale);
  const marks = scaleValues(scale);
  const names = [
    ...new Set([...years.rows.filter((r) => r.subjectId).map((r) => r.subjectName), ...values.keys(), ...extra]),
  ].sort((a, b) => a.localeCompare(b));
  const label = yearLabel;
  const pickYear = (y: number) => {
    setStartYear(y);
    setValues(typedIn(y));
  };
  const save = async () => {
    setError(false);
    try {
      await data(
        api.PUT('/api/students/{id}/final-marks', {
          params: { path: { id: studentId } },
          body: { startYear, marks: [...values].map(([subjectName, raw]) => ({ subjectName, raw })) },
        }),
      );
      await queries.invalidateQueries({ queryKey: ['finals', studentId] });
      onClose();
    } catch {
      setError(true);
    }
  };

  return (
    <BottomSheet open onClose={onClose} label={t('finals.manual.title')}>
      <span className="text-label text-ink3 uppercase">{t('finals.manual.title')}</span>
      {choices.length > 1 && (
        <SegmentedControl
          label={t('finals.manual.year')}
          value={String(startYear)}
          onChange={(v) => pickYear(Number(v))}
          options={choices.map((y) => ({ value: String(y), label: label(y) }))}
        />
      )}
      {choices.length === 1 && <b className="text-[15px]">{label(startYear)}</b>}
      <span className="text-small text-ink3">{t('finals.manual.note')}</span>
      <div className="flex max-h-[45vh] flex-col overflow-y-auto">
        {names.map((name) => {
          const value = values.get(name) ?? null;
          const pick = (raw: string | null) => {
            const next = new Map(values);
            if (raw) next.set(name, raw);
            else next.delete(name);
            setValues(next);
            setEditing(null);
          };
          return (
            <div key={name} className="border-t border-line first:border-t-0">
              {/* a row opens the scale's values under it, the way the goal grid does (D32: no native select) */}
              <button
                type="button"
                aria-expanded={editing === name}
                onClick={() => setEditing(editing === name ? null : name)}
                className="flex min-h-11 w-full items-center gap-3 py-1.5 text-left"
              >
                <span className="min-w-0 flex-1 truncate text-[14px] font-bold">{name}</span>
                {value != null ? (
                  <MarkChip
                    mark={{
                      id: '',
                      values: [Number(value)],
                      raw: n.value(Number(value)),
                      kind: 'numeric',
                      band: bandOf(scale, Number(value)),
                    }}
                  />
                ) : (
                  <span className="w-[30px] text-center font-semibold text-ink3">{t('finals.manual.none')}</span>
                )}
              </button>
              {editing === name && (
                <div role="group" aria-label={name} className="grid grid-cols-6 gap-1.5 pb-2.5">
                  {marks.map((v) => (
                    <button
                      key={v}
                      type="button"
                      aria-pressed={value === String(v)}
                      onClick={() => pick(String(v))}
                      className="min-h-11 rounded-md bg-surface2 font-extrabold aria-pressed:bg-accent aria-pressed:text-accent-ink"
                    >
                      {n.value(v)}
                    </button>
                  ))}
                  <button
                    type="button"
                    aria-pressed={value == null}
                    onClick={() => pick(null)}
                    className="min-h-11 rounded-md bg-surface2 font-extrabold text-ink3 aria-pressed:bg-accent aria-pressed:text-accent-ink"
                  >
                    {t('finals.manual.none')}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const name = other.trim();
          if (name && !names.some((x) => x.toLocaleLowerCase() === name.toLocaleLowerCase()))
            setExtra([...extra, name]);
          setOther('');
        }}
      >
        <input
          value={other}
          onChange={(e) => setOther(e.target.value)}
          placeholder={t('finals.manual.other')}
          aria-label={t('finals.manual.other')}
          maxLength={80}
          className="min-h-11 min-w-0 flex-1 rounded-md border border-line bg-surface px-3"
        />
        <Button type="submit" ghost>
          {t('finals.manual.add')}
        </Button>
      </form>
      {error && (
        <p role="alert" className="m-0 text-small font-semibold text-band-critical-fg">
          {t('finals.manual.failed')}
        </p>
      )}
      <Button type="button" onClick={() => void save()}>
        {t('finals.manual.save')}
      </Button>
    </BottomSheet>
  );
}
