import { weekdayOf } from '@marksy/core';
import type { BellSchedule, WeekTemplate } from '@marksy/core';
import { and, desc, eq, gte, isNull, lte } from 'drizzle-orm';
import type { Db } from '../db/client';
import { bellSchedules, lessons, weekTemplates } from '../db/schema';
import type { WeekTemplateEntry } from '../db/schema';
import { normName } from './upsert';
import type { StoredCalendar, StudentRow } from './store-school';
import { subjects } from '../db/schema';

// School details of one child (docs/providers.md 4, design.md 8): bells and the regular week, read once a day and
// replaced on every read, and what they add to the lessons. A provider returns lessons as the diary has them; the room,
// subgroup and teacher of a lesson come from the child's own regular week, the end time from the bells.

export async function storeBells(db: Db, student: StudentRow, yearId: string, list: BellSchedule[], now: Date) {
  await db.transaction(async (tx) => {
    await tx.delete(bellSchedules).where(eq(bellSchedules.studentId, student.id));
    if (list.length) {
      await tx.insert(bellSchedules).values(
        list.map((b) => ({
          studentId: student.id,
          schoolYearId: yearId,
          externalId: b.externalId,
          label: b.label ?? null,
          days: b.days,
          periods: b.periods,
          validFrom: b.validFrom ?? null,
          validTo: b.validTo ?? null,
          fetchedAt: now,
        })),
      );
    }
  });
}

export async function storeWeekTemplate(
  db: Db,
  student: StudentRow,
  calendar: StoredCalendar,
  subjectIds: Map<string, string>,
  template: WeekTemplate | null,
  now: Date,
) {
  await db.transaction(async (tx) => {
    await tx.delete(weekTemplates).where(eq(weekTemplates.studentId, student.id));
    if (!template) return;
    const entries: WeekTemplateEntry[] = [];
    for (const e of template.entries) {
      let subjectId = subjectIds.get(e.subjectExternalId);
      if (!subjectId) {
        // a subject the list did not have: known from now on, as lessons make them
        const [row] = await tx
          .insert(subjects)
          .values({
            studentId: student.id,
            schoolYearId: calendar.schoolYearId,
            providerId: student.providerId,
            externalId: e.subjectExternalId,
            name: e.subjectName,
            nameNorm: normName(e.subjectName),
          })
          .onConflictDoUpdate({
            target: [subjects.studentId, subjects.schoolYearId, subjects.providerId, subjects.externalId],
            set: { name: e.subjectName },
          })
          .returning({ id: subjects.id });
        subjectId = row!.id;
        subjectIds.set(e.subjectExternalId, subjectId);
      }
      entries.push({
        cycle_week: e.cycleWeek,
        weekday: e.weekday,
        slot: e.slot,
        ...(e.start && { start: e.start }),
        ...(e.end && { end: e.end }),
        subject_id: subjectId,
        ...(e.groupLabel && { group_label: e.groupLabel }),
        ...(e.room && { room: e.room }),
        ...(e.teacherExternalId && { teacher_external_id: e.teacherExternalId }),
        ...(e.teacherName && { teacher_name: e.teacherName }),
        ...(e.templateRef && { template_ref: e.templateRef }),
      });
    }
    await tx.insert(weekTemplates).values({
      studentId: student.id,
      termId: (template.termExternalId && calendar.termIds.get(template.termExternalId)) || null,
      cycleWeeks: template.cycleWeeks,
      entries,
      fetchedAt: now,
    });
  });
}

interface LessonFacts {
  date: string;
  slot: number | null;
  subjectId: string;
  templateRef: string | null;
}

/**
 * The regular week's entry for a lesson, in the order of docs/providers.md 4: weekday, slot and templateRef (room,
 * group, teacher); only templateRef, a moved lesson (group, teacher, no room); weekday, slot and subject for a system
 * without templateRef (room, group); otherwise nothing, since an empty room is better than another lesson's.
 */
export function matchEntry(
  lesson: LessonFacts,
  entries: readonly WeekTemplateEntry[],
): { room?: string; group?: string; teacherName?: string; teacherExternalId?: string } {
  const weekday = weekdayOf(lesson.date);
  const at = (e: WeekTemplateEntry) => e.weekday === weekday && e.slot === lesson.slot;
  if (lesson.templateRef) {
    const exact = entries.find((e) => at(e) && e.template_ref === lesson.templateRef);
    if (exact) {
      return {
        room: exact.room,
        group: exact.group_label,
        teacherName: exact.teacher_name,
        teacherExternalId: exact.teacher_external_id,
      };
    }
    const moved = entries.find((e) => e.template_ref === lesson.templateRef);
    if (moved)
      return {
        group: moved.group_label,
        teacherName: moved.teacher_name,
        teacherExternalId: moved.teacher_external_id,
      };
    return {};
  }
  const bySubject = entries.find((e) => at(e) && e.subject_id === lesson.subjectId);
  return bySubject ? { room: bySubject.room, group: bySubject.group_label } : {};
}

/**
 * Fills what the diary left empty on the child's lessons of the school year from the stored regular week, and sets the
 * end time from the bells. Values the diary sent are kept; returns the number of lessons changed.
 */
export async function applySchoolDetails(
  db: Db,
  studentId: string,
  year: { from: string; to: string },
): Promise<number> {
  const [template] = await db
    .select({ entries: weekTemplates.entries })
    .from(weekTemplates)
    .where(eq(weekTemplates.studentId, studentId))
    .orderBy(desc(weekTemplates.fetchedAt))
    .limit(1);
  const bells = await db
    .select({ days: bellSchedules.days, periods: bellSchedules.periods })
    .from(bellSchedules)
    .where(eq(bellSchedules.studentId, studentId));
  if (!template && bells.length === 0) return 0;
  const rows = await db
    .select()
    .from(lessons)
    .where(
      and(
        eq(lessons.studentId, studentId),
        gte(lessons.date, year.from),
        lte(lessons.date, year.to),
        isNull(lessons.removedAt),
      ),
    );
  let changed = 0;
  for (const l of rows) {
    const m = template ? matchEntry(l, template.entries) : {};
    const weekday = weekdayOf(l.date);
    const period = bells.find((b) => b.days.includes(weekday))?.periods.find((p) => p.slot === l.slot);
    const next = {
      room: l.room ?? m.room ?? null,
      groupLabel: l.groupLabel ?? m.group ?? null,
      teacherName: l.teacherName ?? m.teacherName ?? null,
      teacherExternalId: l.teacherExternalId ?? m.teacherExternalId ?? null,
      // the end of a lesson is the bell, by its number
      endTime: period?.end ?? l.endTime,
    };
    if (
      next.room !== l.room ||
      next.groupLabel !== l.groupLabel ||
      next.teacherName !== l.teacherName ||
      next.teacherExternalId !== l.teacherExternalId ||
      next.endTime !== l.endTime
    ) {
      await db.update(lessons).set(next).where(eq(lessons.id, l.id));
      changed++;
    }
  }
  return changed;
}
