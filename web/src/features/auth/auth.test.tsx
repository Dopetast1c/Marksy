import { CATALOGS, CONSENT_VERSION } from '@marksy/i18n';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../app/App';
import { i18n, initI18n } from '../../i18n';
import { useDevice } from '../../state/store';
import { fakeApi } from '../../test/fake-api';

beforeAll(() => {
  initI18n('en');
});
beforeEach(() => {
  useDevice.setState({ pick: null, alwaysLast: false });
});
afterEach(async () => {
  await i18n.changeLanguage('en');
});

describe('the login screen', () => {
  it('connects a diary: the fields the system asks for, "diary" labels, the consent version; then the shared child', async () => {
    const api = fakeApi();
    const user = userEvent.setup();
    render(<App at="/login" />);
    await user.click(await screen.findByRole('button', { name: 'Connect a diary' }));
    // the system is named in one place; the fields say "diary"
    expect(await screen.findByText('Школьный портал (демо)')).toBeTruthy();
    expect(screen.getByText(/supported in a test version/)).toBeTruthy();
    await user.type(screen.getByLabelText('Diary login'), 'diary-user');
    await user.type(screen.getByLabelText('Diary password'), 'x');
    await user.type(screen.getByLabelText('Your Marksy login'), 'parent@example.com');
    await user.type(screen.getByLabelText('Your Marksy password'), 'correct horse battery');
    await user.type(screen.getByLabelText('Your name in the family'), 'Мама');
    await user.click(screen.getByRole('button', { name: 'Connect and create the family' }));
    expect(api.bodies['POST /api/auth/connect']).toEqual({
      providerId: 'demo-full',
      credentials: { login: 'diary-user', password: 'x' },
      role: 'parent',
      user: { login: 'parent@example.com', password: 'correct horse battery', displayName: 'Мама' },
      consentVersion: CONSENT_VERSION,
    });
    // a child another family follows: the choice, "From your own family" (match.follow) by default
    expect(await screen.findByText('Марк is already in Marksy')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() =>
      expect(api.bodies['POST /api/family/accounts/acc-1/matches/kid-shared']).toEqual({ action: 'follow' }),
    );
    expect(await screen.findByRole('heading', { name: 'Who first?' })).toBeTruthy();
  });

  it('in a machine translation: the consent opens the English text that counts, the sheet offers the translation form', async () => {
    const de = CATALOGS.de!;
    const en = CATALOGS.en!;
    await i18n.changeLanguage('de');
    fakeApi();
    const user = userEvent.setup();
    render(<App at="/login" />);
    await user.click(await screen.findByRole('button', { name: de['login.mode.connect']! }));
    expect(await screen.findByText(de['connect.consent']!)).toBeTruthy();
    expect(screen.queryByText(en['connect.consent']!)).toBeNull();
    await user.click(screen.getByRole('button', { name: de['connect.consent.english']! }));
    expect(screen.getByText(en['connect.consent']!).getAttribute('lang')).toBe('en');

    await user.click(screen.getByRole('button', { name: de['lang.choose']! }));
    const form = await screen.findByRole('link', { name: new RegExp(de['lang.help']!) });
    expect(form.getAttribute('href')).toMatch(/\/issues\/new\?template=translation\.yml&language=de$/);
  });

  // about Russian on purpose: ru is the reviewed (not machine) translation, so the screen is shown in Russian
  it('in a reviewed language: no line under the consent, no translation form', async () => {
    const ru = CATALOGS.ru!;
    await i18n.changeLanguage('ru');
    fakeApi();
    const user = userEvent.setup();
    render(<App at="/login" />);
    await user.click(await screen.findByRole('button', { name: ru['login.mode.connect']! }));
    expect(await screen.findByText(ru['connect.consent']!)).toBeTruthy();
    expect(screen.queryByText(ru['connect.consent.machine']!)).toBeNull();
    await user.click(screen.getByRole('button', { name: ru['lang.choose']! }));
    expect(screen.queryByRole('link', { name: new RegExp(ru['lang.help']!) })).toBeNull();
  });

  it('a diary that refuses the login is said about the diary', async () => {
    fakeApi({ diaryRefuses: true });
    const user = userEvent.setup();
    render(<App at="/login" />);
    await user.click(await screen.findByRole('button', { name: 'Connect a diary' }));
    await user.type(await screen.findByLabelText('Diary login'), 'diary-user');
    await user.type(screen.getByLabelText('Diary password'), 'x');
    await user.type(screen.getByLabelText('Your Marksy login'), 'parent@example.com');
    await user.type(screen.getByLabelText('Your Marksy password'), 'correct horse battery');
    await user.type(screen.getByLabelText('Your name in the family'), 'Мама');
    await user.click(screen.getByRole('button', { name: 'Connect and create the family' }));
    expect((await screen.findByRole('alert')).textContent).toBe('The diary did not accept this login and password.');
  });

  it('an invite link: what it is for, then a name and a Marksy login', async () => {
    const api = fakeApi();
    const user = userEvent.setup();
    render(<App at="/join/abc123" />);
    await user.click(await screen.findByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('Invite to Семья')).toBeTruthy();
    expect(screen.getByText('as a parent · Марк')).toBeTruthy();
    await user.type(screen.getByLabelText('Your name in the family'), 'Бабушка');
    await user.type(screen.getByLabelText('Your Marksy login'), 'gran@example.com');
    await user.type(screen.getByLabelText('Your Marksy password'), 'correct horse battery');
    await user.click(screen.getByRole('button', { name: 'Join the family' }));
    expect(api.bodies['POST /api/invites/ABC123/accept']).toEqual({
      displayName: 'Бабушка',
      login: 'gran@example.com',
      password: 'correct horse battery',
    });
    expect(await screen.findByRole('heading', { name: 'Who first?' })).toBeTruthy();
  });

  it('a wrong invite code says so', async () => {
    fakeApi();
    const user = userEvent.setup();
    render(<App at="/login" />);
    await user.click(await screen.findByRole('button', { name: 'I have an invite code' }));
    await user.type(screen.getByLabelText('Invite code'), 'ZZZ999');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/This invite code does not work/);
  });

  // the language picker: the screen switches to Russian, so its labels are read from the ru catalog
  it('the language chosen on the login screen becomes the user language after sign-in', async () => {
    const ru = CATALOGS.ru!;
    const api = fakeApi();
    const user = userEvent.setup();
    render(<App at="/login" />);
    await user.click(await screen.findByRole('button', { name: 'Interface language' }));
    await user.click(screen.getByRole('button', { name: 'Русский' }));
    await user.type(await screen.findByLabelText(ru['login.marksyLogin']!), 'parent@example.com');
    await user.type(screen.getByLabelText(ru['login.password']!), 'correct horse battery');
    await user.click(screen.getByRole('button', { name: ru['login.submit']! }));
    await waitFor(() => expect(api.bodies['PATCH /api/me']).toEqual({ locale: 'ru' }));
  });
});
