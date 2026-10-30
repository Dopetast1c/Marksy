import { defaultGoal, marksNeeded, periodStats } from '@marksy/core';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { subjectGoals } from '../db/schema';
import type { AppDeps } from '../http/context';
import { subjectRef } from '../routes/read-schemas';
import type { ChildContext } from './context';
import { factOf, marksIn, refOf, subjectsOf } from './data';
import { finalsOf } from './finals';

// A subject's goal (docs/design.md 5.4, 6.2): the family's choice per subject, null for "No goal" (subject.goal.none),
// the scale's default until one is chosen. The subject screen shows it as the goal row; a student's Home (screen.home)
// pins the subjects that are close to theirs (5.7, "Close to the goal", home.nearGoal.mixed).

/** The goal needs terms, finals and a scale whose final rule can be inverted (6.2) */
export const goalsApply = (ctx: ChildContext) =>
  !!ctx.scale && ctx.caps.terms !== 'none' && ctx.caps.finalMarks && defaultGoal(ctx.scale) != null;

export const runningTerm = (ctx: ChildContext) =>
  ctx.termRows.find((t) => t.startDate <= ctx.today && ctx.today <= t.endDate) ?? null;

/** The goal of a subject: the family's choice, null for "No goal" (subject.goal.none), the scale's default until one is chosen */
export async function goalOf(deps: AppDeps, ctx: ChildContext, subjectId: string): Promise<number | null> {
  if (!ctx.scale) return null;
  const [row] = await deps.db
    .select({ termGoal: subjectGoals.termGoal })
    .from(subjectGoals)
    .where(and(eq(subjectGoals.studentId, ctx.student.id), eq(subjectGoals.subjectId, subjectId)));
  if (!row) return defaultGoal(ctx.scale);
  return row.termGoal == null ? null : Number(row.termGoal);
}

export const nearGoalOut = z.object({
  subject: subjectRef,
  target: z.number(),
  average: z.number(),
  need: z.number(),
  /** The quickest way there: the best value and how many marks of it */
  plan: z.object({ value: z.number(), count: z.number() }),
});

/** How many subjects "Close to the goal" (home.nearGoal.mixed) names at most */
const NEAR_MAX = 2;
/** A term average needs this many marks before it says anything about a goal */
const NEAR_MIN_MARKS = 3;

/**
 * "Close to the goal" (home.nearGoal.mixed) on a student's Home (5.7): the running term's subjects whose goal is not
 * reached yet and is at most one step of the scale away, with at least three marks and no final posted, nearest first. Advice: null with
 * guidance off or where goals do not apply.
 */
export async function nearGoals(deps: AppDeps, ctx: ChildContext): Promise<z.infer<typeof nearGoalOut>[] | null> {
  const scale = ctx.scale;
  const term = runningTerm(ctx);
  if (!ctx.guidance || !scale || !goalsApply(ctx) || !term) return null;
  const marks = (await marksIn(deps.db, ctx.student.id)).filter(
    (m) => m.date >= term.startDate && m.date <= term.endDate,
  );
  const posted = new Set((await finalsOf(deps.db, ctx)).filter((f) => f.periodId === term.id).map((f) => f.subjectId));
  const chosen = new Map(
    (
      await deps.db
        .select({ subjectId: subjectGoals.subjectId, termGoal: subjectGoals.termGoal })
        .from(subjectGoals)
        .where(eq(subjectGoals.studentId, ctx.student.id))
    ).map((g) => [g.subjectId, g.termGoal == null ? null : Number(g.termGoal)]),
  );
  const out: (z.infer<typeof nearGoalOut> & { gap: number })[] = [];
  for (const s of await subjectsOf(deps.db, ctx)) {
    if (posted.has(s.id)) continue;
    const goal = chosen.has(s.id) ? chosen.get(s.id)! : defaultGoal(scale);
    if (goal == null) continue;
    const own = marks.filter((m) => m.subjectId === s.id).map(factOf);
    const st = periodStats(scale, own, { from: term.startDate, to: term.endDate });
    if (st.count < NEAR_MIN_MARKS || st.average == null) continue;
    const n = marksNeeded(scale, st.sum, st.count, goal);
    if (!n || n.reached || !n.plan.length) continue;
    const gap = Math.abs(n.need - st.average);
    if (gap > scale.step) continue;
    out.push({
      subject: refOf(ctx, s.id, s.name),
      target: goal,
      average: st.average,
      need: n.need,
      plan: n.plan[0]!,
      gap,
    });
  }
  return out
    .sort((a, b) => a.gap - b.gap)
    .slice(0, NEAR_MAX)
    .map(({ gap: _gap, ...row }) => row);
}
