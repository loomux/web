import { ComboBox, Input, Label, ListBox, ListBoxItem, Popover, useFilter, Button as AriaButton } from "react-aria-components";
import type { RouterModels } from "../lib/api";
import { Button } from "../ui/Button";
import type { ModelList } from "./useModelList";

// The model field (LOOM-191): a combobox over the models the provider
// lists, filtered as you type. Free text is still a model: some
// endpoints don't list theirs.

function listNote(list: ModelList) {
  switch (list.state) {
    case "loading":
      return "Loading the provider's models…";
    case "failed":
      return `Couldn't list models: ${list.error}. You can still type one.`;
    case "ready":
      return list.models.length === 0 ? "This endpoint lists no models; type the name." : `${list.models.length} models listed. Type to filter, or enter any name.`;
    default:
      return list.hint ?? "";
  }
}

export function ModelField({
  value,
  onChange,
  list,
  inputClassName,
  canList,
  onList,
}: {
  value: string;
  onChange: (v: string) => void;
  list: ModelList;
  inputClassName: string;
  // List models: only on request for a key being typed, never by itself.
  canList: boolean;
  onList: () => void;
}) {
  const { contains } = useFilter({ sensitivity: "base" });
  const models = list.state === "ready" ? list.models : [];
  const note = listNote(list);
  return (
    <div className="flex flex-col gap-1">
      <ComboBox
        allowsCustomValue
        menuTrigger="input"
        inputValue={value}
        onInputChange={onChange}
        onSelectionChange={(key) => key !== null && onChange(String(key))}
        defaultItems={models}
        defaultFilter={contains}
        className="flex flex-col gap-1"
      >
        <Label className="font-bold text-ink">Model</Label>
        <div className="relative">
          <Input className={`${inputClassName} pr-11 font-mono`} spellCheck={false} />
          <AriaButton
            aria-label="Show models"
            className="absolute inset-y-0 right-0 grid w-11 place-items-center text-ink-2 data-[disabled]:opacity-40"
            isDisabled={models.length === 0}
          >
            <span aria-hidden="true">▾</span>
          </AriaButton>
        </div>
        <Popover className="max-h-72 w-(--trigger-width) overflow-auto rounded-control border border-line bg-surface shadow-2">
          <ListBox className="py-1 outline-none">
            {(m: RouterModels["models"][number]) => (
              <ListBoxItem
                id={m.id}
                textValue={m.id}
                className="cursor-default px-3 py-2 font-mono text-sm text-ink outline-none data-[focused]:bg-surface-2"
              >
                {m.id}
                {m.name && m.name !== m.id && <span className="ml-2 font-sans text-ink-3">{m.name}</span>}
              </ListBoxItem>
            )}
          </ListBox>
        </Popover>
      </ComboBox>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {note && (
          <p className={`text-sm ${list.state === "failed" ? "text-bad" : "text-ink-3"}`} aria-live="polite">
            {note}
          </p>
        )}
        {canList && (
          <Button size="sm" variant="quiet" isPending={list.state === "loading"} pendingLabel="Listing…" onPress={onList}>
            List models
          </Button>
        )}
      </div>
    </div>
  );
}
