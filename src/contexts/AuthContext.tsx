import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import type { CmsAuth, CmsAuthState } from "@/lib/cms-auth";

type AuthContextValue = CmsAuthState & Pick<CmsAuth, "signIn" | "signOut" | "clearError"> & { user: User | null };
const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ auth, children }: { auth: CmsAuth; children: ReactNode }) {
  const state = useSyncExternalStore(auth.subscribe, auth.getSnapshot, auth.getSnapshot);
  return <AuthContext.Provider value={{ ...state, user: state.session?.user ?? null, signIn: auth.signIn, signOut: auth.signOut, clearError: auth.clearError }}>{children}</AuthContext.Provider>;
}
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
