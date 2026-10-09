import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BrandLogo } from "@/components/seer/BrandIdentity";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Set a new password — SEER.ai" },
      { name: "description", content: "Set a new password for your SEER.ai account." },
      { property: "og:title", content: "Set a new password — SEER.ai" },
      { property: "og:description", content: "Password reset for SEER.ai." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPage,
});

function ResetPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((e) => { if (e === "PASSWORD_RECOVERY" || e === "SIGNED_IN") setReady(true); });
    supabase.auth.getSession().then(({ data: d }) => d.session && setReady(true));
    return () => data.subscription.unsubscribe();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pw !== pw2) { toast.error("Passwords do not match."); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Password set. You can now sign in with email and password.");
    navigate({ to: "/home" });
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="seer-panel w-full max-w-sm p-6">
        <BrandLogo className="mb-4 h-16" />
        <div className="seer-label mb-2 text-primary">SEER.ai · Base Pairing</div>
        <h1 className="mb-4 text-xl font-semibold tracking-tight">Set a new password</h1>
        {!ready ? (
          <p className="text-sm text-muted-foreground">Open this page from the reset link in your email.</p>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <div className="space-y-1"><Label htmlFor="np">New password</Label><Input id="np" type="password" autoComplete="new-password" minLength={8} required value={pw} onChange={(e) => setPw(e.target.value)} /></div>
            <div className="space-y-1"><Label htmlFor="np2">Confirm password</Label><Input id="np2" type="password" autoComplete="new-password" minLength={8} required value={pw2} onChange={(e) => setPw2(e.target.value)} /></div>
            <Button type="submit" className="w-full" disabled={busy}>Save password</Button>
          </form>
        )}
      </div>
    </div>
  );
}
