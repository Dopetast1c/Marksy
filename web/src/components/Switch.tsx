// An on/off switch: role="switch", the whole thumb a 44 px target, the accent colour when on.

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (on: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="grid min-h-[var(--tap-min)] flex-none place-items-center"
    >
      <span
        className={`relative block h-[30px] w-[50px] rounded-pill transition-colors ${checked ? 'bg-accent' : 'bg-line'}`}
      >
        <span
          className={`absolute top-[3px] size-6 rounded-pill bg-surface shadow-card transition-[left] ${checked ? 'left-[23px]' : 'left-[3px]'}`}
        />
      </span>
    </button>
  );
}
