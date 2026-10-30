import { isReviewed, LANGUAGES, PSEUDO_LOCALE, pseudoString } from '@marksy/i18n';
import { useState } from 'react';
import { i18n, setLanguageOverride, useT } from '../i18n';
import { translationIssueUrl } from '../lib/links';
import { MenuRow } from './MenuRow';
import { BottomSheet, SheetOption } from './BottomSheet';
import { DownIcon, GlobeIcon } from './icons';

// The language choice (docs/i18n.md 3): twelve native names in a sheet (more than four options, D32). Used at the
// bottom of the login screen and in More (tabs.more); the caller decides what else happens (remember for the user after sign-in,
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
            selected={l.code === i18n.language}
            onSelect={() => {
              setOpen(false);
              onPick(l.code);
            }}
          />
        ))}
        {current.status === 'machine' && current.code === i18n.language && (
          // a machine translation asks for corrections: the project's form, text only (docs/i18n.md 6)
          <a
            href={translationIssueUrl(current.code)}
            target="_blank"
            rel="noreferrer"
            className="flex flex-col gap-0.5 py-2.5"
          >
            <span className="font-bold text-accent">{t('lang.help')}</span>
            <span className="text-small text-ink3">{t('lang.help.sub')}</span>
          </a>
        )}
        {import.meta.env.DEV && (
          // development only: the pseudo-locale for this device, never saved for the user (docs/i18n.md 5)
          <SheetOption
            title={pseudoString(PSEUDO_LOCALE)}
            selected={i18n.language === PSEUDO_LOCALE}
            onSelect={() => {
              setOpen(false);
              void setLanguageOverride(PSEUDO_LOCALE);
            }}
          />
        )}
      </BottomSheet>
    </>
  );
}
