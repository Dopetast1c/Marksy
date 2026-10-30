import { shortDate } from '@marksy/core';
import type { GradingScale, ShortDateStyle } from '@marksy/core';
import type { TFunction } from 'i18next';
import type { GoalRow, Hint } from '../api/queries';
import { roman } from './period';
import { numbers } from './numbers';

// The words of "Worth a look" (subject.attention) on the subject screen (docs/design.md 5.4, 6.2): a guidance hint is a fact and an
// optional advice as i18n keys with raw values; the goal row is numbers from the scale. Values are written here with
// the child's scale (an average with its decimals, a mark as a mark) and dates in the interface language.

const AVERAGES = /average$/i;

export function hintText(t: TFunction, text: Hint['fact'], scale: GradingScale, ds: ShortDateStyle): string {
  const p: Record<string, string> = {};
  for (const [k, v] of Object.entries(text.params)) {
    if (v == null) continue;
    if (Array.isArray(v)) p[k] = v.join(', ');
    else if (typeof v === 'number') p[k] = AVERAGES.test(k) ? numbers(scale).average(v) : numbers(scale).value(v);
    else if (k === 'date') p[k] = shortDate(v, ds, { weekday: true });
    else p[k] = v;
  }
  // a low mark's work type only when the diary set one: never "4 for , 14 Oct"
  if (text.key === 'guidance.lowMark.fact') {
    if (!text.params.workType) return t('guidance.lowMark.factNoWork', p);
    p.work = t(`workType.${text.params.workType as string}`);
  }
  return t(text.key, p);
}

export type GoalTone = 'good' | 'low' | 'critical' | 'neutral';

/** The goal row (5.4): "Goal: final 8: 2 × 9 or 1 × 10 more" (goal.short), "Goal: final 8: on track" (goal.reached),
 * "… is out of reach" (goal.outOfReach.*) */
export function goalText(t: TFunction, g: GoalRow, scale: GradingScale) {
  const v = (x: number | null) => (x == null ? '' : numbers(scale).value(x));
  const a = (x: number | null) => (x == null ? '' : numbers(scale).average(x));
  const kind = g.term.kind;
  const target = v(g.target);
  switch (g.state) {
    case 'reached':
      // the worst mark of the scale still keeps it: say so, not "no lower than 1"
      if (g.keep === (scale.higherIsBetter ? scale.min : scale.max))
        return {
          tone: 'good' as GoalTone,
          title: t('goal.reached', { target }),
          sub: t(`goal.reachedAny.${kind}`, { average: a(g.average) }),
        };
      return {
        tone: 'good' as GoalTone,
        title: t('goal.reached', { target }),
        sub: t(`goal.reachedSub.${kind}`, {
          average: a(g.average),
          // "no lower than 7" (goal.keepHigher) where higher is better, "no worse than 2" (goal.keepBetter) where 1 is
          // best
          keep: t(scale.higherIsBetter ? 'goal.keepHigher' : 'goal.keepBetter', { mark: v(g.keep) }),
        }),
      };
    case 'short':
      return {
        tone: 'low' as GoalTone,
        title: t('goal.short', {
          target,
          plan: g.plan
            .map((o) => t('guidance.marksOf', { count: o.count, value: v(o.value) }))
            .join(` ${t('common.or')} `),
        }),
        sub: t(`goal.shortSub.${kind}`, { projected: v(g.projected), average: a(g.average), need: a(g.need) }),
      };
    case 'out_of_reach':
      return {
        tone: 'critical' as GoalTone,
        title: t(`goal.outOfReach.${kind}`, { target }),
        sub: t('goal.outOfReachSub', { projected: v(g.projected) }),
      };
    default:
      return {
        tone: 'neutral' as GoalTone,
        title: t('goal.title', { target }),
        sub: t(`goal.posted.${kind}`, { roman: roman(g.term.index), final: g.final?.raw ?? '', average: a(g.average) }),
      };
  }
}
