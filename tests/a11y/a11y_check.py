"""SEER accessibility gate (adapted from the Strategic Insight Studio reference).

Checks signed-in pages at 390 / 768 / 1440 px for:
  axe-core WCAG 2.1 A/AA violations (incl. contrast and labels),
  visible text under 13px, interactive targets under 44px, horizontal clipping,
  and a working skip link.

Usage:  python3 tests/a11y/a11y_check.py
Env:    BASE_URL (default http://localhost:8080)
        SEER_SESSION_FILE (default ~/.cache/lovable-auth/session.json) — a minted session
        SEER_CASE_ID optional case to include the Work stages
"""
import asyncio, json, os, sys
from pathlib import Path
from playwright.async_api import async_playwright

BASE = os.environ.get("BASE_URL", "http://localhost:8080")
ROOT = Path(__file__).resolve().parents[2]
AXE = (ROOT / "node_modules/axe-core/axe.min.js").read_text()
SESSION = Path(os.path.expanduser(os.environ.get("SEER_SESSION_FILE", "~/.cache/lovable-auth/session.json")))
CASE = os.environ.get("SEER_CASE_ID")
PAGES = ["/auth", "/home", "/think", "/work", "/backlog", "/deliverables", "/memory", "/openmind", "/search", "/settings"]
if CASE:
    PAGES.append(f"/work/{CASE}")
WIDTHS = [390, 768, 1440]
failures: list[tuple[str, str, str]] = []

SCAN = """() => {
  const out = { small: [], targets: [], clip: document.documentElement.scrollWidth > window.innerWidth + 1 };
  const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  for (const el of document.querySelectorAll('body *')) {
    if (!vis(el)) continue;
    const own = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    if (own && parseFloat(getComputedStyle(el).fontSize) < 12.9 && !el.closest('.sr-only,[aria-hidden=true],svg')) out.small.push((el.textContent||'').trim().slice(0,40));
  }
  for (const el of document.querySelectorAll('button, a[href], select, input:not([type=hidden]):not([type=radio]):not([type=checkbox]), [role=button], [role=tab]')) {
    if (!vis(el) || el.classList.contains('skip-link')) continue;
    const r = el.getBoundingClientRect();
    const inline = el.tagName === 'A' && el.closest('p,li,td') && !el.className.includes('min-h');
    if (!inline && (r.height < 43.5 || (r.width < 43.5 && el.tagName !== 'INPUT' && el.tagName !== 'SELECT'))) out.targets.push(`${el.tagName.toLowerCase()} "${(el.innerText||el.getAttribute('aria-label')||'').trim().slice(0,30)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
  }
  out.small = [...new Set(out.small)].slice(0, 8); out.targets = [...new Set(out.targets)].slice(0, 8);
  return out;
}"""

async def main():
    minted = json.loads(SESSION.read_text())
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        for w in WIDTHS:
            ctx = await browser.new_context(viewport={"width": w, "height": 1000})
            page = await ctx.new_page()
            await page.goto(BASE, wait_until="domcontentloaded")
            for path in PAGES:
                if path == "/auth":
                    await page.evaluate("localStorage.clear()")
                else:
                    await page.evaluate(f"localStorage.setItem({json.dumps(minted['storage_key'])}, {json.dumps(json.dumps(minted['session']))})")
                await page.goto(BASE + path, wait_until="networkidle")
                await page.wait_for_timeout(800)
                where = f"{path}@{w}"
                await page.add_script_tag(content=AXE)
                vio = await page.evaluate("""async () => (await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21a','wcag21aa'] } })).violations.map(v => ({ id: v.id, nodes: v.nodes.slice(0,3).map(n => n.target.join(' ')) }))""")
                for v in vio:
                    failures.append(("axe:" + v["id"], where, "; ".join(v["nodes"])))
                r = await page.evaluate(SCAN)
                if r["clip"]: failures.append(("clip", where, "horizontal overflow"))
                for t in r["small"]: failures.append(("text<13px", where, t))
                for t in r["targets"]: failures.append(("target<44px", where, t))
                if path != "/auth":
                    await page.keyboard.press("Tab")
                    first = await page.evaluate("document.activeElement?.className || ''")
                    if "skip-link" not in first: failures.append(("skip-link", where, "first Tab did not reach the skip link"))
            await ctx.close()
        await browser.close()
    checked = len(PAGES) * len(WIDTHS)
    for f in failures: print(" | ".join(f))
    print(f"\n{checked} page states checked, {len(failures)} failures")
    sys.exit(1 if failures else 0)

asyncio.run(main())
