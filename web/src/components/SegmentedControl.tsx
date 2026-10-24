// A segmented control: up to four short choices in one pill (more, or choices that need explaining, open a
// BottomSheet, D32). It is a horizontal strip, so a swipe that starts on it never steps the period (data-hscroll).

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} data-hscroll className="flex gap-0.5 rounded-pill bg-surface2 p-[3px]">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className="flex-1 rounded-pill px-1 py-[7px] text-[13px] font-bold whitespace-nowrap text-ink2 aria-pressed:bg-surface aria-pressed:text-ink aria-pressed:shadow-card"
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
