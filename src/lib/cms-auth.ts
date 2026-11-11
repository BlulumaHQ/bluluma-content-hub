import type { Session, SupabaseClient } from "@supabase/supabase-js";

export const MIN_PASSWORD_LENGTH = 10;
export function validateNewPassword(password: string, confirmation: string) {
  if (password.length < MIN_PASSWORD_LENGTH) return "Password must contain at least 10 characters.";
  if (password !== confirmation) return "Passwords do not match.";
  return null;
}
export function authErrorMessage(message: string) {
  if (/email not confirmed/i.test(message)) return "Your account is waiting for approval.";
  if (/invalid.*(credential|password)|invalid login/i.test(message)) return "Invalid email or password.";
  return message;
}

export interface CmsAuthState {
  session: Session | null;
  isAdmin: boolean;
  isLoading: boolean;
  isRecovery: boolean;
  error: string | null;
}

// One controller per router: credentials persist in the existing client's storage,
// but authorization always comes from getUser() and the database RPC.
export function createCmsAuth(client: SupabaseClient, clearQueries: () => Promise<void>) {
  let state: CmsAuthState = { session: null, isAdmin: false, isLoading: true, isRecovery: false, error: null };
  const listeners = new Set<() => void>();
  let pending: Promise<boolean> | undefined;
  let generation = 0;
  const publish = (next: Partial<CmsAuthState>) => {
    state = { ...state, ...next };
    listeners.forEach((listener) => listener());
  };
  const signOut = async () => {
    generation++;
    publish({ session: null, isAdmin: false, isLoading: true, isRecovery: false });
    await clearQueries();
    const { error } = await client.auth.signOut();
    // Local credentials must be cleared even if the remote logout is unavailable.
    if (error) await client.auth.signOut({ scope: "local" });
    publish({ isLoading: false });
  };
  const verifyAdmin = (): Promise<boolean> => {
    if (pending) return pending;
    const current = generation;
    publish({ isLoading: true });
    pending = (async () => {
      try {
        const { data: userData, error: userError } = await client.auth.getUser();
        if (current !== generation) return false;
        if (userError || !userData.user) {
          publish({ session: null, isAdmin: false, isLoading: false });
          return false;
        }
        const { data, error } = await client.rpc("is_admin");
        if (current !== generation) return false;
        if (error || data !== true) {
          const message = error ? "Unable to verify administrator access. Please try again." : "This account doesn't have access.";
          await signOut();
          publish({ error: message });
          return false;
        }
        const { data: sessionData, error: sessionError } = await client.auth.getSession();
        if (current !== generation) return false;
        if (sessionError || !sessionData.session || sessionData.session.user.id !== userData.user.id) {
          await signOut();
          return false;
        }
        publish({ session: sessionData.session, isAdmin: true, isLoading: false, error: null });
        return true;
      } catch {
        if (current === generation) {
          await signOut();
          publish({ error: "Unable to verify administrator access. Please try again." });
        }
        return false;
      }
    })().finally(() => { pending = undefined; });
    return pending;
  };
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    verifyAdmin,
    signOut,
    clearError: () => publish({ error: null }),
    start: (identityChanged: (signedOut: boolean) => void) => {
      const recovery = window.location.pathname === "/reset-password";
      if (recovery && /(?:^#|&)type=recovery(?:&|$)/.test(window.location.hash)) {
        window.sessionStorage.setItem("bluluma.cms.recovery", "true");
      }
      const { data } = client.auth.onAuthStateChange((event, session) => {
        if (event === "PASSWORD_RECOVERY") {
          generation++;
          window.sessionStorage.setItem("bluluma.cms.recovery", "true");
          publish({ session, isAdmin: false, isRecovery: true, isLoading: false });
          return;
        }
        if (event === "SIGNED_OUT") {
          generation++;
          window.sessionStorage.removeItem("bluluma.cms.recovery");
          publish({ session: null, isAdmin: false, isRecovery: false, isLoading: false });
          void clearQueries().then(() => identityChanged(true));
          return;
        }
        if (event !== "INITIAL_SESSION" && event !== "SIGNED_IN" && event !== "USER_UPDATED") return;
        // Never await Auth calls inside its own state-change callback.
        queueMicrotask(async () => {
          if (window.location.pathname === "/reset-password") {
            const { data: userData } = await client.auth.getUser();
            publish({ session, isRecovery: Boolean(userData.user && session && window.sessionStorage.getItem("bluluma.cms.recovery") === "true"), isLoading: false });
          } else {
            await verifyAdmin();
            if (event !== "INITIAL_SESSION") identityChanged(false);
          }
        });
      });
      return () => data.subscription.unsubscribe();
    },
    signIn: async (email: string, password: string) => {
      publish({ error: null });
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error) return { error: authErrorMessage(error.message) };
      const allowed = await verifyAdmin();
      return { error: allowed ? null : state.error ?? "Unable to sign in. Please try again." };
    },
  };
}
export type CmsAuth = ReturnType<typeof createCmsAuth>;