import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation, useNavigate, useParams } from 'react-router';
import { api, whenSignedOut } from '../api/client';
import type { Locale } from '../api/client';
import { useMe } from '../api/queries';
import { useQueryClient } from '@tanstack/react-query';
import { EmptyState } from '../components/EmptyState';
import { i18n, languageOverride, setLanguage, takePendingLanguage, useT } from '../i18n';
import { restoredChild } from '../lib/pick';
import { useDevice } from '../state/store';

// Who may see what: a session for everything but the login (design.md 7.6), and a picked child for every child
// screen (design.md 4): «С кого начнём?» comes back after 12 hours away instead of quietly using the last child.

export function RequireAuth() {
  const t = useT();
  const me = useMe();
  const navigate = useNavigate();
  const queries = useQueryClient();
  useEffect(() => {
    whenSignedOut(() => {
      queries.clear();
      navigate('/login', { replace: true });
    });
  }, [navigate, queries]);
  // the language: one chosen before sign-in becomes the user's; otherwise the user's saved one (docs/i18n.md 3)
  const userId = me.data?.user.id;
  const saved = me.data?.user.locale;
  useEffect(() => {
    // a development override (smoke:ui --lang, the pseudo-locale) leaves the user's language alone
    if (!userId || !saved || languageOverride()) return;
    const pending = takePendingLanguage();
    if (pending && pending !== saved) void api.PATCH('/api/me', { body: { locale: pending as Locale } });
    else if (!pending && saved !== i18n.language) void setLanguage(saved);
  }, [userId, saved]);
  if (me.isPending) return <EmptyState title={t('app.loading')} />;
  if (me.isError) return <EmptyState title={t('app.error')} />;
  if (!me.data) return <Navigate to="/login" replace />;
  return <Outlet />;
}

/** The child this device continues with, or null when «С кого начнём?» must show */
export function useContinueChild(): string | null {
  const me = useMe();
  const { pick, alwaysLast } = useDevice();
  // the moment the screen opened: the 12-hour rule is decided once, not on every render
  const [now] = useState(() => Date.now());
  const data = me.data;
  if (!data) return null;
  return restoredChild(pick, {
    alwaysLast,
    now,
    childIds: data.students.map((s) => s.id),
    role: data.family?.role ?? 'parent',
  });
}

/** "/": the last child within 12 hours, otherwise the picker */
export function Start() {
  const id = useContinueChild();
  return <Navigate to={id ? `/s/${id}` : '/pick'} replace />;
}

/**
 * Every child screen: the child must be one this person sees. Opening one counts as the choice (a deep link or a
 * notification carries the child, design.md 4); coming back to the app after 12 hours brings the picker back.
 */
export function RequireChild() {
  const { studentId } = useParams();
  const me = useMe();
  const choose = useDevice((s) => s.choose);
  const touch = useDevice((s) => s.touch);
  const continueWith = useContinueChild();
  const navigate = useNavigate();
  const location = useLocation();
  const known = !!me.data?.students.some((s) => s.id === studentId);

  useEffect(() => {
    if (known && studentId) choose(studentId);
  }, [known, studentId, choose]);
  // every screen change is activity
  useEffect(() => {
    touch();
  }, [location.pathname, touch]);
  // back in the foreground after a long pause: ask again (unless the device always starts with the last child)
  useEffect(() => {
    const onShow = () => {
      if (document.visibilityState !== 'visible') return;
      const s = useDevice.getState();
      const children = me.data?.students.map((k) => k.id) ?? [];
      const keep = restoredChild(s.pick, {
        alwaysLast: s.alwaysLast,
        now: Date.now(),
        childIds: children,
        role: me.data?.family?.role ?? 'parent',
      });
      if (!keep) navigate('/pick', { replace: true });
      else touch();
    };
    document.addEventListener('visibilitychange', onShow);
    return () => document.removeEventListener('visibilitychange', onShow);
  }, [me.data, navigate, touch]);

  if (!known) return <Navigate to={continueWith ? `/s/${continueWith}` : '/pick'} replace />;
  return <Outlet />;
}
