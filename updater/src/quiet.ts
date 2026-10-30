// Quiet hours (UPDATE_QUIET_HOURS, empty by default): "22:00-07:00" in the host's time zone. An update found inside
// them waits until they end; outside them it installs as soon as it is safe.

export interface QuietHours {
  from: number;
  to: number;
}

const toMinutes = (hhmm: string) => {
  const m = hhmm.match(/^(\d{2}):(\d{2})$/);
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) throw new Error(`not a time: ${hhmm}`);
  return Number(m[1]) * 60 + Number(m[2]);
};

export function parseQuietHours(value: string | undefined): QuietHours | null {
  const v = (value ?? '').trim();
  if (!v) return null;
  const [from, to] = v.split('-');
  if (!from || !to) throw new Error('UPDATE_QUIET_HOURS must be HH:MM-HH:MM');
  return { from: toMinutes(from), to: toMinutes(to) };
}

/** Whether a local time falls inside the quiet hours (which may cross midnight) */
export function inQuietHours(quiet: QuietHours | null, date: Date): boolean {
  if (!quiet) return false;
  const m = date.getHours() * 60 + date.getMinutes();
  return quiet.from <= quiet.to ? m >= quiet.from && m < quiet.to : m >= quiet.from || m < quiet.to;
}
