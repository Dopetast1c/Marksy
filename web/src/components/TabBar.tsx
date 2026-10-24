import { NavLink, useLocation } from 'react-router';
import { useMe } from '../api/queries';
import { useT } from '../i18n';
import { HomeTabIcon, MarksTabIcon, MoreTabIcon, ScheduleTabIcon, SubjectsTabIcon } from './icons';

// Five bottom tabs (ux-principles D1): Главная, Оценки, Предметы, Расписание, Ещё. The child stays the same when
// switching tabs; the tab bar never changes with the child (D53): Расписание stays while any child has lessons and is
// left out only when none has (a child without a timetable gets an empty state there). Ещё needs no child.

const TABS = [
  // Внимание is reached from Главная and belongs to its tab (the prototype's TAB_OF)
  { key: 'home', path: '', icon: HomeTabIcon, also: /^\/s\/[^/]+(\/events)?$/ },
  // Итоги is reached from Оценки (and Предметы) and belongs to Оценки
  { key: 'marks', path: '/marks', icon: MarksTabIcon, also: /^\/s\/[^/]+\/(marks|finals)$/ },
  { key: 'subjects', path: '/subjects', icon: SubjectsTabIcon, also: null },
  { key: 'schedule', path: '/schedule', icon: ScheduleTabIcon, also: null },
] as const;

export function TabBar({ studentId }: { studentId: string | null }) {
  const t = useT();
  const { pathname } = useLocation();
  const me = useMe();
  const kids = me.data?.students ?? [];
  const lessons = !kids.length || kids.some((k) => k.capabilities.lessons);
  const tabs = TABS.filter((tab) => tab.key !== 'schedule' || lessons);
  const look = (active: boolean) =>
    `relative flex min-w-0 flex-col items-center gap-[3px] rounded-sm py-1.5 text-[10.5px] font-bold whitespace-nowrap ${active ? 'text-accent' : 'text-ink3'}`;
  const cls = ({ isActive }: { isActive: boolean }) => look(isActive);
  return (
    <nav
      aria-label={t('tabs.label')}
      style={{ gridTemplateColumns: `repeat(${tabs.length + 1}, minmax(0, 1fr))` }}
      className="sticky bottom-0 z-10 grid border-t border-line bg-surface px-1 pt-1.5 pb-[max(18px,env(safe-area-inset-bottom))]"
    >
      {tabs.map(({ key, path, icon: Icon, also }) => (
        <NavLink
          key={key}
          to={studentId ? `/s/${studentId}${path}` : '/pick'}
          className={({ isActive }) => look(also ? also.test(pathname) : isActive)}
        >
          <Icon size={22} />
          {t(`tabs.${key}`)}
        </NavLink>
      ))}
      <NavLink to="/more" className={cls}>
        <MoreTabIcon size={22} />
        {t('tabs.more')}
      </NavLink>
    </nav>
  );
}
