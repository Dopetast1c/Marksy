import { NavLink, useLocation } from 'react-router';
import { useT } from '../i18n';
import { HomeTabIcon, MarksTabIcon, MoreTabIcon, ScheduleTabIcon, SubjectsTabIcon } from './icons';

// Five bottom tabs (ux-principles D1): Главная, Оценки, Предметы, Расписание, Ещё. The child stays the same when
// switching tabs; the tab bar never changes with the child (D53). Ещё needs no child.

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
  const look = (active: boolean) =>
    `relative flex min-w-0 flex-col items-center gap-[3px] rounded-sm py-1.5 text-[10.5px] font-bold whitespace-nowrap ${active ? 'text-accent' : 'text-ink3'}`;
  const cls = ({ isActive }: { isActive: boolean }) => look(isActive);
  return (
    <nav
      aria-label={t('tabs.label')}
      className="sticky bottom-0 z-10 grid grid-cols-5 border-t border-line bg-surface px-1 pt-1.5 pb-[max(18px,env(safe-area-inset-bottom))]"
    >
      {TABS.map(({ key, path, icon: Icon, also }) => (
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
