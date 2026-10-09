import { createFileRoute, Link, Outlet, useNavigate, useMatchRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, StatusTag } from "@/components/seer/AppShell";
import { WorkbenchIdentity } from "@/components/seer/BrandIdentity";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { audit, uid } from "@/lib/seer/client";

export const Route = createFileRoute("/_authenticated/work")({
  head: () => ({ meta: [{ title: "Work — SEER.ai" }, { name: "description", content: "Live strategy cases." }, { property: "og:title", content: "Work — SEER.ai" }, { property: "og:description", content: "Live strategy cases." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: WorkLayout,
});

function WorkLayout() {
  const match = useMatchRoute();
  if (match({ to: "/work/$caseId", fuzzy: true })) return <Outlet />;
  return <CaseList />;
}

function CaseList() {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [client, setClient] = useState("");
  const [mode, setMode] = useState("CLIENT WORK");
  const cases = useQuery({
    queryKey: ["cases"],
    queryFn: async () => (await supabase.from("cases").select("id,title,client,stage,status,engagement_mode,updated_at").is("deleted_at", null).order("updated_at", { ascending: false })).data ?? [],
  });

  async function create() {
    if (!title.trim()) return;
    const owner = await uid();
    const { data, error } = await supabase.from("cases").insert({ owner_id: owner, title: title.trim(), client: client.trim() || null, engagement_mode: mode }).select("id").single();
    if (error) { toast.error(error.message); return; }
    await audit("CASE_CREATED", "case", data.id);
    navigate({ to: "/work/$caseId", params: { caseId: data.id } });
  }

  return (
    <AppShell>
      <WorkbenchIdentity area="WORK" title="Take a live brief from question to decision" />
      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <div className="seer-panel space-y-3 p-4">
          <div className="seer-label">New case</div>
          <div className="space-y-1"><Label htmlFor="ct">Project title</Label><Input id="ct" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="cc">Client / organisation</Label><Input id="cc" value={client} onChange={(e) => setClient(e.target.value)} /></div>
          <div className="space-y-1">
            <Label htmlFor="cm">Engagement mode</Label>
            <select id="cm" className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={mode} onChange={(e) => setMode(e.target.value)}>
              <option>CLIENT WORK</option><option>OWN WORK</option>
            </select>
          </div>
          <Button className="w-full" disabled={!title.trim()} onClick={create}>Create case</Button>
        </div>
        <div className="seer-panel divide-y">
          {cases.data?.length ? cases.data.map((c) => (
            <Link key={c.id} to="/work/$caseId" params={{ caseId: c.id }} className="flex items-center justify-between px-4 py-3 hover:bg-secondary">
              <div><div className="text-sm font-medium">{c.title}</div><div className="text-xs text-muted-foreground">{c.client || "—"} · {c.engagement_mode}</div></div>
              <StatusTag s={c.stage} />
            </Link>
          )) : <p className="p-4 text-sm text-muted-foreground">No cases yet.</p>}
        </div>
      </div>
    </AppShell>
  );
}
