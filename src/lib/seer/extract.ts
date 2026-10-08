// Browser-side document extraction with honest coverage records.
export type Coverage = {
  total_units: number;
  extracted_units: number;
  visual_review_required: number;
  failed_units: number;
  coverage_percent: number;
  unit: string;
};
export type Extraction = { text: string; coverage: Coverage; warnings: string[]; status: string };

export const ACCEPT = ".pdf,.docx,.pptx,.xlsx,.csv,.txt,.md,.markdown,.json,.png,.jpg,.jpeg,.webp,.gif";
const ALLOWED_EXT = ACCEPT.split(",").map((s) => s.slice(1));

export function validateFile(f: File, maxMb: number): string | null {
  const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED_EXT.includes(ext)) return `Unsupported file type .${ext}`;
  if (f.size > maxMb * 1024 * 1024) return `File exceeds ${maxMb} MB limit`;
  if (f.size === 0) return "File is empty";
  return null;
}

export function sanitiseFilename(n: string) {
  return n.replace(/[^\w.\-]+/g, "_").replace(/_+/g, "_").slice(0, 120);
}

export async function sha256(buf: ArrayBuffer) {
  const h = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function cov(total: number, ok: number, visual: number, failed: number, unit: string): Coverage {
  return { total_units: total, extracted_units: ok, visual_review_required: visual, failed_units: failed, coverage_percent: total ? Math.round((ok / total) * 100) : 0, unit };
}
function statusOf(c: Coverage) {
  if (c.extracted_units === 0) return c.visual_review_required ? "NEEDS_VISUAL_REVIEW" : "EXTRACTION_FAILED";
  if (c.extracted_units < c.total_units) return "PARTIALLY_EXTRACTED";
  return "EXTRACTED";
}

export async function extractFile(f: File): Promise<Extraction> {
  const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
  const warnings: string[] = [];
  try {
    if (["txt", "md", "markdown", "csv"].includes(ext)) {
      const t = await f.text();
      const c = cov(1, t.trim() ? 1 : 0, 0, t.trim() ? 0 : 1, "file");
      return { text: t, coverage: c, warnings, status: statusOf(c) };
    }
    if (ext === "json") {
      const t = await f.text();
      try {
        const pretty = JSON.stringify(JSON.parse(t), null, 2);
        const c = cov(1, 1, 0, 0, "file");
        return { text: pretty, coverage: c, warnings, status: statusOf(c) };
      } catch {
        warnings.push("Invalid JSON; stored as plain text.");
        const c = cov(1, 1, 0, 0, "file");
        return { text: t, coverage: c, warnings, status: statusOf(c) };
      }
    }
    if (["png", "jpg", "jpeg", "webp", "gif"].includes(ext)) {
      warnings.push("Image stored. Visual analysis is not enabled in this version; marked for visual review.");
      const c = cov(1, 0, 1, 0, "image");
      return { text: "", coverage: c, warnings, status: "NEEDS_VISUAL_REVIEW" };
    }
    if (ext === "pdf") {
      const pdfjs = await import("pdfjs-dist");
      const worker = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
      pdfjs.GlobalWorkerOptions.workerSrc = worker;
      const doc = await pdfjs.getDocument({ data: await f.arrayBuffer() }).promise;
      const parts: string[] = [];
      let ok = 0, visual = 0, failed = 0;
      for (let p = 1; p <= doc.numPages; p++) {
        try {
          const page = await doc.getPage(p);
          const tc = await page.getTextContent();
          const t = tc.items.map((i) => ("str" in i ? i.str : "")).join(" ").trim();
          if (t.length < 20) { visual++; warnings.push(`Page ${p}: little or no text — NEEDS_VISUAL_REVIEW`); }
          else { ok++; parts.push(`[Page ${p}]\n${t}`); }
        } catch { failed++; warnings.push(`Page ${p}: extraction failed`); }
      }
      const c = cov(doc.numPages, ok, visual, failed, "page");
      return { text: parts.join("\n\n"), coverage: c, warnings, status: statusOf(c) };
    }
    if (ext === "docx") {
      const mammoth = await import("mammoth");
      const r = await mammoth.extractRawText({ arrayBuffer: await f.arrayBuffer() });
      r.messages.forEach((m) => warnings.push(m.message));
      const c = cov(1, r.value.trim() ? 1 : 0, 0, r.value.trim() ? 0 : 1, "document");
      return { text: r.value, coverage: c, warnings, status: statusOf(c) };
    }
    if (ext === "pptx") {
      const JSZip = (await import("jszip")).default;
      const zip = await JSZip.loadAsync(await f.arrayBuffer());
      const slides = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => parseInt(a.match(/\d+/)![0]) - parseInt(b.match(/\d+/)![0]));
      const parts: string[] = [];
      let ok = 0, visual = 0;
      for (const s of slides) {
        const num = s.match(/slide(\d+)/)![1];
        const xml = await zip.file(s)!.async("string");
        const t = [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]).join(" ").trim();
        const notesFile = zip.file(`ppt/notesSlides/notesSlide${num}.xml`);
        const notes = notesFile ? [...(await notesFile.async("string")).matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]).join(" ").trim() : "";
        if (!t && !notes) { visual++; warnings.push(`Slide ${num}: no text — NEEDS_VISUAL_REVIEW`); }
        else { ok++; parts.push(`[Slide ${num}]\n${t}${notes ? `\n[Notes] ${notes}` : ""}`); }
      }
      const c = cov(slides.length, ok, visual, 0, "slide");
      return { text: parts.join("\n\n"), coverage: c, warnings, status: statusOf(c) };
    }
    if (ext === "xlsx") {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await f.arrayBuffer(), { cellFormula: true });
      const parts: string[] = [];
      let ok = 0;
      for (const name of wb.SheetNames) {
        const sh = wb.Sheets[name];
        const csv = XLSX.utils.sheet_to_csv(sh);
        const formulas = Object.entries(sh).filter(([k, v]) => !k.startsWith("!") && (v as { f?: string }).f).map(([k, v]) => `${k}: =${(v as { f: string }).f}`);
        if (csv.trim()) ok++;
        parts.push(`[Sheet ${name}]\n${csv}${formulas.length ? `\n[Formulas]\n${formulas.slice(0, 200).join("\n")}` : ""}`);
      }
      warnings.push("Spreadsheet values are displayed values; not complete statistical truth.");
      const c = cov(wb.SheetNames.length, ok, 0, wb.SheetNames.length - ok, "sheet");
      return { text: parts.join("\n\n"), coverage: c, warnings, status: statusOf(c) };
    }
  } catch (e) {
    warnings.push(`Extraction error: ${e instanceof Error ? e.message : String(e)}`);
  }
  const c = cov(1, 0, 0, 1, "file");
  return { text: "", coverage: c, warnings, status: "EXTRACTION_FAILED" };
}
