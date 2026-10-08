import { Switch as AriaSwitch } from "react-aria-components";

// An on/off setting, with its label and a line saying what "on" means.
export function Switch({
  label,
  description,
  isSelected,
  onChange,
}: {
  label: string;
  description?: string;
  isSelected: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <AriaSwitch isSelected={isSelected} onChange={onChange} className="group flex min-h-11 cursor-pointer items-start gap-3">
      <span
        aria-hidden="true"
        className="mt-0.5 flex h-6 w-10 shrink-0 items-center rounded-full bg-line px-0.5 transition-colors group-data-[selected]:bg-accent group-data-[focus-visible]:outline-2 group-data-[focus-visible]:outline-offset-2 group-data-[focus-visible]:outline-focus"
      >
        <span className="size-5 rounded-full bg-surface shadow-1 transition-transform group-data-[selected]:translate-x-4" />
      </span>
      <span className="flex flex-col">
        <span className="font-bold text-ink">{label}</span>
        {description && <span className="text-sm text-ink-2">{description}</span>}
      </span>
    </AriaSwitch>
  );
}
