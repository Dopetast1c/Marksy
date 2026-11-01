// The path the app is served under (BASE_PATH, docs/running.md): "" at the root, "/marksy" under a path. One build
// serves any path: the production build is made with a placeholder base that the web container replaces when it
// starts (docker/web/entrypoint.sh), so this value, Vite's asset URLs and the router all follow it.

/** "/" → "", "/marksy/" → "/marksy" */
export const basePathOf = (baseUrl: string) => baseUrl.replace(/\/+$/, '');

export const BASE = basePathOf(import.meta.env.BASE_URL);

/** An address of this app, from a path that starts with "/": "/api/me/wallpaper" → "/marksy/api/me/wallpaper" */
export const appPath = (path: string) => `${BASE}${path}`;
