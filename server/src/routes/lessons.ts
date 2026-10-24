import { lessonPassed } from '@marksy/core';
import { and, eq, isNull } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { attendance, homeworkItems, lessonOverrides, lessonPrep, lessonPrepEvents, lessons, marks } from '../db/schema';
import type { AppDeps } from '../http/context';
import { HttpError } from '../http/errors';
import { route } from '../http/route';
import { loadChild } from '../students/context';
import type { ChildContext } from '../students/context';
import { actorsOf } from '../students/data';

// What the family does with a lesson (docs/design.md 5.5, 6.5, the ⋯ menu of D41): «готово», «Урока не будет» and
// homework the diary does not have. Marksy's own shared state, never written to the diary. Anyone who may see the
// child may do it (the student for themselves, parents and the admin); a lesson that has passed takes no action
// (core's lessonPassed, the same rule that hides the ⋯ menu in the app).

const id = z.string().uuid();
const lessonParams = z.object({ id, lessonId: id });
const actor = z.object({ name: z.string().nullable(), otherFamily: z.boolean() }).nullable();
const prepOut = z.object({ done: z.boolean(), doneAt: z.date().nullable(), doneBy: actor });
const cancelOut = z.object({ cancelled: z.boolean(), setAt: z.date().nullable() });
const homeworkText = z.object({ text: z.string().trim().min(1).max(1000) });
const homeworkOut = z.object({ id: z.string(), text: z.string() });

const PASSED = 'The lesson has passed: nothing to prepare or plan any more';

/** The child's lesson, or 404; with `ahead`, 409 once it has passed */
async function lessonOf(deps: AppDeps, ctx: ChildContext, lessonId: string, ahead = true) {
  const [l] = await deps.db
    .select()
    .from(lessons)
    .where(and(eq(lessons.id, lessonId), eq(lessons.studentId, ctx.student.id), isNull(lessons.removedAt)));
  if (!l) throw new HttpError(404, 'not_found', 'No such lesson');
  if (ahead && lessonPassed({ date: l.date, end: l.endTime }, ctx.now, ctx.timezone))
    throw new HttpError(409, 'lesson_passed', PASSED);
  return l;
}

