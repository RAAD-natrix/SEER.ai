import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PageTitle } from "@/components/seer/AppShell";

export const Route = createFileRoute("/_authenticated/search")({
  head: () => ({ meta: [{ title: "Search — SEER.ai" }] }),
  component: () => (
    <AppShell>
      <PageTitle title="Search" />
      <p className="text-sm text-muted-foreground">This section has not been built yet. It is listed as outstanding in the build report.</p>
    </AppShell>
  ),
});
