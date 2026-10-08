// Deterministic contamination scan for candidate method cards.
// Shared by client and server. AI scan is layered on top server-side.

export type ContaminationIssue = { type: string; match: string };
export type ContaminationResult = {
  blocked: boolean;
  issues: ContaminationIssue[];
  scanned_at: string;
  method: string;
};

const ALLOWED_CAPS = new Set(
  [
    "A","An","The","This","That","These","Those","If","When","Where","Do","Does","Not","Use","Ask","Test","Before","After","Prefer","Keep","Every","Any","Each","No","Strip","Satisfy","Explain","Creative","Where","What","Who","Why","How","It","Its","Is","Are","Then","Otherwise","Only","Never","Always","Avoid","Consider","Identify","Separate","Check","Treat","For","In","On","Of","To","Or","And","But","With","Without","Existing","New","Current","Owner","SEER","CEO","CFO","CMO","KPI","ROI","NOW","NEXT","NOT","YET","OPTION","I","We","They","Most","Some","Many","Once","Until","Unless","By","From","As","At","Be","Can","Should","Must","May","Will",
  ].map((s) => s.toLowerCase()),
);

const PATTERNS: { type: string; re: RegExp }[] = [
  { type: "email", re: /[\w.+-]+@[\w-]+\.[\w.-]+/g },
  { type: "phone", re: /(\+?\d[\d\s().-]{7,}\d)/g },
  { type: "url", re: /\bhttps?:\/\/\S+|\bwww\.\S+/gi },
  { type: "money", re: /(?:RM|USD|SGD|MYR|EUR|GBP|US\$|S\$|\$|£|€)\s?\d[\d,.]*\s?(?:k|m|bn|million|billion)?/gi },
  { type: "percentage", re: /\b\d+(?:\.\d+)?\s?%/g },
  { type: "date", re: /\b(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|(?:19|20)\d{2}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2})\b/gi },
  { type: "address", re: /\b\d+[A-Za-z]?,?\s+(?:jalan|jln|street|st|road|rd|avenue|ave|lorong|persiaran)\b[^,.;]*/gi },
  { type: "large_number", re: /\b\d{1,3}(?:,\d{3})+\b|\b\d{4,}\b/g },
];

function properNouns(text: string): string[] {
  const out = new Set<string>();
  // Capitalised words not at sentence start, and multi-cap sequences / ALLCAPS brand-like tokens.
  const sentences = text.split(/(?<=[.!?\n])\s+/);
  for (const s of sentences) {
    const words = s.split(/\s+/).filter(Boolean);
    words.forEach((w, i) => {
      const clean = w.replace(/^[^A-Za-z]+|[^A-Za-z0-9'’-]+$/g, "");
      if (!clean) return;
      if (ALLOWED_CAPS.has(clean.toLowerCase())) return;
      if (i > 0 && /^[A-Z][a-z]+[A-Z]?\w*$/.test(clean)) out.add(clean);
      if (/^[A-Z]{2,}[A-Z0-9]*$/.test(clean) && clean.length <= 8 && !ALLOWED_CAPS.has(clean.toLowerCase())) out.add(clean);
      if (/[a-z][A-Z]/.test(clean)) out.add(clean); // camel-case brand names
    });
  }
  return [...out];
}

function verbatimOverlap(card: string, source: string, n = 8): string[] {
  if (!source) return [];
  const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
  const src = norm(source);
  const grams = new Set<string>();
  for (let i = 0; i + n <= src.length; i++) grams.add(src.slice(i, i + n).join(" "));
  const c = norm(card);
  const hits: string[] = [];
  for (let i = 0; i + n <= c.length; i++) {
    const g = c.slice(i, i + n).join(" ");
    if (grams.has(g)) {
      hits.push(g);
      i += n - 1;
    }
  }
  return hits.slice(0, 5);
}

export function cardText(card: Record<string, unknown>): string {
  return [
    "name","problem_type","mechanism","why_useful","prerequisites","use_when","do_not_use_when","counterexamples","required_evidence","falsifier",
  ]
    .map((k) => (typeof card[k] === "string" ? (card[k] as string) : ""))
    .filter(Boolean)
    .join(".\n");
}

export function scanContamination(
  card: Record<string, unknown>,
  sourceText = "",
  sourceEntities: string[] = [],
): ContaminationResult {
  const text = cardText(card);
  const issues: ContaminationIssue[] = [];
  for (const p of PATTERNS) {
    for (const m of text.matchAll(p.re)) issues.push({ type: p.type, match: m[0].trim() });
  }
  for (const pn of properNouns(text)) issues.push({ type: "proper_name", match: pn });
  for (const v of verbatimOverlap(text, sourceText)) issues.push({ type: "verbatim_passage", match: v });
  const lower = text.toLowerCase();
  for (const e of sourceEntities) {
    if (e && e.length > 2 && lower.includes(e.toLowerCase())) issues.push({ type: "source_entity", match: e });
  }
  const dedup = new Map(issues.map((i) => [`${i.type}:${i.match.toLowerCase()}`, i]));
  const list = [...dedup.values()];
  return {
    blocked: list.length > 0,
    issues: list,
    scanned_at: new Date().toISOString(),
    method: "deterministic-v1",
  };
}
