import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/seer/AppShell";
import { WorkbenchIdentity } from "@/components/seer/BrandIdentity";
import { Button } from "@/components/ui/button";
import { createChatThread, deleteChatThread, listChatThreads } from "@/lib/seer/chat.functions";

export const Route = createFileRoute("/_authenticated/work/$caseId/ask")({
  head: () => ({ meta: [{ title: "Ask SEER — SEER.ai" }, { name: "description", content: "Question SEER about a case: its evidence, contradictions, alternatives and current judgement." }, { property: "og:title", content: "Ask SEER — SEER.ai" }, { property: "og:description", content: "Question SEER about a case: its evidence, contradictions, alternatives and current judgement." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: AskIndexPage,
});

function AskIndexPage() {
  const { caseId } = Route.useParams();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const kase = useQuery({
    queryKey: ["case", caseId],
    queryFn: async () => (await supabase.from("cases").select("id,title,client").eq("id", caseId).single()).data,
  });
  const threads = useQuery({
    queryKey: ["chat-threads", caseId],
    queryFn: () => listChatThreads({ data: { caseId } }),
  });

  async function newThread() {
    setBusy(true);
    try {
      const t = await createChatThread({ data: { caseId } });
      navigate({ to: "/work/$caseId/ask/$threadId", params: { caseId, threadId: t.id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start a conversation.");
      setBusy(false);
    }
  }

  async function removeThread(threadId: string) {
    try {
      await deleteChatThread({ data: { threadId } });
      toast.success("Conversation deleted.");
      threads.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete the conversation.");
    }
  }

  if (pathname !== `/work/${caseId}/ask`) return <Outlet />;
  return (
    <AppShell>
      <WorkbenchIdentity area="ASK" title={kase.data?.title ?? "Case"} />
      <div className="mb-4 flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Question SEER about this case — its evidence, contradictions, alternatives and current judgement. Answers use only this case's record.
        </p>
        <Button onClick={newThread} disabled={busy}>{busy ? "Starting…" : "New conversation"}</Button>
      </div>
      {!threads.data?.length ? (
        <div className="seer-panel p-6 text-center text-sm text-muted-foreground">
          No conversations yet. Start one to challenge the case thinking.
        </div>
      ) : (
        <div className="space-y-2">
          {threads.data.map((t) => (
            <div key={t.id} className="seer-panel flex items-center justify-between gap-2 p-3">
              <Link to="/work/$caseId/ask/$threadId" params={{ caseId, threadId: t.id }} className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{t.title}</p>
                <p className="text-xs text-muted-foreground">Last active {new Date(t.updated_at).toLocaleString("en-GB")}</p>
              </Link>
              <Button variant="ghost" size="icon" aria-label={`Delete conversation: ${t.title}`} onClick={() => removeThread(t.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
      <div className="mt-6">
        <Link to="/work/$caseId" params={{ caseId }} className="text-sm text-primary underline-offset-4 hover:underline">← Back to case</Link>
      </div>
    </AppShell>
  );
}