export function lessonRoutes(deps: AppDeps): Router {
  const r = Router();
  const child = loadChild.bind(null, deps);

  route(
    r,
    {
      method: 'put',
      path: '/api/students/:id/lessons/:lessonId/prep',
      summary:
        '«Готово» on a lesson that has not passed (6.5): who and when are kept, the history in lesson_prep_events',
      tags: ['lessons'],
      access: 'member',
      params: lessonParams,
      response: prepOut,
      errors: { 404: 'No such child or lesson', 409: PASSED },
    },
    async (req, { params }) => {
      const ctx = await child(req, params.id);
      const l = await lessonOf(deps, ctx, params.lessonId);
      const [had] = await deps.db.select().from(lessonPrep).where(eq(lessonPrep.lessonId, l.id));
      const who = await actorsOf(deps.db, ctx);
      // ticking twice keeps the first tick
      if (had) return { done: true, doneAt: had.doneAt, doneBy: who(had.doneBy) };
      await deps.db.transaction(async (tx) => {
        await tx
          .insert(lessonPrep)
          .values({ studentId: ctx.student.id, lessonId: l.id, doneAt: ctx.now, doneBy: ctx.userId });
        await tx
          .insert(lessonPrepEvents)
          .values({ studentId: ctx.student.id, lessonId: l.id, kind: 'done', by: ctx.userId, at: ctx.now });
      });
      return { done: true, doneAt: ctx.now, doneBy: who(ctx.userId) };
    },
  );

  route(
    r,
    {
      method: 'delete',
      path: '/api/students/:id/lessons/:lessonId/prep',
      summary: 'Take «готово» off a lesson that has not passed: the lesson goes back to open (6.5)',
      tags: ['lessons'],
      access: 'member',
      params: lessonParams,
      response: prepOut,
      errors: { 404: 'No such child or lesson', 409: PASSED },
    },
    async (req, { params }) => {
      const ctx = await child(req, params.id);
      const l = await lessonOf(deps, ctx, params.lessonId);
      await deps.db.transaction(async (tx) => {
        const gone = await tx.delete(lessonPrep).where(eq(lessonPrep.lessonId, l.id)).returning();
        if (gone.length)
          await tx
            .insert(lessonPrepEvents)
            .values({ studentId: ctx.student.id, lessonId: l.id, kind: 'undone', by: ctx.userId, at: ctx.now });
      });
      return { done: false, doneAt: null, doneBy: null };
    },
  );

  route(
    r,
    {
      method: 'put',
      path: '/api/students/:id/lessons/:lessonId/cancel',
      summary: '«Урока не будет» (5.5): out of the counts and reminders; the diary wins once it records the lesson',
      tags: ['lessons'],
      access: 'member',
      params: lessonParams,
      response: cancelOut,
      errors: {
        404: 'No such child or lesson',
        409: 'The lesson has passed, or the diary already has a mark or an attendance record for it',
      },
    },
    async (req, { params }) => {
      const ctx = await child(req, params.id);
      const l = await lessonOf(deps, ctx, params.lessonId);
      const [mark] = await deps.db
        .select({ id: marks.id })
        .from(marks)
        .where(and(eq(marks.lessonId, l.id), isNull(marks.removedAt)))
        .limit(1);
      const [record] = await deps.db
        .select({ id: attendance.id })
        .from(attendance)
        .where(and(eq(attendance.lessonId, l.id), isNull(attendance.removedAt)))
        .limit(1);
      if (mark || record) throw new HttpError(409, 'diary_has_lesson', 'The diary shows that the lesson took place');
      const set = { cancelled: true, setBy: ctx.userId, setAt: ctx.now };
      await deps.db
        .insert(lessonOverrides)
        .values({ studentId: ctx.student.id, lessonId: l.id, ...set })
        .onConflictDoUpdate({ target: [lessonOverrides.studentId, lessonOverrides.lessonId], set });
      return { cancelled: true, setAt: ctx.now };
    },
  );

  route(
    r,
    {
      method: 'delete',
      path: '/api/students/:id/lessons/:lessonId/cancel',
      summary: '«Вернуть урок»: the lesson is back exactly as it was (5.5)',
      tags: ['lessons'],
      access: 'member',
      params: lessonParams,
      response: cancelOut,
      errors: { 404: 'No such child or lesson', 409: PASSED },
    },
    async (req, { params }) => {
      const ctx = await child(req, params.id);
      const l = await lessonOf(deps, ctx, params.lessonId);
      await deps.db
        .delete(lessonOverrides)
        .where(and(eq(lessonOverrides.studentId, ctx.student.id), eq(lessonOverrides.lessonId, l.id)));
      return { cancelled: false, setAt: null };
    },
  );

  route(
    r,
    {
      method: 'post',
      path: '/api/students/:id/lessons/:lessonId/homework',
      summary: '«Добавить задание»: homework the diary does not have, shown like the diary’s (6.5); one per lesson',
      tags: ['lessons'],
      access: 'member',
      params: lessonParams,
      body: homeworkText,
      response: homeworkOut,
      errors: { 404: 'No such child or lesson', 409: 'The lesson has passed, or it has the family’s homework already' },
    },
    async (req, { params, body }) => {
      const ctx = await child(req, params.id);
      const l = await lessonOf(deps, ctx, params.lessonId);
      const [had] = await deps.db
        .select({ id: homeworkItems.id })
        .from(homeworkItems)
        .where(
          and(eq(homeworkItems.lessonId, l.id), eq(homeworkItems.source, 'manual'), isNull(homeworkItems.removedAt)),
        );
      if (had) throw new HttpError(409, 'homework_exists', 'The lesson has the family’s homework already: edit it');
      const [item] = await deps.db
        .insert(homeworkItems)
        .values({
          studentId: ctx.student.id,
          subjectId: l.subjectId,
          lessonId: l.id,
          title: body.text,
          setDate: ctx.today,
          dueDate: l.date,
          source: 'manual',
          createdBy: ctx.userId,
          firstSeenAt: ctx.now,
        })
        .returning();
      return { id: item!.id, text: item!.title };
    },
  );

  /** The family's own item of this child, on a lesson that has not passed; the diary's homework is read-only */
  async function manualItem(ctx: ChildContext, itemId: string) {
    const [item] = await deps.db
      .select()
      .from(homeworkItems)
      .where(
        and(
          eq(homeworkItems.id, itemId),
          eq(homeworkItems.studentId, ctx.student.id),
          eq(homeworkItems.source, 'manual'),
          isNull(homeworkItems.removedAt),
        ),
      );
    if (!item) throw new HttpError(404, 'not_found', 'No such homework of the family');
    if (item.lessonId) await lessonOf(deps, ctx, item.lessonId);
    return item;
  }

  const itemParams = z.object({ id, itemId: id });

  route(
    r,
    {
      method: 'patch',
      path: '/api/students/:id/homework/:itemId',
      summary: '«Изменить задание»: the family’s own homework only (6.5)',
      tags: ['lessons'],
      access: 'member',
      params: itemParams,
      body: homeworkText,
      response: homeworkOut,
      errors: { 404: 'No such child or homework of the family', 409: PASSED },
    },
    async (req, { params, body }) => {
      const ctx = await child(req, params.id);
      const item = await manualItem(ctx, params.itemId);
      // the author stays the one who added it (an edit is not attributed, and nothing of it is shown)
      await deps.db.update(homeworkItems).set({ title: body.text }).where(eq(homeworkItems.id, item.id));
      return { id: item.id, text: body.text };
    },
  );

  route(
    r,
    {
      method: 'delete',
      path: '/api/students/:id/homework/:itemId',
      summary: '«Удалить задание»: the family’s own homework only (6.5)',
      tags: ['lessons'],
      access: 'member',
      params: itemParams,
      response: z.object({ removed: z.boolean() }),
      errors: { 404: 'No such child or homework of the family', 409: PASSED },
    },
    async (req, { params }) => {
      const ctx = await child(req, params.id);
      const item = await manualItem(ctx, params.itemId);
      await deps.db.update(homeworkItems).set({ removedAt: ctx.now }).where(eq(homeworkItems.id, item.id));
      return { removed: true };
    },
  );

  return r;
}
