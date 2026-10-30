import { addDays, daysBetween, weekdayOf } from '@marksy/core';
import type { DateRange, HolidayKind, ISODate, LessonType, MarkKind, WorkType } from '@marksy/core';

// The fictional school of the demo family (`pnpm db:seed`) and of the demo providers' fixtures, ported from the
// prototype's buildGrade7, buildGrade1 and SCHOOL (docs/mockups.html). Deterministic: the same `today` always gives
// the same family. Dates are relative to today, so the demo always has a current week, marks from this morning and
// tests coming up. School details are per child (ux-principles D51): the grade 7 girl (Milena) has the first shift's
// bells and her own subgroups, the grade 1 boy (Mark) the grade 1 bells. Every name, room and time here is invented.

export interface SeedLesson {
  key: string;
  date: ISODate;
  slot: number;
  startTime: string;
  endTime: string;
  subject: string;
  topic: string | null;
  homework: string | null;
  lessonType: LessonType | null;
  room: string | null;
  /** The child's subgroup on a split subject */
  groupLabel: string | null;
  /** The timetable entry it comes from, the same in the week template */
  templateRef: string;
}

export interface SeedBells {
  label: string;
  /** 0 = Sunday, as manifest.calendar */
  days: number[];
  periods: { slot: number; start: string; end: string }[];
}

/** What the child's own subject looks like: their teacher, subgroup and level */
export interface SeedSubject {
  name: string;
  teacher: string | null;
  group: string | null;
  /** The diary's wording; null = the regular level */
  level: string | null;
  room: string | null;
  /** [weekday (1 = Monday), lesson number] of the regular week */
  slots: [number, number][];
}

export interface SeedMark {
  key: string;
  lessonKey: string;
  date: ISODate;
  subject: string;
  raw: string;
  kind: MarkKind;
  values: number[];
  workType: WorkType | null;
  comment: string | null;
}

export interface SeedStudent {
  key: 'k' | 'm';
  givenName: string;
  familyName: string;
  classLabel: string;
  grade: number;
  /** null: a class without marks (ux-principles D49) */
  scale: string | null;
  avatar: Record<string, unknown>;
  subjects: SeedSubject[];
  bells: SeedBells;
  lessons: SeedLesson[];
  marks: SeedMark[];
  /** Lesson keys with an absence */
  absences: string[];
  finals: { subject: string; term: number; value: number }[];
}

export interface SeedCalendar {
  /** The demo provider's school weekdays (manifest.calendar.schoolDays) */
  schoolDays: readonly number[];
  year: { label: string; start: ISODate; end: ISODate };
  terms: { index: number; start: ISODate; end: ISODate; note?: string }[];
  /** the kind names them in the app ("Autumn holidays", holiday.name.autumn), as a real diary's type would */
  holidays: (DateRange & { kind: HolidayKind; note?: string })[];
}

/** Grades with the extra February week (as the Belarusian calendar has it, api-spec 6.4) */
const LAST_GRADE_WITH_EXTRA_HOLIDAYS = 2;

/**
 * The child's school year containing today (in summer: the one that just ended): quarters and breaks as in the
 * prototype's CALENDAR. The February week is a holiday only for grades 1 and 2; remarks the diary cannot apply to the
 * dates travel as notes.
 */
