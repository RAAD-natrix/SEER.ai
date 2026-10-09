import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BrandLogo } from "@/components/seer/BrandIdentity";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — SEER.ai" },
      { name: "description", content: "Owner sign-in for SEER.ai, a private, invite-only strategic workbench." },
      { property: "og:title", content: "Sign in — SEER.ai" },
      { property: "og:description", content: "Private, invite-only access." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): { next?: string | undefined } => ({
    next: typeof s["next"] === "string" && s["next"].startsWith("/") && !s["next"].startsWith("//") ? (s["next"] as string) : undefined,
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  const go = () => (next ? window.location.assign(next) : navigate({ to: "/home" }));
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => data.session && go());
    const { data } = supabase.auth.onAuthStateChange((_e, s) => s && go());
    return () => data.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, next]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "in") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}${next ?? "/home"}` } });
        if (error) throw error;
        if (!data.session) toast.success("Check your email to confirm the owner account.");
      }
    } catch (err) {
      const m = err instanceof Error ? err.message : "Sign-in failed";
      toast.error(/database error/i.test(m) ? "SEER.ai is private and invite-only. Sign-up is closed." : m);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 border-b pb-7">
          <BrandLogo className="mb-5 h-24" />
          <div className="seer-label text-primary">Base Pairing</div>
          <h1 className="mt-2 text-4xl font-semibold">SEER.ai</h1>
          <p className="mt-2 text-base">Second mind. Symbiote.</p>
          <p className="mt-1 text-xs text-muted-foreground">Strategic Judgement Engine</p>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="pw">Password</Label>
            <Input id="pw" type="password" autoComplete={mode === "in" ? "current-password" : "new-password"} minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {mode === "in" ? "Sign in" : "Create owner account"}
          </Button>
        </form>
        <Button
          variant="outline"
          className="mt-3 w-full"
          onClick={async () => {
            const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: next ? window.location.origin + next : window.location.origin });
            if (r.error) toast.error(r.error.message ?? "Google sign-in failed");
          }}
        >
          Continue with Google
        </Button>
        {mode === "in" && (
          <Button variant="link"
            className="mt-3 h-auto w-full whitespace-normal text-center text-xs text-muted-foreground hover:text-foreground"
            onClick={async () => {
              if (!email) { toast.error("Enter your email first."); return; }
              const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
              if (error) toast.error(error.message); else toast.success("Password link sent. Check your email.");
            }}
          >
            Forgot or never set a password? Email me a link
          </Button>
        )}
        <Button variant="link" className="mt-2 h-auto w-full whitespace-normal text-center text-xs text-muted-foreground hover:text-foreground" onClick={() => setMode(mode === "in" ? "up" : "in")}>
          {mode === "in" ? "First run? Create the owner account" : "Have an account? Sign in"}
        </Button>
        <p className="mt-8 border-t pt-4 text-xs text-muted-foreground">Claudian Navin Stanislaus<br /><span className="mt-1 block text-primary">Judgement — not noise.</span></p>
      </div>
    </div>
  );
}
