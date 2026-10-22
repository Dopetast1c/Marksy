import type { AccountInfo, Calendar, DateRange, Mark, Subject } from '@marksy/core';
import type { GradeRaw, MeResponse, YearResponse } from './schemas';

// Raw demo API -> canonical types. The only place that knows the demo's field names.

export function mapAccount(me: MeResponse): AccountInfo {
  return {
    externalUserId: me.id,
    displayName: me.name,
    role: 'parent',
    students: me.children.map((c) => ({
      externalId: c.id,
      fullName: `${c.first_name} ${c.last_name}`,
      givenName: c.first_name,
      familyName: c.last_name,
      ...(c.group && { gradeLabel: c.group }),
    })),
  };
}

export function mapCalendar(y: YearResponse): Calendar {
  return {
    schoolYear: { externalId: y.id, label: y.label, start: y.start, end: y.end },
    terms: [],
    ...(y.marks === false && { gradingScaleId: null }),
  };
}

export function mapSubjects(courses: { id: string; title: string }[]): Subject[] {
  return courses.map((c) => ({ externalId: c.id, name: c.title }));
}

export function mapGrade(g: GradeRaw): Mark {
  const numeric = g.score !== null && g.status === 'graded';
  return {
    externalId: g.id,
    date: g.date,
    subjectExternalId: g.course_id,
    subjectName: g.course_title,
    raw: numeric ? String(g.score) : g.status,
    kind: numeric ? 'numeric' : g.status === 'excused' ? 'exempt' : 'other',
    values: numeric ? [g.score!] : [],
    ...(g.status === 'excused' && { status: 'excused' as const }),
  };
}

export function mapGrades(grades: GradeRaw[], range: DateRange): Mark[] {
  return grades.filter((g) => g.date >= range.from && g.date <= range.to).map(mapGrade);
}
