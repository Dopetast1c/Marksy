import { clockMinutes, daysBetween, schoolClock, shortRange } from '@marksy/core';
import { useState } from 'react';
import type { CSSProperties } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { useSchool } from '../../api/queries';
import { Body, Frame } from '../../app/Frame';
import { EmptyState } from '../../components/EmptyState';
import { SunIcon } from '../../components/icons';
import { ScreenHeader } from '../../components/ScreenHeader';
import { SegmentedControl } from '../../components/SegmentedControl';
import { useClock } from '../../hooks/useClock';
import { useCapabilities, useStudent } from '../../hooks/useStudent';
import { dateStyle, useT } from '../../i18n';
import { holidayName } from '../../lib/holidays';
import { roman } from '../../lib/period';

// Школа (docs/design.md 5.9): the selected child's school, for reference, everything the child's own (D51): no other
// class's bells, no other grade's holidays. Two tabs, each only where the provider has what it needs. Звонки is drawn
// like the timetable (number on the left axis, accent bar, the time and its length, quiet break rows, «сейчас»);
// Четверти (the word from the child's term kind) has a card for now with a strip of the year, then the terms and the
// holidays in date order. Study is the accent, holidays their own sunny colour, in every palette and theme.

type School = NonNullable<ReturnType<typeof useSchool>['data']>;
type Item =
  | { type: 'term'; from: string; to: string; kind: string; index: number; note: string | null }
  | { type: 'holiday'; from: string; to: string; kind: string | null; note: string | null };

const weekday = (d: number, locale: string) =>
  new Intl.DateTimeFormat(locale, { timeZone: 'UTC', weekday: 'short' }).format(
    new Date(Date.UTC(2024, 0, 7 + d, 12)), // 7 January 2024 was a Sunday: d = 0 is Sunday, as in the manifest
  );

