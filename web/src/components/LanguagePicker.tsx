import { isReviewed, LANGUAGES } from '@marksy/i18n';
import { useState } from 'react';
import { i18n, useT } from '../i18n';
import { MenuRow } from './MenuRow';
import { BottomSheet, SheetOption } from './BottomSheet';
import { DownIcon, GlobeIcon } from './icons';

// The language choice (docs/i18n.md 3): twelve native names in a sheet (more than four options, D32). Used at the
// bottom of the login screen and in Ещё; the caller decides what else happens (remember for the user after sign-in,
// or save it now).

export function LanguagePicker({
  onPick,
  variant = 'link',
}: {
  onPick: (code: string) => void;
  variant?: 'link' | 'row';
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const current = LANGUAGES.find((l) => l.code === i18n.language) ?? LANGUAGES[0]!;
  return (
    <>
      {variant === 'link' ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-label={t('lang.choose')}
          className="relative inline-flex min-h-9 items-center after:absolute after:-inset-y-1 after:inset-x-0 gap-6 rounded-pill bg-surface2 py-1.5 pr-2.5 pl-2.5 text-[13px] font-bold text-ink"
        >
          {current.nativeName}
          <DownIcon size={16} className="text-ink3" />
        </button>
      ) : (
        <MenuRow
          icon={<GlobeIcon />}
          title={t('lang.title')}
          sub={isReviewed(current) ? current.nativeName : t('lang.unreviewed', { language: current.nativeName })}
          onClick={() => setOpen(true)}
        />
      )}
      <BottomSheet open={open} onClose={() => setOpen(false)} label={t('lang.choose')}>
        <span className="text-label text-ink3 uppercase">{t('lang.choose')}</span>
        {LANGUAGES.map((l) => (
          <SheetOption
            key={l.code}
            title={l.nativeName}
            selected={l.code === current.code}
            onSelect={() => {
              setOpen(false);
              onPick(l.code);
            }}
          />
        ))}
      </BottomSheet>
    </>
  );
}
