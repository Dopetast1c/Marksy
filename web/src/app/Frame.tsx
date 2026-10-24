import type { ReactNode } from 'react';
import { TabBar } from '../components/TabBar';

// The app column: a phone-width column centred on a tablet or a desktop (ux-principles 5 keeps wider layouts open),
// the body that scrolls (the period swipe listens on it) and the tab bar at the bottom.

export function Frame({
  children,
  studentId,
  tabs = true,
}: {
  children: ReactNode;
  studentId: string | null;
  tabs?: boolean;
}) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[560px] flex-col">
      <div className="flex flex-1 flex-col">{children}</div>
      {tabs && <TabBar studentId={studentId} />}
    </div>
  );
}

/** The scrolling body of a screen: the period navigator's swipe works over it */
export function Body({ children }: { children: ReactNode }) {
  return (
    <main data-swipe-body className="flex flex-1 touch-pan-y flex-col gap-3.5 overflow-x-clip px-5 pb-5">
      {children}
    </main>
  );
}
