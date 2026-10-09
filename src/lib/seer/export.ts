import { DOCUMENT_BRAND as brand, documentLogo } from "./documentBrand";
// Real browser-side exports.
function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const safe = (s: string) => s.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "_").slice(0, 60) || "seer_output";
const FOOTER = `${brand.footer} · All rights reserved`;

// Export metadata is authoritative; never mutate the approved source record.
export function deliverableMarkdown(o: { content: string; status: string; version: number; approved_at: string | null }) {
  const status = `**Status:** ${o.status}${o.approved_at ? ` · Approved ${new Date(o.approved_at).toISOString().slice(0, 10)}` : ""} · Version ${o.version}`;
  return /^\*\*Status:\*\*.*$/im.test(o.content)
    ? o.content.replace(/^\*\*Status:\*\*.*$/im, (line) => status + (line.includes(" — ") ? " — " + line.split(" — ").slice(1).join(" — ") : ""))
    : `${status}\n\n${o.content}`;
}

export function exportMarkdown(title: string, md: string) {
  download(new Blob([`${md}\n\n---\n${FOOTER}\n`], { type: "text/markdown" }), `${safe(title)}.md`);
}
export function exportJSON(title: string, data: unknown) {
  download(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }), `${safe(title)}.json`);
}

type Block = { kind: "h1" | "h2" | "h3" | "li" | "p"; text: string };
function parse(md: string): Block[] {
  return md.split("\n").map((l) => l.trimEnd()).filter((l) => l.trim()).map((l) => {
    if (l.startsWith("### ")) return { kind: "h3", text: l.slice(4) };
    if (l.startsWith("## ")) return { kind: "h2", text: l.slice(3) };
    if (l.startsWith("# ")) return { kind: "h1", text: l.slice(2) };
    if (/^\s*([-*]|\d+\.)\s+/.test(l)) return { kind: "li", text: l.replace(/^\s*([-*]|\d+\.)\s+/, "") };
    return { kind: "p", text: l };
  });
}
const strip = (t: string) => t.replace(/\*\*(.*?)\*\*/g, "$1").replace(/\*(.*?)\*/g, "$1").replace(/`(.*?)`/g, "$1");

export async function exportDocx(title: string, md: string) {
  const d = await import("docx");
  const logo = await documentLogo();
  const children = parse(md).map((b) => {
    const text = strip(b.text);
    if (b.kind === "h1") return new d.Paragraph({ text, heading: d.HeadingLevel.HEADING_1 });
    if (b.kind === "h2") return new d.Paragraph({ text, heading: d.HeadingLevel.HEADING_2 });
    if (b.kind === "h3") return new d.Paragraph({ text, heading: d.HeadingLevel.HEADING_3 });
    if (b.kind === "li") return new d.Paragraph({ text, bullet: { level: 0 } });
    return new d.Paragraph({ children: [new d.TextRun(text)] });
  });
  const header = new d.Header({ children: [new d.Paragraph({ children: [
    new d.ImageRun({ type: "png", data: logo, transformation: { width: 25, height: 44 }, altText: { title: "Base Pairing", description: "Gold DNA helix", name: "Base Pairing logo" } }),
    new d.TextRun({ text: `  ${brand.name}  /  SEER.ai`, bold: true, color: brand.gold, size: 20 }),
   ], shading: { fill: brand.ink }, border: { bottom: { color: brand.gold, style: d.BorderStyle.SINGLE, size: 6, space: 6 } } })] });
  const footer = new d.Footer({ children: [new d.Paragraph({ border: { top: { color: brand.gold, style: d.BorderStyle.SINGLE, size: 4, space: 6 } }, children: [
    new d.TextRun({ text: `${brand.footer}  ·  `, color: brand.muted, size: 15 }), new d.TextRun({ children: [d.PageNumber.CURRENT], size: 15 }), new d.TextRun({ text: " / ", size: 15 }), new d.TextRun({ children: [d.PageNumber.TOTAL_PAGES], size: 15 }),
  ] })] });
  const doc = new d.Document({ title, creator: "Claudian Navin Stanislaus", styles: {
    default: { document: { run: { font: "Arial", size: 20, color: brand.ink }, paragraph: { spacing: { after: 100 } } } },
    paragraphStyles: [1, 2, 3].map((level) => ({ id: `Heading${level}`, name: `Heading ${level}`, basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: "Arial", bold: true, size: level === 1 ? 30 : level === 2 ? 24 : 21, color: level === 1 ? brand.ink : brand.gold }, paragraph: { keepNext: true, spacing: { before: 180, after: 100 }, outlineLevel: level - 1 } })),
  }, sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1700, bottom: 1200, left: 1120, right: 1120, header: 400, footer: 500 } } }, headers: { default: header }, footers: { default: footer }, children }] });
  download(await d.Packer.toBlob(doc), `${safe(title)}.docx`);
}

export async function exportPdf(title: string, md: string) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const logo = await documentLogo();
  pdf.setProperties({ title, author: "Claudian Navin Stanislaus", creator: "SEER.ai · Base Pairing" });
  const W = pdf.internal.pageSize.getWidth();
  const H = pdf.internal.pageSize.getHeight();
  const M = 56;
  let y = 104;
  const write = (text: string, size: number, bold = false, indent = 0) => {
    pdf.setFont("helvetica", bold ? "bold" : "normal");
    pdf.setFontSize(size);
    const lines = pdf.splitTextToSize(text, W - M * 2 - indent);
    for (const line of lines) {
      if (y > H - 76) { pdf.addPage(); y = 104; }
      pdf.setTextColor(bold ? `#${brand.gold}` : `#${brand.ink}`);
      pdf.text(line, M + indent, y);
      y += size * 1.4;
    }
    y += size * 0.3;
  };
  for (const b of parse(md)) {
    const t = strip(b.text);
    if (b.kind === "h1") write(t, 16, true);
    else if (b.kind === "h2") write(t, 13, true);
    else if (b.kind === "h3") write(t, 11, true);
    else if (b.kind === "li") write(`•  ${t}`, 10, false, 10);
    else write(t, 10);
  }
  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    pdf.setPage(page); pdf.setFillColor(`#${brand.ink}`); pdf.rect(0, 0, W, 83, "F");
    pdf.addImage(logo, "PNG", M, 16, 27, 48);
    pdf.setTextColor(`#${brand.gold}`); pdf.setFont("helvetica", "bold"); pdf.setFontSize(12); pdf.text(brand.name, M + 42, 37);
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(9); pdf.text("SEER.ai · Second mind. Symbiote.", M + 42, 54);
    pdf.setDrawColor(`#${brand.gold}`); pdf.setLineWidth(0.7); pdf.line(M, H - 54, W - M, H - 54);
    pdf.setTextColor(`#${brand.muted}`); pdf.setFontSize(8); pdf.text(brand.footer, M, H - 37); pdf.text(`${page} / ${pages}`, W - M, H - 37, { align: "right" });
  }
  pdf.save(`${safe(title)}.pdf`);
}

export function exportCsv(filename: string, rows: Record<string, unknown>[], meta?: Record<string, unknown>) {
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [
    ...(meta ? [esc(`# filters: ${JSON.stringify(meta)}`)] : []),
    cols.map(esc).join(","),
    ...rows.map((r) => cols.map((c) => esc(typeof r[c] === "object" ? JSON.stringify(r[c]) : r[c])).join(",")),
  ];
  download(new Blob([lines.join("\n")], { type: "text/csv" }), `${safe(filename)}.csv`);
}
