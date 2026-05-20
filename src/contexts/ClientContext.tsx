import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import type { Client } from "@/types";

interface ClientContextValue {
  clients: Client[];
  selectedClient: Client | null;
  setSelectedClient: (client: Client | null) => void;
  isLoading: boolean;
  error: string | null;
}

const ClientContext = createContext<ClientContextValue | undefined>(undefined);

export function ClientProvider({ children }: { children: ReactNode }) {
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchClients() {
      try {
        const { data, error: dbError } = await supabase
          .from("clients")
          .select("*")
          .order("client_name", { ascending: true });

        if (dbError) throw dbError;

        const list = (data as Client[]) ?? [];
        setClients(list);

        if (list.length === 1) {
          setSelectedClient(list[0]);
        } else if (list.length > 1) {
          const active = list.find((c) => c.status === "active" || c.is_active === true);
          setSelectedClient(active ?? list[0]);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load clients");
      } finally {
        setIsLoading(false);
      }
    }

    fetchClients();
  }, []);

  const handleSelect = useCallback((client: Client | null) => {
    setSelectedClient(client);
  }, []);

  return (
    <ClientContext.Provider
      value={{
        clients,
        selectedClient,
        setSelectedClient: handleSelect,
        isLoading,
        error,
      }}
    >
      {children}
    </ClientContext.Provider>
  );
}

export function useClientContext() {
  const ctx = useContext(ClientContext);
  if (!ctx) throw new Error("useClientContext must be used within ClientProvider");
  return ctx;
}