export function seedCalendar(today: ISODate, schoolDays: readonly number[], grade: number): SeedCalendar {
  const y = Number(today.slice(0, 4)) - (Number(today.slice(5, 7)) < 8 ? 1 : 0);
  const n = y + 1;
  const holidays: SeedCalendar['holidays'] = [
    { kind: 'autumn', from: `${y}-11-01`, to: `${y}-11-08` },
    { kind: 'winter', from: `${y}-12-25`, to: `${n}-01-10` },
    { kind: 'spring', from: `${n}-03-21`, to: `${n}-03-28` },
    { kind: 'summer', from: `${n}-06-01`, to: `${n}-08-31`, note: `Для окончивших 9 класс: с 11.06.${n}.` },
  ];
  if (grade <= LAST_GRADE_WITH_EXTRA_HOLIDAYS) {
    holidays.push({ kind: 'additional', from: `${n}-02-15`, to: `${n}-02-21` });
  }
  return {
    schoolDays,
    year: { label: `${y}-${n}`, start: `${y}-09-01`, end: `${n}-05-31` },
    terms: [
      { index: 1, start: `${y}-09-01`, end: `${y}-10-31` },
      { index: 2, start: `${y}-11-09`, end: `${y}-12-24` },
      { index: 3, start: `${n}-01-11`, end: `${n}-03-20` },
      { index: 4, start: `${n}-03-29`, end: `${n}-05-31`, note: `Для 9 и 11 классов: с 30.03.${n} по 25.05.${n}.` },
    ],
    holidays: holidays.sort((a, b) => a.from.localeCompare(b.from)),
  };
}

// grade 7: name, target mean, [weekday (1 = Monday), lesson number], topics
const SUBJ7: [string, number, [number, number][], string[]][] = [
  [
    'Алгебра',
    8.4,
    [
      [1, 2],
      [3, 1],
      [5, 2],
    ],
    ['Линейные уравнения', 'Системы уравнений', 'Степень с натуральным показателем', 'Одночлены', 'Многочлены'],
  ],
  [
    'Геометрия',
    7.6,
    [
      [2, 3],
      [4, 2],
    ],
    ['Смежные углы', 'Признаки равенства треугольников', 'Равнобедренный треугольник', 'Медианы и биссектрисы'],
  ],
  [
    'Физика',
    5.8,
    [
      [2, 1],
      [4, 4],
    ],
    ['Измерение физических величин', 'Механическое движение', 'Скорость', 'Плотность вещества', 'Сила тяжести'],
  ],
  [
    'Русский язык',
    7.9,
    [
      [1, 1],
      [3, 3],
    ],
    [
      'Причастие как часть речи',
      'Причастный оборот',
      'Действительные причастия',
      'Страдательные причастия',
      'Н и НН в причастиях',
    ],
  ],
  [
    'Русская литература',
    8.8,
    [
      [2, 4],
      [4, 1],
    ],
    ['«Тарас Бульба»', 'Лирика Лермонтова', 'Некрасов. «Русские женщины»', 'Тургенев. «Бирюк»'],
  ],
  [
    'Белорусский язык',
    6.9,
    [
      [1, 3],
      [4, 3],
    ],
    ['Дзеепрыметнік', 'Дзеепрыслоўе', 'Правапіс не з дзеясловамі', 'Складаны сказ'],
  ],
  ['Белорусская литература', 8.1, [[3, 4]], ['Якуб Колас. «Новая зямля»', 'Янка Купала. Лірыка', 'Максім Багдановіч']],
  [
    'Английский язык',
    8.9,
    [
      [1, 4],
      [3, 2],
      [5, 3],
    ],
    ['Present Perfect vs Past Simple', 'Travelling', 'Reported speech', 'Food and health', 'Reading: London'],
  ],
  [
    'История Беларуси',
    7.2,
    [[2, 2]],
    ['ВКЛ в XIV веке', 'Грюнвальдская битва', 'Городское самоуправление', 'Культура XV века'],
  ],
  ['Всемирная история', 7.8, [[5, 4]], ['Великие географические открытия', 'Реформация', 'Нидерландская революция']],
  ['География', 8.3, [[4, 5]], ['Литосфера', 'Рельеф Земли', 'Атмосфера', 'Климатические пояса']],
  [
    'Биология',
    8.0,
    [
      [1, 5],
      [6, 1],
    ],
    ['Бактерии', 'Грибы', 'Лишайники', 'Водоросли', 'Мхи'],
  ],
  ['Информатика', 9.1, [[6, 2]], ['Алгоритмы', 'Циклы в Pascal', 'Ветвление', 'Массивы']],
  [
    'Физическая культура',
    9.4,
    [
      [2, 5],
      [4, 6],
      [5, 6],
    ],
    ['Бег 60 м', 'Прыжки в длину', 'Волейбол', 'Подтягивание'],
  ],
  [
    'Трудовое обучение',
    9.0,
    [
      [3, 5],
      [3, 6],
    ],
    ['Ручные швы', 'Технология обработки ткани', 'Кулинария: блюда из круп'],
  ],
];