/** «пн–сб» for a run of days, «пн, ср, пт» otherwise */
function daysLabel(days: readonly number[], locale: string) {
  const sorted = [...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
  const run = sorted.every((d, i) => i === 0 || (d - sorted[i - 1]! + 7) % 7 === 1);
  return run && sorted.length > 2
    ? `${weekday(sorted[0]!, locale)}–${weekday(sorted.at(-1)!, locale)}`
    : sorted.map((d) => weekday(d, locale)).join(', ');
}

function Bells({ school, className }: { school: School; className: string | null }) {
  const t = useT();
  const ds = dateStyle();
  const tz = school.timezone;
  const now = schoolClock(useClock(), tz);
  const today = new Date(`${now.date}T12:00:00Z`).getUTCDay();
  return (
    <>
      {school.bells.map((b, i) => {
        const P = [...b.periods].sort((x, y) => x.slot - y.slot);
        if (!P.length) return null;
        const live = b.days.includes(today);
        const at = (from: string, to: string) =>
          live && now.minutes >= clockMinutes(from) && now.minutes < clockMinutes(to);
        return (
          <section key={i} className="flex flex-col gap-2">
            <div className="flex flex-wrap items-baseline gap-x-2 pt-1 text-[12.5px] text-ink3">
              {b.label && <b className="text-[14px] text-ink">{b.label}</b>}
              <span>
                {t('school.bells.head', {
                  days: daysLabel(b.days, ds.locale),
                  from: P[0]!.start,
                  to: P.at(-1)!.end,
                  lessons: t('lessons.count', { count: P.length }),
                })}
              </span>
            </div>
            <div className="flex flex-col rounded-lg bg-surface py-1 pr-3.5 pl-2 shadow-card">
              {P.map((p, k) => {
                const next = P[k + 1];
                const on = at(p.start, p.end);
                const breakOn = next && at(p.end, next.start);
                return (
                  <div key={p.slot}>
                    <div
                      className={`grid grid-cols-[46px_1fr] gap-2.5 border-t border-line py-2.5 ${k === 0 ? 'border-t-0' : ''} ${on ? '-mr-3.5 -ml-2 bg-accent-soft pr-3.5 pl-2' : ''}`}
                    >
                      <b className="text-right text-[17px] font-extrabold text-ink2 tabular-nums">{p.slot}</b>
                      <div className="grid grid-cols-[3px_1fr] gap-2.5">
                        <i className="self-stretch bg-accent" />
                        <span className="flex flex-col">
                          <b className="flex items-center gap-2 text-[15px] tabular-nums">
                            {p.start} – {p.end}
                            {on && (
                              <span className="rounded-pill bg-accent px-1.5 text-[11px] font-bold text-accent-ink">
                                {t('lesson.now')}
                              </span>
                            )}
                          </b>
                          <span className="text-[12.5px] text-ink3">
                            {t('school.minutes', { count: clockMinutes(p.end) - clockMinutes(p.start) })}
                          </span>
                        </span>
                      </div>
                    </div>
                    {next && (
                      <div
                        className={`grid grid-cols-[46px_1fr] gap-2.5 border-t border-line py-1.5 ${breakOn ? '-mr-3.5 -ml-2 bg-accent-soft pr-3.5 pl-2' : ''}`}
                      >
                        <span />
                        <div className="grid grid-cols-[3px_1fr] gap-2.5">
                          <i className="w-0 self-stretch border-l-2 border-dashed border-line" />
                          <span className="text-[12.5px] text-ink3 italic">
                            {t('school.break', { count: clockMinutes(next.start) - clockMinutes(p.end) })}
                            {breakOn && ` · ${t('lesson.now')}`}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
      <p className="m-0 text-small text-ink3">
        {className ? t('school.bells.note', { class: className }) : t('school.bells.noteNoClass')}
      </p>
    </>
  );
}

function Year({ school }: { school: School }) {
  const t = useT();
  const ds = dateStyle();
  const today = schoolClock(useClock(), school.timezone).date;
  const items: Item[] = [
    ...school.terms.map((x) => ({
      type: 'term' as const,
      from: x.from,
      to: x.to,
      kind: x.kind,
      index: x.index,
      note: x.note,
    })),
    ...school.holidays.map((h) => ({ type: 'holiday' as const, from: h.from, to: h.to, kind: h.kind, note: h.note })),
  ].sort((a, b) => a.from.localeCompare(b.from) || (a.type === 'term' ? -1 : 1));
  if (!items.length) return <EmptyState title={t('school.noYear')} />;
  const name = (x: Item) =>
    x.type === 'term' ? t(`period.termN.${x.kind}`, { roman: roman(x.index) }) : holidayName(t, x.kind);
  // holidays first: inside a term (the extra February week) the holidays are what is going on today
  const current =
    items.find((x) => x.type === 'holiday' && x.from <= today && today <= x.to) ??
    items.find((x) => x.from <= today && today <= x.to);
  const nextHolidays = items.find((x) => x.type === 'holiday' && x.from > today);
  const terms = items.filter((x) => x.type === 'term');
  const y0 = terms[0]?.from ?? items[0]!.from;
  const y1 = terms.at(-1)?.to ?? items.at(-1)!.to;
  const span = daysBetween(y0, y1) + 1;
  // geometry of the strip, not a number of the scale: a share of the year as a CSS percentage
  const share = (days: number) => `${Math.round(Math.min(1, Math.max(0, days / span)) * 10_000) / 100}%`;
  const pct = (d: string) => share(daysBetween(y0, d));
  const width = (a: string, b: string) => share(daysBetween(a, b < y1 ? b : y1) + 1);
  const months: string[] = [];
  for (let m = `${y0.slice(0, 7)}-01`; m <= y1;) {
    if (m >= y0) months.push(m);
    const [y, mo] = m.split('-').map(Number);
    m = mo === 12 ? `${y! + 1}-01-01` : `${y}-${String(mo! + 1).padStart(2, '0')}-01`;
  }
  // the language's own short months («сен», «ноя») where it has them, as every short date of the app
  const monthName = (m: string) =>
    ds.months?.[Number(m.slice(5, 7)) - 1] ??
    new Intl.DateTimeFormat(ds.locale, { timeZone: 'UTC', month: 'short' }).format(new Date(`${m}T12:00:00Z`));
  const termWord = t(`term.${terms[0]?.kind ?? 'other'}.plural`).toLocaleLowerCase(ds.locale);
  const left = current ? daysBetween(today, current.to) + 1 : 0;
  return (
    <>
      <section className="flex flex-col gap-2 rounded-lg bg-surface px-4 py-3.5 shadow-card">
        {current && (
          <>
            <span className="text-label text-ink3 uppercase">{t('school.now')}</span>
            <b className="text-[17px]">{name(current)}</b>
            <span className="text-small text-ink3">
              {[
                shortRange(current.from, current.to, ds),
                t('school.left', { days: t('days.count', { count: left }) }),
                current.type === 'term' && nextHolidays
                  ? t('school.untilHolidays', {
                      days: t('days.count', { count: daysBetween(today, nextHolidays.from) }),
                    })
                  : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </>
        )}
        <div className="relative mt-1 h-6 overflow-hidden rounded-[6px] bg-surface2" aria-hidden="true">
          {items
            .filter((x) => x.from <= y1)
            .map((x) => (
              <i
                key={`${x.type}-${x.from}`}
                className={`absolute inset-y-0 grid place-items-center text-[10px] font-bold not-italic ${x.type === 'holiday' ? 'z-[1] bg-holiday-fill' : 'bg-accent text-accent-ink'}`}
                style={{ left: pct(x.from), width: width(x.from, x.to) } as CSSProperties}
              >
                {x.type === 'term' ? roman(x.index) : ''}
              </i>
            ))}
          {today >= y0 && today <= y1 && (
            <span className="absolute inset-y-[-2px] z-[2] w-[2px] bg-ink" style={{ left: pct(today) }} />
          )}
        </div>
        <div className="relative h-4 text-[10px] text-ink3" aria-hidden="true">
          {months.map((m) => (
            <span key={m} className="absolute" style={{ left: pct(m) }}>
              {monthName(m)}
            </span>
          ))}
        </div>
        <div className="flex gap-4 text-[12px] text-ink3">
          <span className="flex items-center gap-1.5">
            <i className="size-2.5 rounded-[3px] bg-accent" />
            {t('school.legend.study')}
          </span>
          <span className="flex items-center gap-1.5">
            <i className="size-2.5 rounded-[3px] bg-holiday-fill" />
            {t('school.legend.holidays')}
          </span>
        </div>
      </section>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-h2">{school.year?.label ?? ''}</h2>
        <span className="text-small text-ink3">{t('school.yearSub', { terms: termWord })}</span>
      </div>
      <div className="flex flex-col gap-2">
        {items.map((x) => {
          const on = x === current;
          const past = x.to < today;
          const inner = x.type === 'holiday' && terms.some((q) => x.from > q.from && x.to < q.to && q.type === 'term');
          const n = daysBetween(x.from, x.to) + 1;
          return (
            <div
              key={`${x.type}-${x.from}`}
              className={`flex items-center gap-3 rounded-lg px-3.5 py-2.5 ${x.type === 'holiday' ? 'bg-holiday-bg text-holiday-fg' : 'bg-surface shadow-card'} ${on ? 'outline-2 outline-accent' : ''} ${past ? 'opacity-55' : ''} ${inner ? 'ml-5' : ''}`}
            >
              {x.type === 'holiday' ? <SunIcon size={18} /> : <i className="h-8 w-[3px] flex-none bg-accent" />}
              <span className="flex min-w-0 flex-1 flex-col">
                <b className="flex items-center gap-2 text-[14px]">
                  {name(x)}
                  {on && (
                    <span className="rounded-pill bg-accent px-1.5 text-[11px] font-bold text-accent-ink">
                      {t('school.running')}
                    </span>
                  )}
                </b>
                <span className="text-[12.5px] opacity-80">{shortRange(x.from, x.to, ds)}</span>
                {x.note && <span className="text-[12px] italic opacity-80">{x.note}</span>}
              </span>
              <span className="text-[12.5px] whitespace-nowrap opacity-80">
                {x.type === 'holiday' ? t('days.count', { count: n }) : t('school.weeks', { count: Math.round(n / 7) })}
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}

export function SchoolScreen() {
  const t = useT();
  const { studentId = '' } = useParams();
  // Внимание's holidays row opens Четверти (?tab=year)
  const [search] = useSearchParams();
  const caps = useCapabilities(studentId);
  const student = useStudent(studentId);
  const school = useSchool(studentId);
  const tabs = [
    ...(caps?.bellSchedule ? [{ value: 'bells', label: t('school.tab.bells') }] : []),
    ...(caps?.terms && caps.terms !== 'none'
      ? [{ value: 'year', label: t(`term.${caps.terms === 'quarter' ? 'quarter' : caps.terms}.plural`) }]
      : []),
  ];
  const [picked, setPicked] = useState<string | null>(search.get('tab'));
  const tab = tabs.find((x) => x.value === picked)?.value ?? tabs[0]?.value ?? null;
  let body: React.ReactNode;
  if (!tab) body = <EmptyState title={t('school.none')} />;
  else if (!school.data) body = <EmptyState title={school.isError ? t('app.error') : t('app.loading')} />;
  else
    body =
      tab === 'bells' ? (
        <Bells school={school.data} className={student?.classLabel ?? null} />
      ) : (
        <Year school={school.data} />
      );
  return (
    <Frame studentId={studentId}>
      <ScreenHeader title={t('more.school')} studentId={studentId} back>
        {tabs.length > 1 && (
          <SegmentedControl label={t('more.school')} value={tab ?? ''} onChange={setPicked} options={tabs} />
        )}
      </ScreenHeader>
      <Body>{body}</Body>
    </Frame>
  );
}
