import { useServerHealth } from '../api/queries';
import { useT } from '../i18n';

// The update prompt (docs/running.md, updates): one line above the tab bar of every screen when the server runs
// another version than this page was built for, naming that version. A tap loads the new page; nothing reloads by
// itself, so a half-typed homework note is never lost. The service worker of M8 plugs into this same prompt.

export function UpdatePrompt() {
  const t = useT();
  const health = useServerHealth();
  const next = health.data?.version;
  if (!next || next === __MARKSY_VERSION__) return null;
  return (
    <div role="status" className="px-3 pb-2">
      <div className="flex items-center gap-3 rounded-md bg-accent-soft px-3 py-2 text-[12.5px] leading-[1.35] text-accent">
        <span className="flex-1">{t('app.update.available', { version: next })}</span>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="min-h-9 flex-none rounded-pill bg-accent px-3.5 font-bold text-accent-ink"
        >
          {t('app.update.reload')}
        </button>
      </div>
    </div>
  );
}
