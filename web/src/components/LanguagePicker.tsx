import { LANGUAGES } from '@marksy/i18n';
import { useState } from 'react';
import { i18n, useT } from '../i18n';
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
          className="inline-flex min-h-9 items-center gap-6 rounded-pill bg-surface2 py-1.5 pr-2.5 pl-2.5 text-[13px] font-bold text-ink"
        >
          {current.nativeName}
          <DownIcon size={16} className="text-ink3" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          className="flex w-full items-center gap-3 rounded-lg bg-surface px-3.5 py-2.5 text-left shadow-card"
        >
          <span className="grid size-8 place-items-center rounded-[9px] bg-accent-soft text-accent">
            <GlobeIcon />
          </span>
          <span className="flex-1">
            <b className="block text-[14px]">{t('lang.title')}</b>
            <span className="text-[12.5px] text-ink3">{current.nativeName}</span>
          </span>
        </button>
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
