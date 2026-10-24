import type { ButtonHTMLAttributes, InputHTMLAttributes } from 'react';

// A labelled text field of the forms (login, connect, invite), as the prototype's .field: a 13 px bold label, a
// 48 px input with a 1.5 px line border, the accent outline on focus.

export function Field({ label, ...input }: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-bold text-ink2">{label}</span>
      <input
        {...input}
        className="min-h-12 rounded-md border-[1.5px] border-line bg-surface px-3.5 py-3 text-ink placeholder:text-ink3 focus:border-transparent focus:outline-2 focus:outline-accent"
      />
    </label>
  );
}

/** The app's main button (.btn) and its quiet variant on the second surface (.btn.ghost) */
export function Button({ ghost = false, ...rest }: { ghost?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...rest}
      className={`flex min-h-12 w-full items-center justify-center rounded-md px-4 text-[15px] font-extrabold disabled:opacity-60 ${ghost ? 'bg-surface2 text-ink' : 'bg-accent text-accent-ink'}`}
    />
  );
}
