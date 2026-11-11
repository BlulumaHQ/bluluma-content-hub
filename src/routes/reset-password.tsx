import { useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { MIN_PASSWORD_LENGTH, validateNewPassword } from "@/lib/cms-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [
    { title: "Reset Password — Bluluma CMS Admin" },
    { name: "description", content: "Set a new password for your Bluluma CMS account." },
    { property: "og:title", content: "Reset Password — Bluluma CMS Admin" },
    { property: "og:description", content: "Set a new password for your Bluluma CMS account." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: ResetPasswordPage,
});
function ResetPasswordPage() {
  const { isRecovery, isLoading, signOut } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !isRecovery) return;
    const validation = validateNewPassword(password, confirmation);
    if (validation) { setError(validation); return; }
    setError(null); setBusy(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      await signOut();
      setDone(true); setPassword(""); setConfirmation("");
    } catch (failure) {
      setError(failure && typeof failure === "object" && "message" in failure ? String(failure.message) : "Unable to reset password. Please try again.");
    } finally { setBusy(false); }
  }
  return <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-8"><div className="w-full max-w-sm rounded-lg border bg-card p-7 shadow-sm">
    <h1 className="text-2xl font-bold text-foreground">Reset password</h1>
    {done ? <p role="status" className="mt-5 text-sm">Password updated. You can sign in now.</p> : isLoading ? <p role="status" className="mt-5 text-sm text-muted-foreground">Checking reset link…</p> : !isRecovery ? <p role="alert" className="mt-5 text-sm text-destructive">This reset link is invalid or expired. Request a new link from the login page.</p> : <form onSubmit={submit} className="mt-5 space-y-4">
      <div className="space-y-1.5"><Label htmlFor="new-password">New password</Label><Input id="new-password" type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} required value={password} disabled={busy} onChange={(event) => setPassword(event.target.value)} /></div>
      <div className="space-y-1.5"><Label htmlFor="confirm-password">Confirm password</Label><Input id="confirm-password" type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} required value={confirmation} disabled={busy} onChange={(event) => setConfirmation(event.target.value)} /></div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button className="w-full" disabled={busy}>{busy ? "Updating…" : "Update password"}</Button>
    </form>}
    <Button asChild variant="link" className="mt-4 px-0"><Link to="/login">Back to sign in</Link></Button>
  </div></div>;
}