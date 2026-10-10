import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/seer/AppShell";
import { WorkbenchIdentity } from "@/components/seer/BrandIdentity";
import { Conversation, ConversationContent, ConversationEmptyState, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { PromptInput, PromptInputFooter, PromptInputSubmit, PromptInputTextarea } from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { loadChatMessages } from "@/lib/seer/chat.functions";

export const Route = createFileRoute("/_authenticated/work/$caseId/ask/$threadId")({
  head: () => ({ meta: [{ title: "Ask SEER — SEER.ai" }, { name: "description", content: "Question SEER about a case: its evidence, contradictions, alternatives and current judgement." }, { property: "og:title", content: "Ask SEER — SEER.ai" }, { property: "og:description", content: "Question SEER about a case: its evidence, contradictions, alternatives and current judgement." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: AskThreadPage,
});

function AskThreadPage() {
  const { caseId, threadId } = Route.useParams();
  const kase = useQuery({
    queryKey: ["case", caseId],
    queryFn: async () => (await supabase.from("cases").select("id,title,client").eq("id", caseId).single()).data,
  });
  const history = useQuery({
    queryKey: ["chat-messages", threadId],
    queryFn: () => loadChatMessages({ data: { threadId } }),
    staleTime: Infinity,
  });

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: { threadId, caseId },
        fetch: async (input, init) => {
          const { data } = await supabase.auth.getSession();
          const headers = new Headers(init?.headers);
          if (data.session?.access_token) headers.set("Authorization", `Bearer ${data.session.access_token}`);
          return fetch(input, { ...init, headers });
        },
      }),
    [threadId, caseId],
  );

  const { messages, sendMessage, status, stop, error } = useChat({
    id: threadId,
    transport,
    messages: (history.data ?? []) as UIMessage[],
    onError: (e) => toast.error(e.message || "Ask SEER failed. Please retry."),
  });
  const busy = status === "submitted" || status === "streaming";

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!busy) textareaRef.current?.focus();
  }, [busy, threadId]);

  return (
    <AppShell>
      <WorkbenchIdentity area="ASK" title={kase.data?.title ?? "Case"} />
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">Answers draw only on this case's record. Local-only files are never sent to the AI.</p>
        <Link to="/work/$caseId/ask" params={{ caseId }} className="text-sm text-primary underline-offset-4 hover:underline">All conversations</Link>
      </div>
      <div className="seer-panel flex h-[calc(100dvh-16rem)] min-h-[24rem] flex-col">
        <Conversation className="flex-1">
          <ConversationContent>
            {history.isLoading ? (
              <Shimmer className="p-4 text-sm">Loading conversation…</Shimmer>
            ) : messages.length === 0 ? (
              <ConversationEmptyState
                title="Ask SEER about this case"
                description="Try: What contradicts the current judgement? What evidence is missing? What would change your mind?"
              />
            ) : (
              messages.map((m) => (
                <Message key={m.id} from={m.role}>
                  <MessageContent>
                    {m.parts.map((part, i) =>
                      part.type === "text" ? (
                        m.role === "assistant" ? (
                          <MessageResponse key={i}>{part.text}</MessageResponse>
                        ) : (
                          <p key={i} className="whitespace-pre-wrap">{part.text}</p>
                        )
                      ) : null,
                    )}
                  </MessageContent>
                </Message>
              ))
            )}
            {status === "submitted" && <Shimmer className="text-sm">SEER is thinking…</Shimmer>}
            {error && <p className="p-2 text-sm text-destructive">{error.message || "Something went wrong. Your message is preserved above — please retry."}</p>}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>
        <div className="border-t p-3">
          <PromptInput
            onSubmit={({ text }) => {
              if (!text.trim() || busy) return;
              sendMessage({ text });
            }}
          >
            <PromptInputTextarea ref={textareaRef} placeholder="Question the case thinking…" disabled={busy} />
            <PromptInputFooter className="justify-end">
              <PromptInputSubmit status={status} onStop={stop} disabled={busy && status !== "streaming"} />
            </PromptInputFooter>
          </PromptInput>
        </div>
      </div>
    </AppShell>
  );
}
