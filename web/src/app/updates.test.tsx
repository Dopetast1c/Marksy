import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { basePathOf } from '../lib/base';
import { initI18n } from '../i18n';
import { useDevice } from '../state/store';
import { FIXTURE_NOW } from '../test/setup';
import { fakeApi, KIDS } from '../test/fake-api';
import { App } from './App';

// Running in production (docs/running.md): one build at any base path, the prompt naming a newer version, and the data
// on screen kept while the server restarts for an update.

beforeAll(() => {
  initI18n('en');
});
beforeEach(() => {
  useDevice.setState({ pick: { id: KIDS[0]!.id, lastActive: FIXTURE_NOW.getTime() }, alwaysLast: false });
});

describe('base path', () => {
  it('the root and a path', () => {
    expect(basePathOf('/')).toBe('');
    expect(basePathOf('/marksy/')).toBe('/marksy');
    expect(basePathOf('/home/marksy/')).toBe('/home/marksy');
  });
});

describe('updates', () => {
  it('no prompt while the server runs this build', async () => {
    fakeApi({ signedIn: true, locale: 'en' });
    render(<App at="/more" />);
    await screen.findByText(/\(admin\)$/);
    expect(screen.queryByText(/is available/)).toBeNull();
  });

  it('a newer server: the prompt names its version, and a tap loads the new page', async () => {
    fakeApi({ signedIn: true, locale: 'en', serverVersion: '9.9.9' });
    const reload = vi.fn();
    vi.spyOn(window, 'location', 'get').mockReturnValue({ ...window.location, reload } as Location);
    render(<App at="/more" />);
    expect(await screen.findByText('Marksy 9.9.9 is available')).toBeTruthy();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Update' }));
    expect(reload).toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it('the server restarting: the data stays on screen with the line «no connection»', async () => {
    fakeApi({ signedIn: true, locale: 'en', serverDown: true });
    render(<App at={`/s/${KIDS[0]!.id}`} />);
    expect(await screen.findByText(/^No connection to the server\./)).toBeTruthy();
    // the screen itself is there, not an error page
    expect(screen.queryByText('Something went wrong. Try again in a minute.')).toBeNull();
    expect(screen.getByRole('heading', { level: 1 })).toBeTruthy();
  });
});
