import { useEffect, useRef } from 'react';

// Calls `onNear` when the element it is attached to comes within about two screens of the viewport: a long list
// loads its next page before the reader reaches the end (Marks, design.md 5.3). Without IntersectionObserver
// (an old browser) nothing happens and the list's "Show more" (marks.more) button does the job.

// `round` changes with every page: a fresh observer reports the element again if it is still near after the page came
export function useNearEnd<T extends Element>(onNear: () => void, enabled: boolean, round: number) {
  const ref = useRef<T>(null);
  const latest = useRef(onNear);
  useEffect(() => {
    latest.current = onNear;
  });
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && latest.current(), {
      rootMargin: '0px 0px 200% 0px',
    });
    io.observe(el);
    return () => io.disconnect();
  }, [enabled, round]);
  return ref;
}
