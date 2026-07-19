import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";

import type { PortfolioItem, Client } from "@/types";
import { PortfolioCard } from "@/components/portfolio/PortfolioCard";

interface Props {
  item: PortfolioItem;
  client: Client;
  onDelete: (id: string) => void;
  onEdited: () => void;
  selected?: boolean;
  onToggleSelect?: (id: string, next: boolean) => void;
  disabled?: boolean;
}

export function SortablePortfolioCard(props: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.item.id,
    disabled: props.disabled,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 20 : "auto",
  };

  const handle = (
    <button
      type="button"
      ref={setNodeRef as unknown as React.Ref<HTMLButtonElement>}
      {...attributes}
      {...listeners}
      aria-label={`Drag to reorder ${props.item.title}`}
      className="absolute left-2 top-2 z-20 flex h-8 w-8 cursor-grab items-center justify-center rounded-md bg-background/90 text-muted-foreground shadow hover:text-foreground active:cursor-grabbing touch-none"
      onClick={(e) => e.preventDefault()}
    >
      <GripVertical className="h-4 w-4" />
    </button>
  );

  return (
    <div style={style} className="relative">
      {handle}
      <PortfolioCard
        item={props.item}
        client={props.client}
        onDelete={props.onDelete}
        onEdited={props.onEdited}
        selected={props.selected}
        onToggleSelect={props.onToggleSelect}
      />
    </div>
  );
}
