import { useState, type FormEvent } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { authErrorMessage, MIN_PASSWORD_LENGTH, validateNewPassword } from "@/lib/cms-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [
    { title: "Sign In — Bluluma CMS Admin" },
    { name: "description", content: "Administrator sign-in for Bluluma CMS." },
    { property: "og:title", content: "Sign In — Bluluma CMS Admin" },
    { property: "og:description", content: "Administrator sign-in for Bluluma CMS." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: LoginPage,
});

function LoginPage() {
  const { signIn, signOut, error: accessError, clearError } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState("signin");
  const [forgot, setForgot] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const signup = tab === "signup";
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError(null); setMessage(null); clearError();
    if (signup && !forgot) {
      const validation = validateNewPassword(password, confirmation);
      if (validation) { setError(validation); return; }
    }
    setBusy(true);
    try {
      if (forgot) {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/reset-password` });
        if (resetError) throw resetError;
        setMessage("If an account exists for this email, a password reset link has been sent.");
      } else if (signup) {
        const { data, error: signupError } = await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: window.location.origin } });
        if (signupError) throw signupError;
        // Signup never grants CMS access, including projects that return a session.
        if (data.session) await signOut();
        setPassword(""); setConfirmation("");
        setMessage("Account created. You can sign in now.");
      } else {
        const result = await signIn(email.trim(), password);
        if (result.error) setError(result.error);
        else await navigate({ to: "/", replace: true });
      }
    } catch (failure) {
      setError(authErrorMessage(failure && typeof failure === "object" && "message" in failure ? String(failure.message) : "Unable to connect. Please try again."));
    } finally { setBusy(false); }
  }
  return <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-8">
    <div className="w-full max-w-sm rounded-lg border bg-card p-7 shadow-sm">
      <h1 className="text-2xl font-bold text-foreground">Bluluma CMS Admin</h1>
      <Tabs value={tab} onValueChange={(value) => { setTab(value); setForgot(false); setError(null); setMessage(null); clearError(); setPassword(""); setConfirmation(""); }} className="mt-6">
        <TabsList className="grid w-full grid-cols-2"><TabsTrigger value="signin" disabled={busy}>Sign in</TabsTrigger><TabsTrigger value="signup" disabled={busy}>Create account</TabsTrigger></TabsList>
      </Tabs>
      {forgot && <h2 className="mt-5 font-semibold">Reset your password</h2>}
      <form onSubmit={submit} className="mt-5 space-y-4">
        <div className="space-y-1.5"><Label htmlFor="email">Email</Label><Input id="email" type="email" autoComplete="email" required value={email} disabled={busy} onChange={(event) => setEmail(event.target.value)} /></div>
        {!forgot && <div className="space-y-1.5"><Label htmlFor="password">Password</Label><Input id="password" type="password" autoComplete={signup ? "new-password" : "current-password"} minLength={signup ? MIN_PASSWORD_LENGTH : undefined} required value={password} disabled={busy} onChange={(event) => setPassword(event.target.value)} /></div>}
        {signup && !forgot && <div className="space-y-1.5"><Label htmlFor="confirm-password">Confirm password</Label><Input id="confirm-password" type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} required value={confirmation} disabled={busy} onChange={(event) => setConfirmation(event.target.value)} /></div>}
        {(error || accessError) && <p role="alert" className="break-words text-sm text-destructive">{error || accessError}</p>}
        {message && <p role="status" className="break-words text-sm text-foreground">{message}</p>}
        <Button type="submit" className="w-full" disabled={busy}>{busy ? "Please wait…" : forgot ? "Send reset link" : signup ? "Create account" : "Sign in"}</Button>
        {!signup && <Button type="button" variant="link" className="h-auto px-0" disabled={busy} onClick={() => { setForgot(!forgot); setError(null); setMessage(null); clearError(); }}>{forgot ? "Back to sign in" : "Forgot password?"}</Button>}
      </form>
    </div>
  </div>;
}