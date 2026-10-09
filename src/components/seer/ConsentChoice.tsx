export type Consent = "LOCAL_ONLY" | "ALLOWED_AI";

/** Privacy decision made at upload: local-only by default; AI processing must be chosen explicitly. */
export function ConsentChoice({ value, onChange, name }: { value: Consent; onChange: (c: Consent) => void; name: string }) {
  const opts: { v: Consent; label: string; hint: string }[] = [
    { v: "LOCAL_ONLY", label: "Local only", hint: "Stored and searchable. Never sent to an AI model." },
    { v: "ALLOWED_AI", label: "Allow AI processing", hint: "SEER may send its text to the AI model for analysis." },
  ];
  return (
    <fieldset className="space-y-1">
      <legend className="seer-label mb-1">Privacy for this file</legend>
      {opts.map((o) => (
        <label key={o.v} className="flex min-h-11 cursor-pointer items-start gap-2 rounded border px-3 py-2 text-sm has-[:checked]:border-primary">
          <input type="radio" name={name} className="mt-1 size-4 accent-[var(--primary)]" checked={value === o.v} onChange={() => onChange(o.v)} />
          <span><span className="font-medium">{o.label}</span><span className="block text-xs text-muted-foreground">{o.hint}</span></span>
        </label>
      ))}
    </fieldset>
  );
}

export function consentLabel(c: string | null | undefined) {
  return c === "ALLOWED_AI" ? "AI processing allowed" : "Local only";
}
