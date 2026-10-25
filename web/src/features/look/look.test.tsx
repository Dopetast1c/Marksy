import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../app/App';
import { initI18n } from '../../i18n';
import { useDevice } from '../../state/store';
import { fakeApi, KIDS } from '../../test/fake-api';
import { FIXTURE_NOW } from '../../test/setup';

beforeAll(() => {
  initI18n('ru');
});
beforeEach(() => {
  useDevice.setState({ pick: null, alwaysLast: false });
});
afterEach(() => {
  for (const a of ['data-palette', 'data-font', 'data-wall']) document.documentElement.removeAttribute(a);
});

const [milena] = KIDS as [(typeof KIDS)[number]];
const root = document.documentElement;

describe('Оформление', () => {
  it('opens from its row in Ещё, which sums it up', async () => {
    fakeApi({ signedIn: true, appearance: { theme: 'dark', font: 'rubik' } });
    render(<App at="/more" />);
    const row = await screen.findByText('Тёмная · палитра «Морская» · Rubik');
    await userEvent.setup().click(row);
    expect(await screen.findByRole('heading', { name: 'Оформление' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Тёмная', pressed: true })).toBeTruthy();
    expect(root.getAttribute('data-font')).toBe('rubik');
  });

  it('a palette, a font and the theme apply at once and are saved to the person', async () => {
    const api = fakeApi({ signedIn: true });
    render(<App at="/more/look" />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Лесная' }));
    expect(root.getAttribute('data-palette')).toBe('forest');
    expect(api.bodies['PATCH /api/me/settings']).toEqual({ appearance: { palette: 'forest' } });
    await user.click(screen.getByRole('button', { name: /Nunito/ }));
    expect(root.getAttribute('data-font')).toBe('nunito');
    expect(api.bodies['PATCH /api/me/settings']).toEqual({ appearance: { font: 'nunito' } });
    await user.click(screen.getByRole('button', { name: 'Как в системе' }));
    expect(root.hasAttribute('data-theme')).toBe(false);
    expect(screen.getByText(/Цвета оценок, градаций и предупреждений остаются прежними/)).toBeTruthy();
  });

  it('wallpaper: a pattern, how much it shows, and an own picture scaled to 1600 px before it is sent', async () => {
    const api = fakeApi({ signedIn: true });
    render(<App at="/more/look" />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Обои' }));
    expect(root.getAttribute('data-wall')).toBe('pattern');
    await user.click(screen.getByRole('button', { name: 'Точки' }));
    expect(root.style.getPropertyValue('--wall-image')).toBe('url("/wallpapers/dots.svg")');
    expect(screen.getByLabelText('Насколько видны обои')).toHaveProperty('value', '35');
    expect(screen.queryByRole('button', { name: 'Удалить фото' })).toBeNull();

    const canvas = { width: 0, height: 0 };
    vi.stubGlobal('createImageBitmap', async () => ({ width: 4000, height: 3000, close() {} }));
    const create = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag !== 'canvas') return create(tag);
      return Object.assign(canvas, {
        getContext: () => ({ drawImage() {} }),
        toBlob: (done: (b: Blob) => void) => done(new Blob(['jpeg'], { type: 'image/jpeg' })),
      }) as unknown as HTMLCanvasElement;
    });
    const file = new File(['raw'], 'photo.heic.jpg', { type: 'image/jpeg' });
    await user.upload(screen.getByText('Загрузить').querySelector('input')!, file);
    expect(await screen.findByRole('button', { name: 'Своё', pressed: true })).toBeTruthy();
    expect(canvas).toMatchObject({ width: 1600, height: 1200 });
    expect(api.calls).toContain('PUT /api/me/wallpaper');
    expect(root.getAttribute('data-wall')).toBe('own');

    await user.click(screen.getByRole('button', { name: 'Удалить фото' }));
    expect(await screen.findByText('Загрузить')).toBeTruthy();
    expect(api.calls).toContain('DELETE /api/me/wallpaper');
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('lists the picked child’s subject colours, the family’s, and changes one in the sheet', async () => {
    useDevice.setState({ pick: { id: milena.id, lastActive: FIXTURE_NOW.getTime() }, alwaysLast: false });
    const api = fakeApi({ signedIn: true });
    render(<App at="/more/look" />);
    expect(await screen.findByText('Милена · видят все в семье')).toBeTruthy();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /Алгебра/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Алгебра' });
    await user.click(within(sheet).getByRole('button', { name: /Зелёный/ }));
    expect(api.bodies['PUT /api/students/kid-milena/subjects/sub-al/color']).toEqual({ color: 'green' });
  });

  it('without a picked child there is no subject list', async () => {
    fakeApi({ signedIn: true });
    render(<App at="/more/look" />);
    expect(await screen.findByRole('heading', { name: 'Оформление' })).toBeTruthy();
    expect(screen.queryByText('Цвета предметов')).toBeNull();
  });
});
