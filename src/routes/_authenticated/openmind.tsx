import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PageTitle } from "@/components/seer/AppShell";

export const Route = createFileRoute("/_authenticated/openmind")({
  head: () => ({ meta: [{ title: "Open Mind — SEER.ai" }] }),
  component: () => (
    <AppShell>
      <PageTitle title="Open Mind" />
      <p className="text-sm text-muted-foreground">This section has not been built yet. It is listed as outstanding in the build report.</p>
    </AppShell>
  ),
});
