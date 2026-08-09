import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  SECTION_TITLES,
  type DynamicFieldDraft,
  type DynamicMetadataState,
  type PortfolioFieldDefinition,
} from "@/lib/field-definitions";

interface Props {
  definitions: PortfolioFieldDefinition[];
  state: DynamicMetadataState;
  onChange: (section: string, fieldKey: string, draft: DynamicFieldDraft) => void;
  isLoading?: boolean;
  error?: unknown;
}

/**
 * Phase 3 — editable, definition-driven portfolio metadata.
 * No client-specific field keys are hard-coded here.
 */
export function DynamicFieldSection({
  definitions,
  state,
  onChange,
  isLoading,
  error,
}: Props) {
  const sections: { section: string; title: string; defs: PortfolioFieldDefinition[] }[] = [];
  for (const def of definitions) {
    let bucket = sections.find((s) => s.section === def.section);
    if (!bucket) {
      bucket = {
        section: def.section,
        title: SECTION_TITLES[def.section] ?? def.section,
        defs: [],
      };
      sections.push(bucket);
    }
    bucket.defs.push(def);
  }

  const draftOf = (def: PortfolioFieldDefinition): DynamicFieldDraft =>
    state[def.section]?.[def.field_key] ?? { value: "" };

  const settingsOf = (def: PortfolioFieldDefinition) =>
    (def.settings ?? {}) as Record<string, unknown>;

  return (
    <div className="rounded-lg border bg-card p-4">
      <h2 className="text-sm font-semibold">Dynamic Metadata</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Definition-driven project metadata. Saved with the main Save button.
      </p>

      <div className="mt-4">
        {isLoading && (
          <p className="text-sm text-muted-foreground">Loading metadata definitions…</p>
        )}

        {!!error && (
          <p className="text-sm text-destructive">
            Could not load dynamic metadata definitions.
          </p>
        )}

        {!isLoading && !error && sections.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No dynamic portfolio metadata configured for this client.
          </p>
        )}

        {!isLoading && !error && sections.length > 0 && (
          <div className="space-y-6">
            {sections.map((section) => (
              <div key={section.section}>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {section.title}
                </h3>
                <div className="mt-2 grid grid-cols-1 gap-4 md:grid-cols-2">
                  {section.defs.map((def) => {
                    const draft = draftOf(def);
                    const id = `dyn-${def.id}`;
                    const label = (
                      <Label htmlFor={id}>
                        {def.label_en}
                        {def.label_zh && (
                          <span className="ml-1 text-xs text-muted-foreground/70">
                            {def.label_zh}
                          </span>
                        )}
                      </Label>
                    );

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
                              placeholder="0"
                              onChange={(e) =>
                                onChange(def.section, def.field_key, {
                                  ...draft,
                                  value: e.target.value,
                                })
                              }
                            />
                            <Input
                              aria-label={`${def.label_en} unit`}
                              className="max-w-[9rem]"
                              value={draft.unit ?? ""}
                              placeholder={defaultUnit || "unit"}
                              onChange={(e) =>
                                onChange(def.section, def.field_key, {
                                  ...draft,
                                  unit: e.target.value,
                                })
                              }
                            />
                          </div>
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
                            onChange(def.section, def.field_key, {
                              ...draft,
                              value: e.target.value,
                            })
                          }
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
