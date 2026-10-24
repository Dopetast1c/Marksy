import { describe, expect, it } from 'vitest';
import { nowLine } from './now';

const lesson = (slot: number, start: string, end: string, subjectName = 'Алгебра') => ({
  slot,
  start,
  end,
  subjectName,
  cancelled: false,
});
const day = [lesson(1, '08:30', '09:15', 'Физика'), lesson(2, '09:25', '10:10'), lesson(3, '10:30', '11:15')];
const at = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));

describe('«Сейчас»', () => {
  it('follows the school day: before, lesson, break, done', () => {
    expect(nowLine(day, at('08:00'))).toEqual({ state: 'before', slot: 1, at: '08:30' });
    expect(nowLine(day, at('09:00'))).toEqual({ state: 'lesson', slot: 1, subjectName: 'Физика', until: '09:15' });
    expect(nowLine(day, at('10:20'))).toEqual({ state: 'break', slot: 3, subjectName: 'Алгебра', at: '10:30' });
    expect(nowLine(day, at('12:00'))).toEqual({ state: 'done', at: '11:15' });
  });

  it('only from an hour before the first lesson to two hours after the last (D52)', () => {
    expect(nowLine(day, at('07:29'))).toBeNull();
    expect(nowLine(day, at('07:30'))).toMatchObject({ state: 'before' });
    expect(nowLine(day, at('13:14'))).toMatchObject({ state: 'done' });
    expect(nowLine(day, at('13:15'))).toBeNull();
    expect(nowLine(day, at('20:13'))).toBeNull();
  });

  it('nothing on a day without timed lessons, or when every lesson is cancelled', () => {
    expect(nowLine([], at('09:00'))).toBeNull();
    expect(nowLine([{ ...lesson(1, '08:30', '09:15'), cancelled: true }], at('09:00'))).toBeNull();
  });
});
