import { useEffect, useState } from 'react';

/**
 * The current instant, renewed every half minute: a lesson stops being "ahead" (its ⋯ menu goes, the "now" (lesson.now)
 * tint moves on) while the screen stays open. Whether it has passed is core's lessonPassed in the school's zone.
 */
export function useClock(everyMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), everyMs);
    return () => window.clearInterval(id);
  }, [everyMs]);
  return now;
}
