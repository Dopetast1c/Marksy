import type { GradingScale } from '@marksy/core';
import { useNavigate } from 'react-router';
import type { useOverview } from '../../api/queries';
import { useT } from '../../i18n';
import { numbers } from '../../lib/numbers';

// «Близко к цели», pinned on a student's Главная (docs/design.md 5.7): the subjects whose goal is one step away this
// term, with the quickest way there («Алгебра 7,3 → 7,5: ещё 1 × 9»). Advice: the server sends it only with guidance
// on, and the card is the student's (a parent has the goal rows on the subject screens).

type NearGoal = NonNullable<NonNullable<ReturnType<typeof useOverview>['data']>['nearGoals']>[number];

export function NearGoals({ studentId, rows, scale }: { studentId: string; rows: NearGoal[]; scale: GradingScale }) {
  const t = useT();
  const navigate = useNavigate();
  if (!rows.length) return null;
  const n = numbers(scale);
  const targets = new Set(rows.map((r) => r.target));
  return (
    <section className="flex flex-col gap-2 rounded-md bg-accent-soft px-3.5 py-3">
      <h2 className="m-0 text-[13px] font-extrabold tracking-[.04em] text-accent uppercase">
        {targets.size === 1 ? t('home.nearGoal.title', { target: n.value(rows[0]!.target) }) : t('home.nearGoal.mixed')}
      </h2>
      {rows.map((r) => (
        <button
          key={r.subject.id}
          type="button"
          onClick={() => navigate(`/s/${studentId}/subjects/${r.subject.id}`)}
          className="min-h-11 text-left text-[14px]"
        >
          <b>{r.subject.name}</b>{' '}
          <span className="text-ink2">
            {t('home.nearGoal.row', {
              average: n.average(r.average),
              need: n.average(r.need),
              plan: t('guidance.marksOf', { count: r.plan.count, value: n.value(r.plan.value) }),
            })}
            {targets.size > 1 && ` · ${t('home.nearGoal.target', { target: n.value(r.target) })}`}
          </span>
        </button>
      ))}
    </section>
  );
}
