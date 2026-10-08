import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, Block, PageTitle, StatusTag } from "@/components/seer/AppShell";
import { Button } from "@/components/ui/button";
import { getSystemStatus } from "@/lib/seer/status.functions";
import { uid } from "@/lib/seer/client";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings & System Status — SEER.ai" }, { name: "description", content: "Owner settings, AI usage, model version and system health for SEER.ai." }] }),
  component: SettingsPage,
});

const fmt = (d?: string | null) => (d ? new Date(d).toLocaleString("en-GB") : "—");
type Settings = { work_depth?: string; cross_case_retrieval?: boolean; candidate_memory?: boolean };

function SettingsPage() {
  const statusFn = useServerFn(getSystemStatus);
  const status = useQuery({ queryKey: ["system-status"], queryFn: () => statusFn() });
  const runs = useQuery({
    queryKey: ["ai-usage"],
    queryFn: async () => (await supabase.from("ai_runs").select("id,stage,status,model,started_at,completed_at,usage,error").order("started_at", { ascending: false }).limit(500)).data ?? [],
  });
  const [settings, setSettings] = useState<Settings>({});
  useEffect(() => {
    (async () => {
      const id = await uid();
      const { data } = await supabase.from("profiles").select("settings").eq("id", id).maybeSingle();
      setSettings((data?.settings as Settings) ?? {});
    })();
  }, []);
  async function save(next: Settings) {
    setSettings(next);
    const id = await uid();
    const { error } = await supabase.from("profiles").update({ settings: next as never }).eq("id", id);
    if (error) toast.error(error.message); else toast.success("Settings saved.");
  }

  const r = runs.data ?? [];
  const day = Date.now() - 86_400_000;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tok = (u: any) => Number(u?.totalTokens ?? u?.total_tokens ?? (Number(u?.inputTokens ?? 0) + Number(u?.outputTokens ?? 0))) || 0;
  const last = r[0];
  const byModel = Object.entries(r.reduce<Record<string, number>>((a, x) => ((a[x.model ?? "—"] = (a[x.model ?? "—"] ?? 0) + 1), a), {}));
  const s = status.data;

  return (
    <AppShell>
      <PageTitle title="Settings & System Status" />
      <div className="grid gap-6 md:grid-cols-2">
        <section className="seer-panel space-y-4 p-4">
          <h2 className="font-semibold">Working settings</h2>
          <Block label="Work depth">
            <div className="flex gap-1">
              {["QUICK", "STANDARD", "DEEP"].map((d) => (
                <Button key={d} size="sm" variant={(settings.work_depth ?? "STANDARD") === d ? "default" : "outline"} onClick={() => save({ ...settings, work_depth: d })}>{d}</Button>
              ))}
            </div>
          </Block>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.cross_case_retrieval !== false} onChange={(e) => save({ ...settings, cross_case_retrieval: e.target.checked })} /> Use method cards from Memory in AI runs</label>
          <PasswordForm />
          <TeamAccess />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.candidate_memory !== false} onChange={(e) => save({ ...settings, candidate_memory: e.target.checked })} /> Include CANDIDATE method cards (not only canonical)</label>
        </section>

        <section className="seer-panel space-y-3 p-4">
          <div className="flex items-center justify-between"><h2 className="font-semibold">System status</h2><Button size="sm" variant="outline" onClick={() => status.refetch()}>Re-check</Button></div>
          {status.error ? <p className="text-sm text-destructive">Status check failed: {String((status.error as Error).message)}</p> : !s ? <p className="text-sm text-muted-foreground">Checking…</p> : (
            <dl className="grid grid-cols-2 gap-y-1 text-sm">
              <dt className="text-muted-foreground">App version</dt><dd>{s.appVersion}</dd>
              <dt className="text-muted-foreground">Charter version</dt><dd>{s.promptVersion}</dd>
              <dt className="text-muted-foreground">AI model</dt><dd className="font-mono text-xs">{s.model}{s.modelOverridden ? " (override)" : ""}</dd>
              <dt className="text-muted-foreground">AI service</dt><dd><StatusTag s={s.aiConfigured ? "COMPLETED" : "FAILED"} /></dd>
              <dt className="text-muted-foreground">Database</dt><dd><StatusTag s={s.db.ok ? "COMPLETED" : "FAILED"} /> {s.db.latencyMs} ms</dd>
              <dt className="text-muted-foreground">Checked</dt><dd>{fmt(s.checkedAt)}</dd>
            </dl>
          )}
          {s && (
            <Block label="Records">
              <div className="grid grid-cols-2 gap-x-4 text-xs">{Object.entries(s.counts).map(([k, v]) => <div key={k} className="flex justify-between border-b py-0.5"><span>{k}</span><span>{v ?? "error"}</span></div>)}</div>
            </Block>
          )}
        </section>

        <section className="seer-panel space-y-3 p-4 md:col-span-2">
          <h2 className="font-semibold">AI usage</h2>
          <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-5">
            <Stat k="Runs (total)" v={r.length} />
            <Stat k="Runs (24 h)" v={r.filter((x) => +new Date(x.started_at) > day).length} />
            <Stat k="Failed" v={r.filter((x) => x.status === "FAILED").length} />
            <Stat k="Tokens (total)" v={r.reduce((a, x) => a + tok(x.usage), 0).toLocaleString("en-GB")} />
            <Stat k="Models used" v={byModel.map(([m, n]) => `${m} ×${n}`).join(", ") || "—"} />
          </div>
          <Block label="Last AI run">
            {last ? <p className="text-sm"><span className="font-mono">{last.stage}</span> · <StatusTag s={last.status} /> · {last.model ?? "no model recorded"} · {fmt(last.started_at)}{last.error ? ` · ${last.error}` : ""}</p> : <p className="text-sm text-muted-foreground">No AI runs yet.</p>}
          </Block>
          <table className="w-full text-xs">
            <thead><tr className="text-left text-muted-foreground"><th>Stage</th><th>Status</th><th>Model</th><th>Tokens</th><th>Started</th></tr></thead>
            <tbody>{r.slice(0, 20).map((x) => <tr key={x.id} className="border-b"><td className="py-1 font-mono">{x.stage}</td><td><StatusTag s={x.status} /></td><td>{x.model ?? "—"}</td><td>{tok(x.usage) || "—"}</td><td>{fmt(x.started_at)}</td></tr>)}</tbody>
          </table>
        </section>
      </div>
    </AppShell>
  );
}

function Stat({ k, v }: { k: string; v: string | number }) {
  return <div className="rounded border p-2"><div className="seer-label">{k}</div><div className="text-sm font-medium break-words">{v}</div></div>;
}

function PasswordForm() {
  const [pw, setPw] = useState("");
  const [cur, setCur] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw, ...(cur ? { current_password: cur } : {}) } as never);
    setBusy(false);
    if (error) toast.error(error.message); else { toast.success("Password saved."); setPw(""); setCur(""); }
  }
  return (
    <form onSubmit={submit} className="space-y-2 border-t pt-3">
      <div className="seer-label">Email sign-in password</div>
      <input type="password" aria-label="Current password" autoComplete="current-password" placeholder="Current password (leave blank if never set)" className="w-full rounded border bg-background px-2 py-1.5 text-sm" value={cur} onChange={(e) => setCur(e.target.value)} />
      <input type="password" aria-label="New password" autoComplete="new-password" minLength={8} required placeholder="New password (8+ characters)" className="w-full rounded border bg-background px-2 py-1.5 text-sm" value={pw} onChange={(e) => setPw(e.target.value)} />
      <Button size="sm" type="submit" disabled={busy}>Set password</Button>
    </form>
  );
}
