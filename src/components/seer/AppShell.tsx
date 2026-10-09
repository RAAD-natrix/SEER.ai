import { Link, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { APP_VERSION } from "@/lib/seer/charter";
import { BrandLogo, WorkbenchIdentity } from "@/components/seer/BrandIdentity";
import { Button } from "@/components/ui/button";

const primary = [
  { to: "/think", label: "THINK" },
  { to: "/work", label: "WORK" },
  { to: "/openmind", label: "OPEN MIND" },
] as const;
const secondary = [
  { to: "/backlog", label: "Backlog" },
  { to: "/deliverables", label: "Deliverables" },
  { to: "/search", label: "Search" },
  { to: "/memory", label: "Memory" },
  { to: "/settings", label: "Settings" },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b bg-background">
        <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-2 px-4 lg:gap-4">
          <Link to="/home" className="flex shrink-0 items-center gap-2.5" aria-label="SEER.ai home">
            <BrandLogo className="h-10" decorative />
            <span><span className="block font-semibold">SEER.ai</span><span className="block font-mono text-[9px] text-primary">BASE PAIRING</span></span>
          </Link>
          <nav className="ml-1 flex items-center gap-0 lg:gap-1" aria-label="Primary">
            {primary.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className="rounded px-2.5 py-1.5 font-mono text-xs tracking-wider text-muted-foreground hover:text-foreground"
                activeProps={{ className: "rounded px-2.5 py-1.5 font-mono text-xs tracking-wider bg-secondary text-primary" }}
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <nav className="ml-auto hidden items-center gap-1 xl:flex" aria-label="Secondary">
            {secondary.map((n) => (
              <Link key={n.to} to={n.to} className="rounded px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground" activeProps={{ className: "rounded px-2 py-1.5 text-sm text-foreground" }}>
                {n.label}
              </Link>
            ))}
            <Button variant="ghost" size="sm"
              className="text-muted-foreground hover:text-foreground"
              onClick={async () => {
                await supabase.auth.signOut();
                navigate({ to: "/auth" });
              }}
            >
              Sign out
            </Button>
          </nav>
        </div>
        <nav className="flex flex-wrap items-center gap-1 border-t px-3 py-1 xl:hidden" aria-label="Secondary mobile">
          {secondary.map((n) => (
            <Link key={n.to} to={n.to} className="px-2 py-1 text-sm text-muted-foreground" activeProps={{ className: "px-2 py-1 text-sm text-foreground" }}>
              {n.label}
            </Link>
          ))}
          <Button variant="ghost" size="sm" className="ml-auto text-muted-foreground" onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/auth" }); }}>
            Sign out
          </Button>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-6">{children}</main>
      <footer className="border-t px-4 py-3 text-center text-xs text-muted-foreground">
        <span className="text-primary">SEER.ai · Base Pairing</span><span className="mx-2">·</span>All Rights Reserved to Claudian Navin Stanislaus · v{APP_VERSION}
      </footer>
    </div>
  );
}

export function PageTitle({ label, title, children }: { label?: string; title: string; children?: ReactNode }) {
  return (
    <>
      <WorkbenchIdentity area={label ?? "SETTINGS"} title={title} />
      {children && <div className="-mt-3 mb-6 flex flex-wrap justify-end gap-2">{children}</div>}
    </>
  );
}

export function Bullets({ items, empty = "—" }: { items?: unknown; empty?: string }) {
  const list = Array.isArray(items) ? items.filter(Boolean).map(String) : [];
  if (!list.length) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="list-disc space-y-1 pl-5 text-sm">
      {list.map((t, i) => (
        <li key={i}>{t}</li>
      ))}
    </ul>
  );
}

export function Block({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="seer-label">{label}</div>
      {children}
    </div>
  );
}

export function StatusTag({ s }: { s: string }) {
  const good = ["CANONICAL", "CLOSED", "FINAL — OWNER APPROVED", "EXTRACTED", "COMPLETED", "READY FOR OWNER APPROVAL"].includes(s);
  const bad = ["WITHDRAWN", "BLOCKED_FOR_GENERAL_REUSE", "REJECTED", "FAILED", "EXTRACTION_FAILED", "NOT READY"].includes(s);
  return (
    <span className={`inline-block rounded border px-1.5 py-0.5 font-mono text-[10px] tracking-wider ${good ? "border-primary text-primary" : bad ? "border-destructive text-destructive" : "text-muted-foreground"}`}>
      {s}
    </span>
  );
}
