import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import type {
  DynamicFieldDraft,
  DynamicMetadataState,
  PortfolioFieldDefinition,
} from "@/lib/field-definitions";

interface Props {
  /** Definitions for ONE section, already sorted by display_order. */
  definitions: PortfolioFieldDefinition[];
  state: DynamicMetadataState;
  onChange: (section: string, fieldKey: string, draft: DynamicFieldDraft) => void;
}

/**
 * Phase 4 — editable, definition-driven fields rendered inline inside the
 * normal Portfolio form. Styling matches the hard-coded sections exactly.
 * No client-specific field keys or labels are hard-coded here.
 */
export function DynamicFieldSection({ definitions, state, onChange }: Props) {
  const draftOf = (def: PortfolioFieldDefinition): DynamicFieldDraft =>
    state[def.section]?.[def.field_key] ?? { value: "" };

  const settingsOf = (def: PortfolioFieldDefinition) =>
    (def.settings ?? {}) as Record<string, unknown>;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {definitions.map((def) => {
        const draft = draftOf(def);
        const id = `dyn-${def.id}`;
        const label = <Label htmlFor={id}>{def.label_en}</Label>;

        if (def.field_type === "measurement") {
          const settings = settingsOf(def);
          const defaultUnit =
            typeof settings["default_unit"] === "string"
              ? (settings["default_unit"] as string)
              : "";
          return (
            <div key={def.id} className="space-y-1.5">
              {label}
              <div className="flex gap-2">
                <Input
                  id={id}
                  inputMode="decimal"
                  value={draft.value}
                  onChange={(e) =>
                    onChange(def.section, def.field_key, { ...draft, value: e.target.value })
                  }
                />
                <Input
                  aria-label={`${def.label_en} unit`}
                  className="max-w-[9rem]"
                  value={draft.unit ?? ""}
                  placeholder={defaultUnit || "unit"}
                  onChange={(e) =>
                    onChange(def.section, def.field_key, { ...draft, unit: e.target.value })
                  }
                />
              </div>
            </div>
          );
        }

        if (def.field_type === "textarea" || def.field_type === "long_text") {
          return (
            <div key={def.id} className="space-y-1.5 md:col-span-2">
              {label}
              <textarea
                id={id}
                rows={3}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                value={draft.value}
                onChange={(e) =>
                  onChange(def.section, def.field_key, { ...draft, value: e.target.value })
                }
              />
            </div>
          );
        }

        const inputMode =
          def.field_type === "number" || def.field_type === "year"
            ? ("numeric" as const)
            : undefined;

        return (
          <div key={def.id} className="space-y-1.5">
            {label}
            <Input
              id={id}
              inputMode={inputMode}
              value={draft.value}
              onChange={(e) =>
                onChange(def.section, def.field_key, { ...draft, value: e.target.value })
              }
            />
          </div>
        );
      })}
    </div>
  );
}