/** The child's own school: bells, and per subject the child's teacher, subgroup, level and room (prototype SCHOOL) */
const SCHOOL7 = {
  bells: {
    label: '1 смена',
    days: [1, 2, 3, 4, 5, 6],
    periods: [
      [1, '08:00', '08:45'],
      [2, '08:55', '09:40'],
      [3, '09:55', '10:40'],
      [4, '10:55', '11:40'],
      [5, '11:55', '12:40'],
      [6, '12:50', '13:35'],
      [7, '13:45', '14:30'],
    ],
  },
  subjects: {
    ['Алгебра']: { teacher: 'Ковалёва Ирина Петровна', room: '305' },
    ['Геометрия']: { teacher: 'Ковалёва Ирина Петровна', room: '305' },
    ['Физика']: { teacher: 'Лосев Андрей Викторович', room: '301' },
    'Русский язык': { teacher: 'Савченко Ольга Николаевна', room: '204' },
    'Русская литература': { teacher: 'Савченко Ольга Николаевна', room: '204' },
    'Белорусский язык': { teacher: 'Жук Тамара Васильевна', room: '206' },
    'Белорусская литература': { teacher: 'Жук Тамара Васильевна', room: '206' },
    'Английский язык': {
      teacher: 'Климович Елена Сергеевна',
      group: '2-я подгруппа',
      level: 'Углублённый',
      room: '412',
    },
    'История Беларуси': { teacher: 'Сидоренко Павел Олегович', room: '210' },
    'Всемирная история': { teacher: 'Сидоренко Павел Олегович', room: '210' },
    ['География']: { teacher: 'Бондарь Наталья Владимировна', room: '214' },
    ['Биология']: { teacher: 'Гринько Светлана Аркадьевна', room: '218' },
    ['Информатика']: { teacher: 'Новиков Денис Александрович', group: '1-я подгруппа', room: '401' },
    'Физическая культура': { teacher: 'Ермаков Виталий Иванович', room: 'спортзал' },
    'Трудовое обучение': { teacher: 'Мельник Галина Ивановна', group: '1-я подгруппа (девочки)', room: '108' },
  } as Record<string, SubjectInfo>,
  classTeacher: null as SubjectInfo | null,
};

const SUBJ1: [string, [number, number][], string[], string | null][] = [
  [
    'Обучение грамоте',
    [
      [1, 1],
      [2, 1],
      [3, 1],
      [4, 1],
      [5, 1],
    ],
    ['Буква М', 'Буква Н', 'Слоги', 'Чтение слов', 'Предложение'],
    'Прописи с. 12, строки 1–3',
  ],
  [
    'Математика',
    [
      [1, 2],
      [2, 2],
      [3, 2],
      [4, 2],
    ],
    ['Число 5', 'Число 6', 'Сравнение чисел', 'Сложение'],
    'Тетрадь с. 9, № 2',
  ],
  ['Чалавек і свет', [[2, 3]], ['Восень', 'Дрэвы і кусты'], null],
  ['Белорусский язык', [[4, 3]], ['Гукі і літары'], 'Паўтарыць літары'],
  ['Изобразительное искусство', [[1, 3]], ['Осенний лист'], null],
  ['Музыка', [[3, 3]], ['Песня «Осень»'], null],
  [
    'Физическая культура',
    [
      [2, 4],
      [5, 2],
    ],
    ['Игры на свежем воздухе'],
    null,
  ],
  ['Трудовое обучение', [[5, 3]], ['Аппликация из листьев'], 'Принести цветную бумагу и клей'],
];
const SCHOOL1 = {
  bells: {
    label: '1-е классы',
    days: [1, 2, 3, 4, 5],
    periods: [
      [1, '08:30', '09:05'],
      [2, '09:20', '09:55'],
      [3, '10:15', '10:50'],
      [4, '11:10', '11:45'],
    ],
  },
  subjects: {
    'Физическая культура': { teacher: 'Ермаков Виталий Иванович', room: 'спортзал' },
    ['Музыка']: { teacher: 'Кравец Лилия Викторовна', room: '112' },
  } as Record<string, SubjectInfo>,
  /** In grade 1 one teacher takes every other subject in the class's own room */
  classTeacher: { teacher: 'Миронова Анна Сергеевна', room: '105' } as SubjectInfo | null,
};

