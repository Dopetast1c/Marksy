import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, createMemoryRouter, RouterProvider } from 'react-router';
import type { RouteObject } from 'react-router';
import { LoginScreen } from '../features/auth/LoginScreen';
import { MoreScreen } from '../features/more/MoreScreen';
import { EventsScreen } from '../features/overview/EventsScreen';
import { HomeScreen } from '../features/overview/HomeScreen';
import { PickScreen } from '../features/pick/PickScreen';
import { SoonScreen } from '../features/placeholder/Soon';
import { RequireAuth, RequireChild, Start } from './guards';

// Routes (docs/design.md 4). Everything but the login needs a session; every /s/:studentId screen needs a child this
// person sees. Ещё and the screens under it need no child.

export const routes: RouteObject[] = [
  { path: '/login', element: <LoginScreen /> },
  {
    element: <RequireAuth />,
    children: [
      { path: '/', element: <Start /> },
      { path: '/pick', element: <PickScreen /> },
      { path: '/more', element: <MoreScreen /> },
      {
        path: '/s/:studentId',
        element: <RequireChild />,
        children: [
          { index: true, element: <HomeScreen /> },
          { path: 'events', element: <EventsScreen /> },
          { path: 'marks', element: <SoonScreen screen="marks" /> },
          { path: 'subjects', element: <SoonScreen screen="subjects" /> },
          { path: 'schedule', element: <SoonScreen screen="schedule" /> },
        ],
      },
      { path: '*', element: <Start /> },
    ],
  },
];

export function newQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: true, retry: 1 } } });
}

export function App({ client = newQueryClient(), at }: { client?: QueryClient; at?: string }) {
  const router = at ? createMemoryRouter(routes, { initialEntries: [at] }) : createBrowserRouter(routes);
  return (
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
