import { useClientContext } from "@/contexts/ClientContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function TopBar() {
  const { clients, selectedClient, setSelectedClient, isLoading } = useClientContext();

  return (
    <header className="flex h-14 items-center justify-between border-b bg-card px-6">
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">Currently Managing</span>
        <span className="text-sm font-medium text-foreground">
          {isLoading ? "Loading..." : selectedClient?.client_name ?? "No client selected"}
        </span>
      </div>

      <div className="w-64">
        <Select
          value={selectedClient?.id ?? ""}
          onValueChange={(value) => {
            const client = clients.find((c) => c.id === value);
            if (client) setSelectedClient(client);
          }}
          disabled={isLoading || clients.length === 0}
        >
          <SelectTrigger className="h-9 text-sm">
            <SelectValue placeholder="Select a client" />
          </SelectTrigger>
          <SelectContent>
            {clients.map((client) => (
              <SelectItem key={client.id} value={client.id}>
                {client.client_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </header>
  );
}