/** The school's name in the demo-lite fixtures: the demo family's second school (the prototype's CAPS_OTHER) */
export const DEMO_LITE_SCHOOL_TITLE = 'Гимназия № 2';

interface SubjectInfo {
  teacher: string;
  group?: string;
  level?: string;
  room?: string;
}
type School = typeof SCHOOL7;

const bellsOf = (school: School): SeedBells => ({
  label: school.bells.label,
  days: school.bells.days.map((d) => d % 7),
  periods: (school.bells.periods as [number, string, string][]).map(([slot, start, end]) => ({ slot, start, end })),
});
const infoOf = (school: School, subject: string): SubjectInfo | null => school.subjects[subject] ?? school.classTeacher;

function subjectsOf(school: School, list: { name: string; slots: [number, number][] }[]): SeedSubject[] {
  return list.map(({ name, slots }) => {
    const info = infoOf(school, name);
    return {
      name,
      teacher: info?.teacher ?? null,
      group: info?.group ?? null,
      level: info?.level ?? null,
      room: info?.room ?? null,
      slots,
    };
  });
}

function hwFor(subject: string, topic: string): string | null {
  const map: Record<string, string | null> = {
    ['Алгебра']: `№ ${120 + topic.length * 3}, ${160 + topic.length * 2}`,
    ['Геометрия']: `§ 9, № ${90 + topic.length}`,
    ['Физика']: '§ 12, упр. 7 (1–3)',
    'Русский язык': `упр. ${140 + topic.length * 2}, правило с. 68`,
    'Белорусский язык': `пр. ${80 + topic.length}, вывучыць правіла`,
    'Русская литература': 'прочитать главу 5, ответить на вопросы',
    'Белорусская литература': 'вывучыць верш на памяць',
    'Английский язык': 'WB p. 24 ex. 3–4; learn words',
    'История Беларуси': '§ 7, пересказ, даты',
    'Всемирная история': '§ 10, таблица',
    ['География']: '§ 14, вопросы 1–5',
    ['Биология']: '§ 11, рисунок в тетради',
    ['Информатика']: 'написать программу из задания 3',
    'Физическая культура': null,
    'Трудовое обучение': null,
  };
  return map[subject] ?? null;
}

/** The prototype's generator: a linear congruential sequence, so the demo is the same every time */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function isSchoolDay(d: ISODate, cal: SeedCalendar): boolean {
  if (d < cal.year.start || d > cal.year.end) return false;
  if (!cal.schoolDays.includes(weekdayOf(d))) return false;
  return !cal.holidays.some((h) => d >= h.from && d <= h.to);
}

/** The child's regular week, one entry per lesson slot (WeekTemplate) */
export function weekTemplateOf(student: SeedStudent) {
  return student.subjects.flatMap((s, si) =>
    s.slots.map(([day, slot]) => ({
      weekday: day % 7,
      slot,
      subject: s.name,
      group: s.group,
      room: s.room,
      teacher: s.teacher,
      templateRef: `${student.key}t${si}`,
    })),
  );
}

/** The end of next week: the timetable shows a week ahead */
const lastLessonDay = (today: ISODate) => addDays(today, 13 - weekdayOf(today));

