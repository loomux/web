import { ToggleButton, ToggleButtonGroup, type Key } from "react-aria-components";

// A one-of-N choice shown as joined buttons (theme, relay, list filters).
// react-aria gives it radio semantics and arrow-key movement.
export interface SegmentedOption<K extends string> {
  key: K;
  label: string;
}

export function Segmented<K extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: SegmentedOption<K>[];
  value: K;
  onChange: (key: K) => void;
}) {
  return (
    <ToggleButtonGroup
      aria-label={label}
      selectionMode="single"
      disallowEmptySelection
      selectedKeys={[value]}
      onSelectionChange={(keys: Set<Key>) => {
        const [first] = keys;
        if (first !== undefined) onChange(String(first) as K);
      }}
      className="inline-flex rounded-control border border-line bg-surface-2 p-1 gap-1"
    >
      {options.map((o) => (
        <ToggleButton
          key={o.key}
          id={o.key}
          className="min-h-9 pointer-coarse:min-h-11 rounded-[7px] px-3 text-sm font-bold text-ink-2 data-[hovered]:text-ink data-[selected]:bg-surface data-[selected]:text-ink data-[selected]:shadow-1 data-[selected]:ring-1 data-[selected]:ring-line"
        >
          {o.label}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}
