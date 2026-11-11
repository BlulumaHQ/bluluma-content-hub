import { Link, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, LogOut } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useClientContext } from "@/contexts/ClientContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";

export function TopBar({ compactMobile = false }: { compactMobile?: boolean }) {
  const { clients, selectedClient, setSelectedClient, isLoading } = useClientContext();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);
  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
      await navigate({ to: "/login", replace: true, ignoreBlocker: true });
    } catch {
      toast.error("Unable to sign out. Please try again.");
      setSigningOut(false);
    }
  };

  return (
    <header className={`flex min-h-16 shrink-0 flex-wrap items-center justify-between gap-3 border-b bg-card px-6 py-3 ${compactMobile ? "max-md:px-4" : ""}`}>
      <div className={`flex min-w-0 flex-wrap items-center gap-3 ${compactMobile ? "max-md:hidden" : ""}`}>
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

      <div className="flex min-w-0 flex-wrap items-center gap-2 max-md:w-full">
        <div className="w-64 max-md:min-w-0 max-md:flex-1">
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
        <div className="flex min-w-0 items-center gap-2 max-md:w-full max-md:justify-end">
          <span className="max-w-48 truncate text-xs text-muted-foreground" title={user?.email}>{user?.email}</span>
          <Button size="sm" variant="ghost" onClick={handleSignOut} disabled={signingOut}>
            <LogOut className="h-4 w-4" />{signingOut ? "Signing out…" : "Sign out"}
          </Button>
        </div>
      </div>
    </header>
  );
}
