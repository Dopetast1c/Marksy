import { daysBetween, shortDate } from '@marksy/core';
import type { GradingScale, ShortDateStyle } from '@marksy/core';
import type { TFunction } from 'i18next';
import type { ChildEvent } from '../api/queries';
import type { Kind } from './period';
import { numbers } from './numbers';

// The words of a Внимание row (docs/design.md 5.2a, ux-principles D43, D56): the API sends facts only (a mark, a
// subject, a date, two averages), this turns them into the row's two lines in the interface language. No advice:
// what a row says is what the diary says.

type Mark = { raw: string };

export function eventText(
  t: TFunction,
  e: ChildEvent,
  ctx: { scale: GradingScale | null; ds: ShortDateStyle; kind: Kind; termWord: string },
): { title: string; sub: string } {
  const f = e.facts as Record<string, unknown>;
  const subject = e.subject?.name ?? '';
  const day = shortDate(e.date, ctx.ds, { weekday: true });
  const avg = (v: unknown) => (ctx.scale && typeof v === 'number' ? numbers(ctx.scale).average(v) : '—');
  const forPeriod = t(`period.for.${ctx.kind}`, { name: ctx.termWord.toLocaleLowerCase(ctx.ds.locale) });
  switch (e.kind) {
    case 'low_mark': {
      const work = typeof f.workType === 'string' ? t(`workType.${f.workType}`) : null;
      const comment = typeof f.comment === 'string' && f.comment ? f.comment : null;
      return {
        title: t('event.lowMark', { subject, mark: (f.mark as Mark).raw }),
        sub: [work ? `${work}, ${day}` : day, comment].filter(Boolean).join(' · '),
      };
    }
    case 'average_down':
    case 'average_up':
      return {
        title: t(e.kind === 'average_down' ? 'event.avgDown' : 'event.avgUp', { subject }),
        sub: [
          t('event.avgChange', { prev: avg(f.prevAverage), cur: avg(f.average), forPeriod }),
          e.kind === 'average_down' && typeof f.count === 'number' ? t('marks.count', { count: f.count }) : null,
        ]
          .filter(Boolean)
          .join(' · '),
      };
    case 'absence':
      return { title: t('event.absence', { subject }), sub: day };
    case 'mark_changed':
      return {
        title: f.before
          ? t('event.markChanged', { subject, before: f.before as string, after: (f.mark as Mark).raw })
          : t('event.markChangedTo', { subject, after: (f.mark as Mark).raw }),
        sub: t('event.changedSub', { date: shortDate(e.date, ctx.ds) }),
      };
    case 'mark_removed':
      return {
        title: t('event.markRemoved', { subject, mark: (f.mark as Mark).raw }),
        sub: t('event.changedSub', { date: shortDate(e.date, ctx.ds) }),
      };
    case 'teacher_comment':
      return {
        title: t('event.comment', {
          subject,
          day: new Intl.DateTimeFormat(ctx.ds.locale, { timeZone: 'UTC', weekday: 'short' }).format(
            new Date(`${e.date}T12:00:00Z`),
          ),
        }),
        sub: t('event.quote', { text: String(f.text ?? '') }),
      };
    case 'holidays_ahead': {
      const start = String(f.start);
      const end = String(f.end);
      const days = daysBetween(start, end) + 1;
      return {
        title: t('event.holidays', { date: shortDate(start, ctx.ds) }),
        // the provider's remark about the dates (which grades) stays a quiet note in Школа, not a fact here (D51)
        sub: [t('event.holidaysUntil', { date: shortDate(end, ctx.ds) }), t('days.count', { count: days })].join(' · '),
      };
    }
  }
}
