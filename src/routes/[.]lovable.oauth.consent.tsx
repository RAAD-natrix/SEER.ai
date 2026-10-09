import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/seer/BrandIdentity";

type OAuthApi = {
  getAuthorizationDetails: (id: string) => Promise<{ data: any; error: { message: string } | null }>;
  approveAuthorization: (id: string) => Promise<{ data: any; error: { message: string } | null }>;
  denyAuthorization: (id: string) => Promise<{ data: any; error: { message: string } | null }>;
};
const oauth = () => (supabase.auth as unknown as { oauth: OAuthApi }).oauth;

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  head: () => ({ meta: [{ title: "Connect an assistant — SEER.ai" }, { name: "description", content: "Approve read-only assistant access to your SEER.ai cases and deliverables." }, { property: "og:title", content: "Connect an assistant — SEER.ai" }, { property: "og:description", content: "Approve read-only assistant access to your SEER.ai cases and deliverables." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] }),
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s["authorization_id"] === "string" ? (s["authorization_id"] as string) : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Missing authorization_id");
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/auth", search: { next: location.pathname + location.searchStr } });
  },
  loader: async ({ location }) => {
    const id = new URLSearchParams(location.search).get("authorization_id");
    if (!id) throw new Error("Missing authorization_id");
    const { data, error } = await oauth().getAuthorizationDetails(id);
    if (error) throw new Error(error.message);
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate });
    return data;
  },
  component: Consent,
  errorComponent: ({ error }) => (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="seer-panel max-w-sm p-6 text-sm">Could not load this authorization request: {String((error as Error)?.message ?? error)}</div>
    </main>
  ),
});

function Consent() {
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = details?.client?.name ?? "an assistant";

  async function decide(approve: boolean) {
    setBusy(true);
    try {
    const { data, error } = approve
      ? await oauth().approveAuthorization(authorization_id)
      : await oauth().denyAuthorization(authorization_id);
    if (error) { setBusy(false); setError(error.message); return; }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) { setBusy(false); setError("No redirect returned."); return; }
    window.location.href = target;
    } catch {
      setBusy(false);
      setError("The connection could not be completed. Please start a fresh connection request.");
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="seer-panel w-full max-w-sm space-y-4 p-6">
        <BrandLogo className="h-16" />
        <div className="seer-label">SEER.ai · Agent access</div>
        <h1 className="text-lg font-semibold">Connect {name} to your account</h1>
        {details?.client?.redirect_uri && <p className="break-all text-xs text-muted-foreground">{details.client.redirect_uri}</p>}
        <p className="text-sm text-muted-foreground">It will be able to read the cases and deliverables you can see in SEER. It cannot change anything.</p>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Button disabled={busy} onClick={() => decide(true)}>Approve</Button>
          <Button variant="outline" disabled={busy} onClick={() => decide(false)}>Deny</Button>
        </div>
      </div>
    </main>
  );
}
