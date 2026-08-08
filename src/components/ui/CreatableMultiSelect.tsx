import { useMemo, useState, type KeyboardEvent } from "react";
import { X, Plus } from "lucide-react";

interface CreatableMultiSelectProps {
  values: string[];
  options: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
}

/** Creatable multi-select: pick from suggestions or type a custom value. */
export function CreatableMultiSelect({
  values,
  options,
  onChange,
  placeholder = "Type a custom value and press Enter",
}: CreatableMultiSelectProps) {
  const [input, setInput] = useState("");
  const selected = Array.isArray(values) ? values : [];

  const available = useMemo(
    () => options.filter((o) => !selected.some((v) => v.toLowerCase() === o.toLowerCase())),
    [options, selected],
  );

  const add = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    if (selected.some((v) => v.toLowerCase() === trimmed.toLowerCase())) return;
    onChange([...selected, trimmed]);
  };

  const remove = (value: string) => onChange(selected.filter((v) => v !== value));

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      add(input);
      setInput("");
    }
  };

  return (
    <div className="space-y-2">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((v) => (
            <span
              key={v}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
            >
              {v}
              <button
                type="button"
                aria-label={`Remove ${v}`}
                onClick={() => remove(v)}
                className="rounded-full p-0.5 hover:bg-primary/20"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      />

      {available.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {available.map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => add(o)}
              className="inline-flex items-center gap-1 rounded-full border border-input px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            >
              <Plus className="h-3 w-3" />
              {o}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
