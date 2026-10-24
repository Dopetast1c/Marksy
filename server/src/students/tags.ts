import type { DateRange } from '@marksy/core';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { Db } from '../db/client';
import { lessons, lessonTagHits, lessonTags } from '../db/schema';
import type { ChildContext } from './context';

// The family's tags on lessons (docs/design.md 6.3): the тег note on the lesson a hit is due at, «задали» on the one it
// was set at, and «Обратить внимание» in Расписание for the selected day or week.

export interface TagRef {
  id: string;
  name: string;
  icon: string | null;
  tone: 'normal' | 'important';
  /** the preset it started as; «test» is «Контрольная», what every "is this a test" asks (CLAUDE.md) */
  presetKey: string | null;
}

export interface TagHit {
  tag: TagRef;
  dueLessonId: string;
  dueDate: string;
  sourceLessonId: string | null;
  sourceDate: string | null;
  field: 'topic' | 'homework' | 'type';
  snippet: string | null;
}

/**
 * The family's tag hits touching a range: due at a lesson of the range, or set at one (for «задали»). Materialised at
 * sync from M6 on; until then the table is empty and every tag surface stays hidden. Only the current family's tags
 * (D54: tags are a household's).
 */
export async function tagHitsIn(db: Db, ctx: ChildContext, range: DateRange, lessonIds: readonly string[]) {
  const rows = await db
    .select({ hit: lessonTagHits, tag: lessonTags })
    .from(lessonTagHits)
    .innerJoin(lessonTags, eq(lessonTags.id, lessonTagHits.tagId))
    .where(
      and(
        eq(lessonTagHits.familyId, ctx.familyId),
        eq(lessonTagHits.studentId, ctx.student.id),
        eq(lessonTags.enabled, true),
        isNull(lessonTagHits.removedAt),
      ),
    );
  const touching = rows.filter(
    (r) =>
      (r.hit.dueDate >= range.from && r.hit.dueDate <= range.to) ||
      (r.hit.sourceLessonId && lessonIds.includes(r.hit.sourceLessonId)),
  );
  const sourceIds = [...new Set(touching.map((r) => r.hit.sourceLessonId).filter((x): x is string => !!x))];
  const sources = sourceIds.length
    ? await db.select({ id: lessons.id, date: lessons.date }).from(lessons).where(inArray(lessons.id, sourceIds))
    : [];
  return touching.map(({ hit, tag }): TagHit => ({
    tag: { id: tag.id, name: tag.name, icon: tag.icon, tone: tag.tone, presetKey: tag.presetKey },
    dueLessonId: hit.dueLessonId,
    dueDate: hit.dueDate,
    sourceLessonId: hit.sourceLessonId,
    sourceDate: sources.find((s) => s.id === hit.sourceLessonId)?.date ?? null,
    field: hit.field,
    snippet: hit.snippet,
  }));
}