function lessonsFor(
  subjects: {
    name: string;
    slots: [number, number][];
    topics: string[];
    homework: (topic: string, r: () => number) => string | null;
  }[],
  school: School,
  cal: SeedCalendar,
  today: ISODate,
  prefix: string,
): SeedLesson[] {
  const bells = bellsOf(school);
  const out: SeedLesson[] = [];
  const end = lastLessonDay(today);
  subjects.forEach((sub, si) => {
    const r = rng(1000 + si * 97);
    for (let d = cal.year.start; d <= end && d <= cal.year.end; d = addDays(d, 1)) {
      if (!isSchoolDay(d, cal)) continue;
      // a subject may have two lessons on one day (a double lesson); the first keeps the plain key
      sub.slots
        .filter((s) => s[0] === weekdayOf(d))
        .forEach((slot, i) => {
          const topic = sub.topics[Math.floor(daysBetween(cal.year.start, d) / 7) % sub.topics.length]!;
          const period = bells.periods.find((p) => p.slot === slot[1])!;
          const info = infoOf(school, sub.name);
          out.push({
            key: i === 0 ? `${prefix}${si}-${d}` : `${prefix}${si}-${d}-${slot[1]}`,
            date: d,
            slot: slot[1],
            startTime: period.start,
            endTime: period.end,
            room: info?.room ?? null,
            groupLabel: info?.group ?? null,
            templateRef: `${prefix}t${si}`,
            subject: sub.name,
            topic,
            homework: sub.homework(topic, r),
            // the diary almost never sets a lesson type (api-spec 7.3, D50): only the physics labs carry one
            lessonType: sub.name === 'Физика' && r() < 0.12 ? 'lab' : null,
          });
        });
    }
  });
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.slot - b.slot);
}

