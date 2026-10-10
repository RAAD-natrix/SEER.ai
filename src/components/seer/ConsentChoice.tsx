import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { setSourceConsent } from "@/lib/seer/sources";

export type Consent = "LOCAL_ONLY" | "ALLOWED_AI";

// Stored value stays LOCAL_ONLY / ALLOWED_AI. "Local" means "kept inside SEER", not "on this device":
// files are held in SEER's private cloud storage, readable only by signed-in team members.
export const CONSENT_TEXT: Record<Consent, { label: string; hint: string }> = {
  LOCAL_ONLY: {
    label: "Private — not sent to AI",
    hint: "Kept in your private SEER storage (online, signed-in access only — not on this device only). Searchable. Never sent to an AI model.",
  },
  ALLOWED_AI: {
    label: "Allow AI processing",
    hint: "Kept in your private SEER storage, and SEER may send its text to the AI model for analysis.",
  },
};

/** Privacy decision made at upload: private by default; AI processing must be chosen explicitly. */
export function ConsentChoice({ value, onChange, name }: { value: Consent; onChange: (c: Consent) => void; name: string }) {
  return (
    <fieldset className="space-y-1">
      <legend className="seer-label mb-1">Privacy for this file</legend>
      {(Object.keys(CONSENT_TEXT) as Consent[]).map((v) => (
        <label key={v} className="flex min-h-11 cursor-pointer items-start gap-2 rounded border px-3 py-2 text-sm has-[:checked]:border-primary">
          <input type="radio" name={name} className="mt-1 size-4 accent-[var(--primary)]" checked={value === v} onChange={() => onChange(v)} />
          <span><span className="font-medium">{CONSENT_TEXT[v].label}</span><span className="block text-xs text-muted-foreground">{CONSENT_TEXT[v].hint}</span></span>
        </label>
      ))}
    </fieldset>
  );
}

export function consentLabel(c: string | null | undefined) {
  return c === "ALLOWED_AI" ? "AI processing allowed" : "Private — not sent to AI";
}

/** Explicit, confirmed change of an existing source's privacy choice (audited by the database trigger). */
export function SourceConsentToggle({ sourceId, consent, onChanged }: { sourceId: string; consent: string | null | undefined; onChanged: () => void }) {
  const allowed = consent === "ALLOWED_AI";
  async function toggle() {
    const msg = allowed
      ? "Revoke AI processing? SEER will stop sending this source's text to the AI model. Analyses already produced are kept."
      : "Allow AI processing? SEER will send this source's extracted text to the AI model when you run an analysis on it.";
    if (!window.confirm(msg)) return;
    try {
      await setSourceConsent(sourceId, allowed ? "LOCAL_ONLY" : "ALLOWED_AI");
      toast.success(allowed ? "AI processing revoked. This source is private and not sent to AI." : "AI processing allowed for this source.");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? `Privacy not changed: ${e.message}` : "Privacy not changed.");
    }
  }
  return (
    <Button size="sm" variant="outline" onClick={toggle}>
      {allowed ? "Revoke AI processing" : "Allow AI processing"}
    </Button>
  );
}
