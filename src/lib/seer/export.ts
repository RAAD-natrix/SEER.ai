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
const FOOTER = "Generated using SEER.ai — All Rights Reserved to Claudian Navin Stanislaus";

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
  const children = parse(md).map((b) => {
    const text = strip(b.text);
    if (b.kind === "h1") return new d.Paragraph({ text, heading: d.HeadingLevel.HEADING_1 });
    if (b.kind === "h2") return new d.Paragraph({ text, heading: d.HeadingLevel.HEADING_2 });
    if (b.kind === "h3") return new d.Paragraph({ text, heading: d.HeadingLevel.HEADING_3 });
    if (b.kind === "li") return new d.Paragraph({ text, bullet: { level: 0 } });
    return new d.Paragraph({ children: [new d.TextRun(text)] });
  });
  children.push(new d.Paragraph({ children: [new d.TextRun({ text: FOOTER, italics: true, size: 16 })] }));
  const doc = new d.Document({ sections: [{ children }] });
  download(await d.Packer.toBlob(doc), `${safe(title)}.docx`);
}

export async function exportPdf(title: string, md: string) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const W = pdf.internal.pageSize.getWidth();
  const H = pdf.internal.pageSize.getHeight();
  const M = 56;
  let y = M;
  const write = (text: string, size: number, bold = false, indent = 0) => {
    pdf.setFont("helvetica", bold ? "bold" : "normal");
    pdf.setFontSize(size);
    const lines = pdf.splitTextToSize(text, W - M * 2 - indent);
    for (const line of lines) {
      if (y > H - M) { pdf.addPage(); y = M; }
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
  write(FOOTER, 8);
  pdf.save(`${safe(title)}.pdf`);
}

export function exportCsv(filename: string, rows: Record<string, unknown>[], meta?: Record<string, unknown>) {
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [
    ...(meta ? [`# filters: ${JSON.stringify(meta)}`] : []),
    cols.map(esc).join(","),
    ...rows.map((r) => cols.map((c) => esc(typeof r[c] === "object" ? JSON.stringify(r[c]) : r[c])).join(",")),
  ];
  download(new Blob([lines.join("\n")], { type: "text/csv" }), `${safe(filename)}.csv`);
}
