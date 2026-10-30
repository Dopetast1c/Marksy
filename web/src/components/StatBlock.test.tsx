import { getScale } from '@marksy/core';
import { render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';
import { initI18n } from '../i18n';
import { StatTiles } from './StatBlock';

beforeAll(() => {
  initI18n('en');
});

const scale = getScale('by-10');
const cmp = (
  current: 'marks' | 'empty',
  previous: 'marks' | 'empty' | 'none',
  average: number | null,
  prevAverage: number | null,
) => ({
  current,
  previous,
  average,
  prevAverage,
  delta: average != null && prevAverage != null ? average - prevAverage : null,
  trend: average != null && prevAverage != null ? (average < prevAverage ? ('down' as const) : ('up' as const)) : null,
});

describe('StatTiles: missing data is a state, never a zero (D23)', () => {
  it('both periods have marks: the value, an arrow and "was" (stat.was)', () => {
    render(<StatTiles scale={scale} comparison={cmp('marks', 'marks', 7.3, 8.4)} count={12} prevCount={15} />);
    expect(screen.getByText('7.3')).toBeTruthy();
    expect(screen.getByText('was 8.4')).toBeTruthy();
    expect(screen.getAllByText('↓').length).toBe(2);
  });

  it('only this period has marks: no arrow', () => {
    render(<StatTiles scale={scale} comparison={cmp('marks', 'empty', 7.3, null)} count={4} prevCount={0} />);
    expect(screen.getByText('no marks before')).toBeTruthy();
    expect(screen.queryByText('↓')).toBeNull();
    expect(screen.queryByText('↑')).toBeNull();
  });

  it('nothing before at all (the first term): no arrow, nothing to compare in the tile', () => {
    render(<StatTiles scale={scale} comparison={cmp('marks', 'none', 7.3, null)} count={4} prevCount={null} />);
    expect(screen.queryByText(/was/)).toBeNull();
  });

  it('a Monday morning: "—", "no marks yet · was" (stat.noneYet, stat.was), never a drop to 0', () => {
    render(<StatTiles scale={scale} comparison={cmp('empty', 'marks', null, 8.4)} count={0} prevCount={15} />);
    expect(screen.getByText('—')).toBeTruthy();
    expect(screen.getByText(/no marks yet/)).toBeTruthy();
    expect(screen.queryByText('↓')).toBeNull();
  });

  it('no marks in either: "—" and "no marks" (stat.none)', () => {
    render(<StatTiles scale={scale} comparison={cmp('empty', 'empty', null, null)} count={0} prevCount={0} />);
    expect(screen.getByText('—')).toBeTruthy();
    expect(screen.getByText('no marks')).toBeTruthy();
  });
});
