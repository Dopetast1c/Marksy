import type { ReactNode, SVGProps } from 'react';

// The app's line icons, the set of docs/mockups.html (ICONS, NOTE_ICONS, TABS): stroke style, currentColor, no emoji.

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function line(paths: ReactNode, defaults: { width?: number } = {}) {
  return function Icon({ size = 18, ...rest }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={defaults.width ?? 2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        {...rest}
      >
        {paths}
      </svg>
    );
  };
}

function filled(paths: ReactNode) {
  return function Icon({ size = 22, ...rest }: IconProps) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...rest}>
        {paths}
      </svg>
    );
  };
}

export const BackIcon = line(<path d="M15 5l-7 7 7 7" />, { width: 2.2 });
export const ChevIcon = line(<path d="M9 5l7 7-7 7" />, { width: 2.2 });
export const DownIcon = line(<path d="M6 9l6 6 6-6" />, { width: 2.4 });
export const CheckIcon = line(<path d="M5 12l5 5L20 7" />, { width: 2.4 });
export const ClockIcon = line(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </>,
);
export const SlidersIcon = line(
  <>
    <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
    <circle cx="16" cy="7" r="2" />
    <circle cx="10" cy="17" r="2" />
  </>,
);
export const SyncIcon = line(
  <>
    <path d="M20 11a8 8 0 0 0-14.5-4.5L4 8" />
    <path d="M4 3v5h5" />
    <path d="M4 13a8 8 0 0 0 14.5 4.5L20 16" />
    <path d="M20 21v-5h-5" />
  </>,
);
export const OutIcon = line(
  <>
    <path d="M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h5" />
    <path d="M15 8l4 4-4 4M19 12H9" />
  </>,
);
export const GlobeIcon = line(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
  </>,
);
export const UsersIcon = line(
  <>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
    <circle cx="17" cy="9" r="2.5" />
    <path d="M16 15.5a5 5 0 0 1 5.5 4.5" />
  </>,
);
export const CommentIcon = line(<path d="M4 5h16v11H9l-5 4z" />, { width: 2.2 });
export const SunIcon = line(
  <>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </>,
);
export const MarksNoteIcon = line(
  <>
    <rect x="3" y="7" width="5" height="10" rx="1.5" />
    <rect x="10" y="7" width="5" height="10" rx="1.5" />
    <rect x="17" y="7" width="4" height="10" rx="1.5" />
  </>,
);
export const TestNoteIcon = line(
  <>
    <path d="M9 3h6l1 3H8z" />
    <rect x="5" y="5" width="14" height="16" rx="2" />
    <path d="M9 12l2 2 4-4" />
  </>,
);
export const LabNoteIcon = line(
  <>
    <path d="M9 3h6M10 3v6L5 19a1.5 1.5 0 0 0 1.3 2h11.4a1.5 1.5 0 0 0 1.3-2L14 9V3" />
    <path d="M7.5 15h9" />
  </>,
);
export const PenNoteIcon = line(
  <>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
  </>,
);
export const DotsIcon = filled(
  <>
    <circle cx="5" cy="12" r="1.9" />
    <circle cx="12" cy="12" r="1.9" />
    <circle cx="19" cy="12" r="1.9" />
  </>,
);

// the five tabs (ux-principles D1)
export const HomeTabIcon = line(<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />);
export const MarksTabIcon = line(<path d="M4 6h16M4 12h16M4 18h10" />);
export const SubjectsTabIcon = line(
  <>
    <rect x="3" y="4" width="7" height="7" rx="1.5" />
    <rect x="14" y="4" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
  </>,
);
export const ScheduleTabIcon = line(
  <>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </>,
);
export const MoreTabIcon = filled(
  <>
    <circle cx="5" cy="12" r="2" />
    <circle cx="12" cy="12" r="2" />
    <circle cx="19" cy="12" r="2" />
  </>,
);
