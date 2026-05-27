import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import type { Client } from "@/types";

const STORAGE_KEY = "bluluma.selectedClientId";

interface ClientContextValue {
  clients: Client[];
  selectedClient: Client | null;
  setSelectedClient: (client: Client | null) => void;
  isLoading: boolean;
  error: string | null;
  refreshClients: () => Promise<void>;
}

const ClientContext = createContext<ClientContextValue | undefined>(undefined);

export function ClientProvider({ children }: { children: ReactNode }) {
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClient, setSelectedClientState] = useState<Client | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const persist = (client: Client | null) => {
    if (typeof window === "undefined") return;
    if (client) window.localStorage.setItem(STORAGE_KEY, client.id);
    else window.localStorage.removeItem(STORAGE_KEY);
  };

  const setSelectedClient = useCallback((client: Client | null) => {
    setSelectedClientState(client);
    persist(client);
  }, []);

  const loadClients = useCallback(async () => {
    try {
      setIsLoading(true);
      const { data, error: dbError } = await supabase
        .from("clients")
        .select("*")
        .order("client_name", { ascending: true });
      if (dbError) throw dbError;

      const list = (data as Client[]) ?? [];
      setClients(list);

      const storedId =
        typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
      const stored = storedId ? list.find((c) => c.id === storedId) : null;

      if (stored) {
        setSelectedClientState(stored);
      } else {
        if (storedId) persist(null); // stored client no longer exists
        setSelectedClientState(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load clients");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  return (
    <ClientContext.Provider
      value={{
        clients,
        selectedClient,
        setSelectedClient,
        isLoading,
        error,
        refreshClients: loadClients,
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
