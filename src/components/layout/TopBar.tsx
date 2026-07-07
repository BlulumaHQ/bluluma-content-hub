import { Link, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, LogOut } from "lucide-react";
import { useClientContext } from "@/contexts/ClientContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";

export function TopBar() {
  const { clients, selectedClient, setSelectedClient, isLoading } = useClientContext();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/login", replace: true });
  };

  return (
    <header className="flex h-16 items-center justify-between border-b bg-card px-6">
      <div className="flex items-center gap-3">
        {selectedClient ? (
          <>
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              Currently Managing
            </span>
            <span className="text-lg font-bold text-foreground">
              {selectedClient.client_name}
            </span>
            {selectedClient.status && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                {selectedClient.status}
              </span>
            )}
          </>
        ) : (
          <span className="inline-flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-semibold text-amber-800">
            <AlertTriangle className="h-4 w-4" />
            No client selected — pick a client to manage content
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
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
              <SelectValue placeholder={isLoading ? "Loading..." : "Select a client"} />
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
        <Link to="/clients/new">
          <Button size="sm" variant="outline">
            + New Client
          </Button>
        </Link>
      </div>
    </header>
  );
}
