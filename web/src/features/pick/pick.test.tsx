import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../app/App';
import { initI18n } from '../../i18n';
import { useDevice } from '../../state/store';
import { fakeApi } from '../../test/fake-api';

beforeAll(() => {
  initI18n('en');
});
beforeEach(() => {
  useDevice.setState({ pick: null, alwaysLast: false });
});

describe('"Who first?" (pick.title)', () => {
  it('a card per child: marks with "was", or tomorrow for a class without marks; the school-day line; no tag line yet', async () => {
    fakeApi({ signedIn: true });
    render(<App at="/pick" />);
    const milena = await screen.findByRole('button', { name: /Милена/ });
    expect(within(milena).getByText('New')).toBeTruthy();
    expect(within(milena).getByText('7.4')).toBeTruthy();
    expect(within(milena).getByText('was 8.2')).toBeTruthy();
    expect(within(milena).getByText('Absences')).toBeTruthy();
    expect(within(milena).getByText('lesson 3, until 10:40')).toBeTruthy();
    const mark = screen.getByRole('button', { name: /Марк/ });
    // the next school day, Monday 26 Oct: "tomorrow" on the Sunday before, its weekday on any other day
    expect(within(mark).getByText(/^Lessons( tomorrow|, Mon)$/)).toBeTruthy();
    expect(within(mark).getByText('3')).toBeTruthy();
    expect(within(mark).queryByText('New')).toBeNull();
    // until tags exist (M6) the card says nothing about them
    expect(screen.queryByText(/with tags/)).toBeNull();
  });

  it('"Always start with the last one" is kept on the device; "Settings" opens More without a child', async () => {
    fakeApi({ signedIn: true });
    const user = userEvent.setup();
    render(<App at="/pick" />);
    await user.click(await screen.findByRole('switch', { name: 'Always start with the last one' }));
    expect(useDevice.getState().alwaysLast).toBe(true);
    await user.click(screen.getByRole('button', { name: /Settings/ }));
    expect(await screen.findByRole('heading', { name: 'More' })).toBeTruthy();
    expect(screen.getByText('No student chosen')).toBeTruthy();
  });
});
