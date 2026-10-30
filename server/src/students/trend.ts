import { periodStats, trendBuckets } from '@marksy/core';
import { z } from 'zod';
import type { AppDeps } from '../http/context';
import { registry } from '../openapi';
import { periodOf, periodOut } from '../routes/read-schemas';
import { resolvePeriod } from './context';
import type { ChildContext, periodQuery } from './context';
import { factOf, marksIn } from './data';

// Trend (stat.trend; docs/design.md 5.4, D26): one bucket per week, month or term back from the selected instance, each with its
// average and the stacked bar of its marks by band. Over all marks on Home (screen.home), over one subject on the subject screen.

export const trendResponse = registry.register(
  'Trend',
  z.object({
    period: periodOut,
    buckets: z.array(
      z.object({
        from: z.string(),
        to: z.string(),
        future: z.boolean(),
        selected: z.boolean(),
        average: z.number().nullable(),
        count: z.number(),
        /** The bucket's values per band role: the stacked bar (ux-principles D26) */
        bands: z.object({ critical: z.number(), low: z.number(), good: z.number(), top: z.number() }),
      }),
    ),
  }),
);

/** `marks: false` when the mark filter leaves none (a tag filter before M6, the comments only) */
export async function trendOf(
  deps: AppDeps,
  ctx: ChildContext,
  q: z.infer<typeof periodQuery>,
  opts: { subjectId?: string; marks?: boolean } = {},
) {
  const p = resolvePeriod(ctx, q);
  if (!p.instance || !ctx.scale) return { period: periodOf(p), buckets: [] };
  const scale = ctx.scale;
  const all =
    opts.marks === false
      ? []
      : (await marksIn(deps.db, ctx.student.id))
          .filter((m) => !opts.subjectId || m.subjectId === opts.subjectId)
          .map(factOf);
  return {
    period: periodOf(p),
    buckets: trendBuckets(ctx.period, p.instance).map((b) => {
      const s = periodStats(scale, all, b);
      return {
        from: b.from,
        to: b.to,
        future: b.future,
        selected: b.selected,
        average: s.average,
        count: s.count,
        bands: s.bands,
      };
    }),
  };
}
