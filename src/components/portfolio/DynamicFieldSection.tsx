import { useQuery } from "@tanstack/react-query";

import {
  buildDynamicMetadata,
  getPortfolioFieldDefinitions,
} from "@/lib/field-definitions";
import type { Client, PortfolioDetail } from "@/types";

interface Props {
  client: Pick<Client, "id" | "industry">;
  details: PortfolioDetail | null | undefined;
}

/**
 * Phase 2 read-only preview of definition-driven portfolio metadata.
 * No client-specific field keys are hard-coded here.
 */
export function DynamicFieldSection({ client, details }: Props) {
  const {
    data: definitions,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["portfolio-field-definitions", client.id, client.industry ?? null],
    queryFn: () => getPortfolioFieldDefinitions(client),
  });

  const sections = definitions ? buildDynamicMetadata(definitions, details) : [];

  return (
    <section className="rounded-lg border bg-card p-6">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground">
          Dynamic Metadata Preview
        </h2>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
          Read Only
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Internal verification of definition-driven project metadata. Not editable in this phase.
      </p>

      <div className="mt-4">
        {isLoading && (
          <p className="text-sm text-muted-foreground">Loading metadata definitions…</p>
        )}

        {error && (
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
                <dl className="mt-2 divide-y rounded-md border">
                  {section.fields.map((field) => (
                    <div
                      key={field.definition.id}
                      className="grid grid-cols-1 gap-1 px-3 py-2 sm:grid-cols-3 sm:gap-4"
                    >
                      <dt className="text-sm text-muted-foreground">
                        {field.label}
                        {field.labelZh && (
                          <span className="ml-1 text-xs text-muted-foreground/70">
                            {field.labelZh}
                          </span>
                        )}
                      </dt>
                      <dd className="text-sm font-medium text-foreground sm:col-span-2">
                        {field.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
