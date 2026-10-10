import { createFileRoute } from "@tanstack/react-router";
import { handleAskSeerChat } from "@/lib/seer/chat.server";

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: ({ request }) => handleAskSeerChat(request),
    },
  },
});
