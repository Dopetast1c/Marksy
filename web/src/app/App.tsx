import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, createMemoryRouter, RouterProvider } from 'react-router';
import type { RouteObject } from 'react-router';
import { FinalsScreen } from '../features/finals/FinalsScreen';
import { MarksScreen } from '../features/marks/MarksScreen';
import { SubjectScreen } from '../features/subjects/SubjectScreen';
import { SubjectsScreen } from '../features/subjects/SubjectsScreen';
import { ConnectMatchScreen } from '../features/auth/ConnectMatchScreen';
import { LoginScreen } from '../features/auth/LoginScreen';
import { MoreScreen } from '../features/more/MoreScreen';
import { EventsScreen } from '../features/overview/EventsScreen';
import { HomeScreen } from '../features/overview/HomeScreen';
import { PickScreen } from '../features/pick/PickScreen';
import { ScheduleScreen } from '../features/schedule/ScheduleScreen';
import { RequireAuth, RequireChild, Start } from './guards';

// Routes (docs/design.md 4). Everything but the login needs a session; every /s/:studentId screen needs a child this
// person sees. Ещё and the screens under it need no child.

export const routes: RouteObject[] = [
  { path: '/login', element: <LoginScreen /> },
  // an invite link (POST /api/family/invites returns /join/<code>)
  { path: '/join/:code', element: <LoginScreen /> },
  {
    element: <RequireAuth />,
    children: [
      { path: '/', element: <Start /> },
      { path: '/connect/matches', element: <ConnectMatchScreen /> },
      { path: '/pick', element: <PickScreen /> },
      { path: '/more', element: <MoreScreen /> },
      {
        path: '/s/:studentId',
        element: <RequireChild />,
        children: [
          { index: true, element: <HomeScreen /> },
          { path: 'events', element: <EventsScreen /> },
          { path: 'marks', element: <MarksScreen /> },
          { path: 'finals', element: <FinalsScreen /> },
          { path: 'subjects', element: <SubjectsScreen /> },
          { path: 'subjects/:subjectId', element: <SubjectScreen /> },
          { path: 'schedule', element: <ScheduleScreen /> },
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
