import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PageTitle } from "@/components/seer/AppShell";

export const Route = createFileRoute("/_authenticated/work/$caseId")({
  component: () => (
    <AppShell>
      <PageTitle title="Case" />
      <p className="text-sm text-muted-foreground">The case workspace has not been built yet.</p>
    </AppShell>
  ),
});
