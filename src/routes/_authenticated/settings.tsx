import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PageTitle } from "@/components/seer/AppShell";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — SEER.ai" }] }),
  component: () => (
    <AppShell>
      <PageTitle title="Settings" />
      <p className="text-sm text-muted-foreground">This section has not been built yet. It is listed as outstanding in the build report.</p>
    </AppShell>
  ),
});