export function generateGrade7(today: ISODate, cal: SeedCalendar): SeedStudent {
  const lessons = lessonsFor(
    SUBJ7.map(([name, , slots, topics]) => ({
      name,
      slots,
      topics,
      homework: (topic, r) => (r() < 0.7 ? hwFor(name, topic) : null),
    })),
    SCHOOL7,
    cal,
    today,
    'k',
  );
  const mean = new Map(SUBJ7.map(([name, m]) => [name, m]));
  const marks: SeedMark[] = [];
  const absences: string[] = [];
  let id = 0;
  const mark = (l: SeedLesson, raw: string, workType: WorkType | null, comment: string | null): SeedMark => {
    const values = /^\d+(\/\d+)?$/.test(raw) ? raw.split('/').map(Number) : [];
    return {
      key: `km${id++}`,
      lessonKey: l.key,
      date: l.date,
      subject: l.subject,
      raw,
      kind: 'numeric',
      values,
      workType,
      comment,
    };
  };
  const r = rng(7);
  for (const l of lessons) {
    if (l.date > today) continue;
    const isTest = r() < 0.08;
    const pMark = l.subject === 'Физическая культура' ? 0.55 : 0.62;
    if (!isTest && r() >= pMark) continue;
    if (r() < 0.05) {
      absences.push(l.key);
      continue;
    }
    let v = Math.round(mean.get(l.subject)! + (r() + r() + r() - 1.5) * 2.2);
    v = Math.max(2, Math.min(10, v));
    let raw = String(v);
    if (l.subject === 'Английский язык' && r() < 0.18)
      raw = `${v}/${Math.max(4, Math.min(10, v + (r() < 0.5 ? -1 : 1)))}`;
    const comment =
      v <= 4 && r() < 0.6 ? 'Не выполнено задание 3, повторить правило' : v >= 9 && r() < 0.2 ? 'Молодец!' : null;
    // teachers write tests into the topic, not as a type: the family's test tag finds them there (design 6.3)
    if (isTest) l.topic = `К/р «${l.topic}»`;
    marks.push(mark(l, raw, isTest ? 'test' : null, comment));
  }

  // the curated story of the prototype, around today
  const before = (subject: string, onOrBefore = today) =>
    lessons.filter((l) => l.subject === subject && l.date <= onOrBefore).at(-1);
  const after = (subject: string, from = today) => lessons.find((l) => l.subject === subject && l.date > from);
  const pin = (l: SeedLesson | undefined, raw: string, workType: WorkType | null, comment: string | null = null) => {
    if (!l) return;
    for (let i = marks.length - 1; i >= 0; i--) if (marks[i]!.lessonKey === l.key) marks.splice(i, 1);
    const a = absences.indexOf(l.key);
    if (a >= 0) absences.splice(a, 1);
    if (raw === 'н') absences.push(l.key);
    else marks.push(mark(l, raw, workType, comment));
  };
  pin(before('Геометрия'), '9', 'test', 'Аккуратная работа');
  pin(before('Физика'), '3', 'quiz', 'Не решены задачи 2 и 3. Пересдача во вторник');
  pin(before('География'), '8', 'homework');
  pin(before('Белорусский язык'), 'н', null);
  pin(before('Русская литература'), '9', null);
  pin(before('Физическая культура'), '10', null, 'Молодец!');
  pin(before('Алгебра'), '7', null);
  pin(before('Русский язык'), '6', null);
  // English has gone without a mark for two weeks: "No mark for a while, may be asked" (lesson.signal.call)
  for (let i = marks.length - 1; i >= 0; i--) {
    const m = marks[i]!;
    if (m.subject === 'Английский язык' && daysBetween(m.date, today) < 15) marks.splice(i, 1);
  }
  // tests ahead, written only in the topic
  const alg = after('Алгебра');
  if (alg) alg.topic = 'К/р №2 по теме «Системы линейных уравнений»';
  const phy = after('Физика', alg?.date ?? today);
  if (phy) phy.topic = 'Контрольная работа №1 «Механическое движение»';
  const lit = before('Русская литература');
  if (lit) lit.homework = 'М. Ю. Лермонтов «Парус» наизусть, с. 112';
  // a poem set at the last English lesson, due at the next one
  const engNext = after('Английский язык');
  const engPrev = engNext && lessons.filter((l) => l.subject === 'Английский язык' && l.date < engNext.date).at(-1);
  if (engPrev) engPrev.homework = 'SB p. 45 ex. 2, learn the poem by heart';
  const geo = before('География');
  if (geo) geo.homework = '§ 14, вопросы 1–5 письменно; контурная карта с. 6';

  // finals of the terms that have ended: the mean of the term's marks, rounded half up
  const finals: SeedStudent['finals'] = [];
  for (const t of cal.terms.filter((x) => x.end < today)) {
    for (const [name] of SUBJ7) {
      const vals = marks
        .filter((m) => m.subject === name && m.date >= t.start && m.date <= t.end)
        .flatMap((m) => m.values);
      if (vals.length)
        finals.push({
          subject: name,
          term: t.index,
          value: Math.floor(vals.reduce((a, b) => a + b, 0) / vals.length + 0.5),
        });
    }
  }

  return {
    key: 'k',
    givenName: 'Милена',
    familyName: 'Пример',
    classLabel: '7 «Г»',
    grade: 7,
    scale: 'by-10',
    avatar: { age: 'preteen', look: 'girl', skin: 'light', hair: 'dark', style: 'long', eyes: 'brown', glasses: false },
    subjects: subjectsOf(
      SCHOOL7,
      SUBJ7.map(([name, , slots]) => ({ name, slots })),
    ),
    bells: bellsOf(SCHOOL7),
    lessons,
    marks: marks.sort((a, b) => a.date.localeCompare(b.date)),
    absences,
    finals,
  };
}

export function generateGrade1(today: ISODate, cal: SeedCalendar): SeedStudent {
  return {
    key: 'm',
    givenName: 'Марк',
    familyName: 'Пример',
    classLabel: '1 «Д»',
    grade: 1,
    scale: null,
    avatar: { age: 'kid', look: 'boy', skin: 'light', hair: 'dark', style: 'short', eyes: 'brown', glasses: false },
    subjects: subjectsOf(
      SCHOOL1,
      SUBJ1.map(([name, slots]) => ({ name, slots })),
    ),
    bells: bellsOf(SCHOOL1),
    lessons: lessonsFor(
      SUBJ1.map(([name, slots, topics, hw]) => ({ name, slots, topics, homework: () => hw })),
      SCHOOL1 as School,
      cal,
      today,
      'm',
    ),
    marks: [],
    absences: [],
    finals: [],
  };
}

