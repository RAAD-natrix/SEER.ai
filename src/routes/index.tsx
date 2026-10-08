import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SEER.ai — Strategic Judgement Engine" },
      { name: "description", content: "Private strategic cognition workbench for briefs, research, thought paths and decision-ready outputs." },
      { property: "og:title", content: "SEER.ai — Strategic Judgement Engine" },
      { property: "og:description", content: "Private strategic cognition workbench." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => navigate({ to: data.session ? "/home" : "/auth", replace: true }));
  }, [navigate]);
  return (
    <div className="flex min-h-screen items-center justify-center">
      <span className="seer-label">SEER.ai</span>
    </div>
  );
}
