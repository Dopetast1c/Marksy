import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../app/App';
import { initI18n } from '../../i18n';
import { useDevice } from '../../state/store';
import { fakeApi } from '../../test/fake-api';

// The crop step of a child's photo avatar (D62) on the child's screen in Family. jsdom draws nothing, so the canvas
// records what it is asked to draw: the square drawn into the 512 px output is the crop.

const draws: { canvas: HTMLCanvasElement; args: unknown[] }[] = [];
const sizes: { width: number; height: number }[] = [];

beforeAll(() => {
  initI18n('en');
  // jsdom without pointer events: a mouse event with a pointer id is enough for the handlers
  if (!('PointerEvent' in window)) {
    class FakePointerEvent extends MouseEvent {
      pointerId: number;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 0;
      }
    }
    Object.assign(window, { PointerEvent: FakePointerEvent });
  }
});
beforeEach(() => {
  useDevice.setState({ pick: null, alwaysLast: false });
  draws.length = 0;
  sizes.length = 0;
  vi.stubGlobal('createImageBitmap', async () => ({ ...(sizes.shift() ?? { width: 3000, height: 2000 }), close() {} }));
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
    return {
      setTransform() {},
      clearRect() {},
      drawImage: (...args: unknown[]) => draws.push({ canvas: this, args }),
    } as never;
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((done: BlobCallback) =>
    done(new Blob(['jpeg'], { type: 'image/jpeg' })),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const photo = () => new File(['raw'], 'photo.jpg', { type: 'image/jpeg' });

async function openCrop() {
  const api = fakeApi({ signedIn: true });
  const user = userEvent.setup();
  render(<App at="/more/family/child/kid-mark" />);
  expect(await screen.findByRole('heading', { name: 'Марк' })).toBeTruthy();
  await user.upload(screen.getByText('Upload a photo').querySelector('input')!, photo());
  const sheet = await screen.findByRole('dialog', { name: 'What the avatar shows' });
  const zoom = within(sheet).getByRole('slider', { name: 'Zoom' });
  await waitFor(() => expect(zoom).toHaveProperty('disabled', false));
  const area = within(sheet).getByRole('application', { name: 'The photo under the round avatar frame' });
  return { api, user, sheet, zoom, area };
}

describe('the crop step of a photo avatar', () => {
  it('opens before anything is sent; moving and zooming choose the square that is uploaded', async () => {
    const { api, user, sheet, zoom, area } = await openCrop();
    // the circle is focused at once, the photo starts centred and just covering it, nothing is sent yet
    expect(document.activeElement).toBe(area);
    expect(area.getAttribute('aria-describedby')).toBeTruthy();
    expect(zoom.getAttribute('aria-valuetext')).toBe('100%');
    expect(within(sheet).getByRole('img', { name: 'Preview' })).toBeTruthy();
    expect(api.calls).not.toContain('PUT /api/students/kid-mark/photo');

    // the keyboard: + zooms around the centre, an arrow moves the photo
    await user.keyboard('+');
    expect(zoom.getAttribute('aria-valuetext')).toBe('120%');
    await user.keyboard('{ArrowRight}');
    // a drag 60 px to the right
    fireEvent.pointerDown(area, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(area, { pointerId: 1, clientX: 160, clientY: 100 });
    fireEvent.pointerUp(area, { pointerId: 1, clientX: 160, clientY: 100 });
    draws.length = 0;
    await user.keyboard('{Enter}');

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(api.uploads?.['PUT /api/students/kid-mark/photo']).toEqual({ type: 'image/jpeg', size: 4 });
    const out = draws.find((d) => d.canvas.width === 512)!;
    expect(out.canvas.height).toBe(512);
    const [, sx, sy, sw, sh, ...dest] = out.args as number[];
    // a square of the 3000 × 2000 photo: its shorter side over the zoom
    expect(sw).toBeCloseTo(2000 / 1.2);
    expect(sh).toBe(sw);
    expect(dest).toEqual([0, 0, 512, 512]);
    expect(sy).toBeCloseTo(1000 - 1000 / 1.2);
    // the photo moved 12 + 60 CSS px to the right, so the square lies that much left of the centre
    const scale = (1.2 * 300 * 0.84) / 2000;
    expect(sx).toBeCloseTo(1500 - 72 / scale - 1000 / 1.2);
    expect(await screen.findByRole('button', { name: 'No avatar' })).toBeTruthy();
  });

  it('the slider and the wheel zoom up to 4×, a small photo less; another photo starts over', async () => {
    sizes.push({ width: 3000, height: 2000 }, { width: 1000, height: 1000 });
    const { user, sheet, zoom, area } = await openCrop();
    fireEvent.wheel(area, { deltaY: -200 });
    expect(Number.parseInt(zoom.getAttribute('aria-valuetext')!)).toBeGreaterThan(100);
    fireEvent.change(zoom, { target: { value: '1000' } });
    expect(zoom.getAttribute('aria-valuetext')).toBe('400%');
    await user.keyboard('+');
    expect(zoom.getAttribute('aria-valuetext')).toBe('400%');

    // 1000 px is not enough for 4× on a sharp avatar
    await user.upload(within(sheet).getByText('Pick another photo').querySelector('input')!, photo());
    const again = within(sheet).getByRole('slider', { name: 'Zoom' });
    await waitFor(() => expect(again).toHaveProperty('disabled', false));
    expect(again.getAttribute('aria-valuetext')).toBe('100%');
    fireEvent.change(again, { target: { value: '1000' } });
    expect(again.getAttribute('aria-valuetext')).toBe('379%');
  });

  it('Cancel and Esc leave the avatar as it was', async () => {
    const { api, user, sheet } = await openCrop();
    await user.click(within(sheet).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    await user.upload(screen.getByText('Upload a photo').querySelector('input')!, photo());
    await screen.findByRole('dialog', { name: 'What the avatar shows' });
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(api.calls).not.toContain('PUT /api/students/kid-mark/photo');
    expect(api.calls.filter((c) => c.startsWith('PATCH /api/students'))).toEqual([]);
    expect(screen.queryByRole('button', { name: 'No avatar' })).toBeNull();
  });

  it('a picture that cannot be opened says so and offers another', async () => {
    fakeApi({ signedIn: true });
    vi.stubGlobal('createImageBitmap', async () => {
      throw new Error('decode');
    });
    const user = userEvent.setup();
    render(<App at="/more/family/child/kid-mark" />);
    await user.upload((await screen.findByText('Upload a photo')).querySelector('input')!, photo());
    const sheet = await screen.findByRole('dialog', { name: 'What the avatar shows' });
    expect((await within(sheet).findByRole('alert')).textContent).toBe(
      'This photo cannot be opened. Pick another one.',
    );
    expect(within(sheet).getByRole('button', { name: 'Done' })).toHaveProperty('disabled', true);
    expect(within(sheet).getByText('Pick another photo')).toBeTruthy();
  });
});