/** The five presets of design 6.3 for Russian; M6 moves them to packages/core/src/tags/presets */
export const SEED_TAGS = [
  {
    presetKey: 'poem',
    icon: 'book',
    name: 'Стихотворение',
    tone: 'normal',
    keywords: ['стих', 'наизусть', 'верш', 'на памяць', 'poem', 'by heart'],
    fields: ['homework', 'topic'],
    lessonTypes: null,
    prepDays: 4,
    enabled: true,
  },
  {
    presetKey: 'test',
    icon: 'test',
    name: 'Контрольная',
    tone: 'important',
    keywords: ['контрольн', 'кантрольн', 'к/р', 'тест'],
    fields: ['topic', 'homework'],
    lessonTypes: ['test'],
    prepDays: 3,
    enabled: true,
  },
  {
    presetKey: 'essay',
    icon: 'pen',
    name: 'Сочинение',
    tone: 'normal',
    keywords: ['сочинени', 'изложени', 'пераказ', 'сачыненн'],
    fields: ['homework', 'topic'],
    lessonTypes: null,
    prepDays: 3,
    enabled: true,
  },
  {
    presetKey: 'bring',
    icon: 'bag',
    name: 'Принести',
    tone: 'normal',
    keywords: ['принести', 'прынес', 'взять с собой'],
    fields: ['homework'],
    lessonTypes: null,
    prepDays: null,
    enabled: true,
  },
  {
    presetKey: 'project',
    icon: 'folder',
    name: 'Проект',
    tone: 'normal',
    keywords: ['проект', 'доклад', 'презентац', 'рэферат', 'реферат'],
    fields: ['homework', 'topic'],
    lessonTypes: null,
    prepDays: 7,
    enabled: false,
  },
] as const;

export interface SeedSession {
  studentKey: 'k' | 'm';
  date: ISODate;
  subject: string;
  lessonKey: string | null;
  kind: 'homework' | 'review';
  source: 'timer' | 'inferred';
  /** Local minutes */
  start: number;
  minutes: number;
}

/** Study sessions of the last four weeks before today, after the prototype's demoSessions */
export function generateSessions(student: SeedStudent, today: ISODate, cal: SeedCalendar): SeedSession[] {
  const bias: Record<string, number> = {
    ['Физика']: 0.55,
    'Английский язык': 1.3,
    ['Алгебра']: 1.15,
    'Физическая культура': 0,
  };
  const hash = (n: number) => ((n * 9301 + 49297) % 233280) / 233280;
  const out: SeedSession[] = [];
  let di = 0;
  for (let day = addDays(today, -28); day < today; day = addDays(day, 1)) {
    if (!isSchoolDay(day, cal)) continue;
    di++;
    const next = student.lessons.find((l) => l.date > day)?.date;
    if (!next) continue;
    let todo = student.lessons.filter((l) => l.date === next && (l.homework || l.topic) && (bias[l.subject] ?? 1) > 0);
    if (!todo.length || di % 11 === 5) continue;
    const seed = di * 7 + student.key.charCodeAt(0);
    const n = Math.min(
      todo.length,
      student.grade <= 2 ? 1 + Math.floor(hash(seed) * 2) : 2 + Math.floor(hash(seed) * 3),
    );
    todo = todo.slice(0, n);
    const source = di % 3 === 2 ? 'inferred' : 'timer';
    let t = 18 * 60 + 20 + Math.floor(hash(seed + 3) * 40);
    todo.forEach((l, i) => {
      const base = student.grade <= 2 ? 12 : 22;
      const minutes = Math.max(8, Math.round((base + hash(seed + 10 + i) * 28) * (bias[l.subject] ?? 1)));
      const review = source === 'timer' && i === n - 1 && hash(seed + 20) > 0.7;
      out.push({
        studentKey: student.key,
        date: day,
        subject: l.subject,
        lessonKey: review ? null : l.key,
        kind: review ? 'review' : 'homework',
        source,
        start: t,
        minutes,
      });
      t += minutes + 4 + Math.floor(hash(seed + 30 + i) * 12);
    });
  }
  return out;
}
