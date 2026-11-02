/** Tab switch: Set screen Words / Rules, form variants (Word | Rule). */
export function SegmentedControl({
  labels,
  selectedIndex,
  onChange,
}: {
  labels: string[];
  selectedIndex: number;
  onChange: (index: number) => void;
}) {
  return (
    <div role="tablist" className="flex rounded-xl bg-surface-2 p-1">
      {labels.map((label, i) => (
        <button
          key={label}
          type="button"
          role="tab"
          aria-selected={i === selectedIndex}
          onClick={() => onChange(i)}
          className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
            i === selectedIndex
              ? 'bg-surface text-fg shadow-sm'
              : 'text-muted hover:text-fg'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
