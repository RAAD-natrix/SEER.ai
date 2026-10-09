import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, StatusTag } from "@/components/seer/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { audit } from "@/lib/seer/client";
import { BasePairingIdentity } from "@/components/seer/BrandIdentity";

export const Route = createFileRoute("/_authenticated/home")({
  head: () => ({ meta: [{ title: "Base Pairing — SEER.ai" }, { name: "description", content: "Claudian Navin Stanislaus's second mind for strategic judgement, live cases and decision-ready work." }, { property: "og:title", content: "Base Pairing — SEER.ai" }, { property: "og:description", content: "Claudian Navin Stanislaus's second mind for strategic judgement." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Home,
});

const MODES = [
  { to: "/think", label: "THINK", line: "Teach SEER how I think from work I have already done." },
  { to: "/work", label: "WORK", line: "Take a live brief from question to decision and deliverable." },
  { to: "/openmind", label: "OPEN MIND", line: "Explore ideas and evidence that do not yet belong to a job." },
] as const;

function Home() {
  const { data: profile, isLoading } = useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const { data } = await supabase.from("profiles").select("*").eq("id", u.user.id).single();
      return data;
    },
  });
  const { data: cases } = useQuery({
    queryKey: ["cases-home"],
    queryFn: async () => (await supabase.from("cases").select("id,title,client,stage,status,updated_at").is("deleted_at", null).order("updated_at", { ascending: false }).limit(6)).data ?? [],
  });

  if (isLoading) return <AppShell><p className="text-sm text-muted-foreground">Loading…</p></AppShell>;
  if (profile && !profile.onboarded) return <AppShell><Onboarding profile={profile} /></AppShell>;

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl">
        <BasePairingIdentity />
        <div className="mb-5 mt-7 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-medium">Good to see you{profile?.display_name ? `, ${profile.display_name}` : ""}.</h2>
          <span className="seer-label">{profile?.workspace_name || "Workspace"}</span>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {MODES.map((m) => (
            <Link key={m.to} to={m.to} className="seer-panel block p-5 hover:border-primary">
              <div className="font-mono text-sm tracking-wider text-primary">{m.label}</div>
              <p className="mt-2 text-sm text-muted-foreground">{m.line}</p>
            </Link>
          ))}
        </div>
        <div className="mt-10">
          <div className="seer-label mb-2">Recent cases</div>
          {cases?.length ? (
            <div className="seer-panel divide-y">
              {cases.map((c) => (
                <Link key={c.id} to="/work/$caseId" params={{ caseId: c.id }} className="flex items-center justify-between px-4 py-3 hover:bg-secondary">
                  <div>
                    <div className="text-sm font-medium">{c.title}</div>
                    <div className="text-xs text-muted-foreground">{c.client || "—"}</div>
                  </div>
                  <StatusTag s={c.stage} />
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No cases yet. Start one in WORK.</p>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function Onboarding({ profile }: { profile: { id: string; display_name: string | null; workspace_name: string | null; language: string } }) {
  const qc = useQueryClient();
  const [name, setName] = useState(profile.display_name ?? "");
  const [ws, setWs] = useState(profile.workspace_name ?? "");
  const [lang, setLang] = useState(profile.language || "en-GB");
  const [ack, setAck] = useState(false);
  const [saving, setSaving] = useState(false);
  return (
    <div className="mx-auto max-w-xl">
      <div className="seer-label">First run</div>
      <h1 className="mb-6 text-xl font-semibold">Owner onboarding</h1>
      <div className="seer-panel space-y-4 p-5">
        <div className="space-y-1"><Label htmlFor="dn">Display name</Label><Input id="dn" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="ws">Workspace name</Label><Input id="ws" value={ws} onChange={(e) => setWs(e.target.value)} /></div>
        <div className="space-y-1">
          <Label htmlFor="lg">Default language</Label>
          <select id="lg" className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={lang} onChange={(e) => setLang(e.target.value)}>
            <option value="en-GB">British English</option>
            <option value="en-MY">Malaysian English</option>
          </select>
        </div>
        <div className="rounded border p-3 text-sm">
          <div className="seer-label mb-1">Data-isolation principle</div>
          <p className="text-muted-foreground">
            Raw case content never influences another case. THINK learns only decontextualised METHOD CARDS that pass a contamination scan and your review.
            Research stays inside its case. Nothing becomes canonical without your explicit confirmation.
          </p>
          <label className="mt-3 flex items-center gap-2"><Checkbox checked={ack} onCheckedChange={(v) => setAck(!!v)} /> I have reviewed this principle.</label>
        </div>
        <Button
          disabled={!ack || !name || !ws || saving}
          onClick={async () => {
            setSaving(true);
            await supabase.from("profiles").update({ display_name: name, workspace_name: ws, language: lang, onboarded: true }).eq("id", profile.id);
            await audit("ONBOARDING_COMPLETED", "profile", profile.id, { language: lang });
            qc.invalidateQueries({ queryKey: ["profile"] });
          }}
        >
          Finish onboarding
        </Button>
      </div>
    </div>
  );
}
