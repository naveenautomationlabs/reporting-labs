import { ReportData } from './types';

import * as fs from 'fs';
import * as path from 'path';

function fontCss(embed: boolean): string {
  if (!embed) return `<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">`;
  const dir = path.join(__dirname, '..', 'fonts');
  const face = (family: string, file: string, weight: number) => {
    const p = path.join(dir, file);
    if (!fs.existsSync(p)) return '';
    const b64 = fs.readFileSync(p).toString('base64');
    return `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};font-display:swap;src:url(data:font/woff2;base64,${b64}) format('woff2')}`;
  };
  return '<style>' + [face('IBM Plex Sans', 'sans-400.woff2', 400), face('IBM Plex Sans', 'sans-500.woff2', 500), face('IBM Plex Sans', 'sans-600.woff2', 600), face('IBM Plex Mono', 'mono-400.woff2', 400), face('IBM Plex Mono', 'mono-500.woff2', 500)].join('') + '</style>';
}

/** reporting-labs mark: a lab flask holding report bars. Used as favicon and header logo when no custom logo is set. */
export const LOGO_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="rl-bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1A56DB"/><stop offset="1" stop-color="#0A2A6B"/></linearGradient><radialGradient id="rl-glow" cx="0.8" cy="0.1" r="0.9"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient><clipPath id="rl-flask"><path d="M25 8h14v14l13.5 24.5c1.8 3.3-.6 7.5-4.4 7.5H15.9c-3.8 0-6.2-4.2-4.4-7.5L25 22z"/></clipPath></defs><rect width="64" height="64" rx="15" fill="url(#rl-bg)"/><rect width="64" height="64" rx="15" fill="url(#rl-glow)"/><g clip-path="url(#rl-flask)"><rect x="17" y="40" width="7" height="20" rx="2" fill="#fff" fill-opacity=".55"/><rect x="28.5" y="28" width="7" height="32" rx="2" fill="#3DDC8C"/><rect x="40" y="35" width="7" height="25" rx="2" fill="#fff" fill-opacity=".85"/></g><path d="M25 8h14v14l13.5 24.5c1.8 3.3-.6 7.5-4.4 7.5H15.9c-3.8 0-6.2-4.2-4.4-7.5L25 22z" fill="none" stroke="#fff" stroke-width="3.2" stroke-linejoin="round"/><path d="M22 8h20" stroke="#fff" stroke-width="3.2" stroke-linecap="round"/><circle cx="24" cy="30" r="2.2" fill="#fff" fill-opacity=".9"/></svg>';

export function renderHtml(data: ReportData): string {
  const json = JSON.stringify(data).replace(/<\/script/gi, '<\\/script');
  const themeAttr = (data.options.theme === 'auto' ? '' : ` data-theme="${data.options.theme}"`) + ` data-palette="${data.options.palette}"`;
  return `<!doctype html>
<html lang="en"${themeAttr}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(data.title)}</title>
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,${encodeURIComponent(LOGO_SVG)}">
${fontCss(data.options.embedFonts)}
<style>${CSS}${data.options.accent ? `:root{--accent:${data.options.accent}!important}` : ''}${data.options.customCss}</style>
</head>
<body>
<div id="app"></div>
<template id="rl-logo">${LOGO_SVG}</template>
<script id="rl-data" type="application/json">${json}</script>
<script>${JS}</script>
</body>
</html>`;
}

function esc(s: string) {
  return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
}

const CSS = String.raw`
/* ---------- palettes: each defines light + dark ---------- */
:root{
  --radius:6px; --mono:'IBM Plex Mono',ui-monospace,SFMono-Regular,Menlo,monospace;
  --sans:'IBM Plex Sans',system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
  --pass:#1FA971; --fail:#E5405E; --skip:#8B95A5; --flaky:#E39B12;
  --pass-bg:#DDF5EA; --fail-bg:#FDE3E8; --skip-bg:#EDF0F4; --flaky-bg:#FBEFD2; --flaky-ink:#8A5A00;
  /* blue (default): white paper + royal blue */
  --bg:#F2F6FC; --surface:#FFFFFF; --surface-2:#EAF1FB; --line:#D9E3F2; --line-2:#C6D5EA; --ink:#0B1F44; --ink-2:#3F5680; --ink-3:#7A8CAB; --accent:#1A56DB; --accent-ink:#fff;
  --accent-2:#0E3FA9; --accent-deep:#0A2A6B; --accent-tint:#E3ECFF; --accent-soft:#BFD2FF; --band-end:var(--accent);
  --shadow:0 1px 2px rgba(11,31,68,.05),0 8px 24px -12px rgba(26,86,219,.18);
}
:root[data-palette=ocean]{ --bg:#F1F6F7; --surface:#FFFFFF; --surface-2:#E6EFF1; --line:#D3E0E4; --line-2:#BFD2D8; --ink:#0F2430; --ink-2:#3F5A66; --ink-3:#6F8894; --accent:#0E8FA6; --accent-2:#0B6F82; --accent-deep:#06404B; --accent-tint:#DDF1F4; --accent-soft:#A9DEE6; --shadow:0 1px 2px rgba(15,36,48,.05),0 8px 24px -12px rgba(14,143,166,.2) }
:root[data-palette=ember]{ --bg:#F8F4EF; --surface:#FFFFFF; --surface-2:#F0E9E0; --line:#E2D8CB; --line-2:#D2C4B2; --ink:#231C16; --ink-2:#5C5148; --ink-3:#8D8177; --accent:#E0521B; --accent-2:#B53E11; --accent-deep:#5E200A; --accent-tint:#FBE6DC; --accent-soft:#F5C2AB; --shadow:0 1px 2px rgba(35,28,22,.05),0 8px 24px -12px rgba(224,82,27,.2) }
:root[data-palette=mono]{ --bg:#F4F4F4; --surface:#FFFFFF; --surface-2:#EBEBEB; --line:#DCDCDC; --line-2:#C8C8C8; --ink:#161616; --ink-2:#4F4F4F; --ink-3:#848484; --accent:#161616; --accent-2:#2B2B2B; --accent-deep:#000; --accent-tint:#E8E8E8; --accent-soft:#CFCFCF; --shadow:0 1px 2px rgba(0,0,0,.05),0 8px 24px -12px rgba(0,0,0,.18) }

/* dark tokens per palette */
:root[data-theme=dark], :root:not([data-theme=light]) { color-scheme:light }
@media (prefers-color-scheme:dark){ :root:not([data-theme=light]){ --_dark:1 } }
:root[data-theme=dark]{ --_dark:1 }
@media (prefers-color-scheme:dark){
  :root:not([data-theme=light]){ --bg:#0A1730; --surface:#10213F; --surface-2:#172B50; --line:#22375E; --line-2:#2E4570; --ink:#EAF0FB; --ink-2:#AEBFDD; --ink-3:#7489AE; --accent:#4D8CFF; --accent-ink:#fff; --accent-2:#3572F0; --accent-deep:#071A45; --accent-tint:#183566; --accent-soft:#2C4E8F; --band-end:var(--accent); --shadow:0 1px 2px rgba(0,0,0,.3),0 8px 24px -12px rgba(0,0,0,.5); --pass:#34D07E; --fail:#FF6B85; --flaky:#F8B640; --skip:#6A7D9E; --pass-bg:#0F3A25; --fail-bg:#40192A; --skip-bg:#1B2A47; --flaky-bg:#3E2C08; --flaky-ink:#FFD58A; color-scheme:dark }
  :root:not([data-theme=light])[data-palette=ocean]{ --bg:#07161B; --surface:#0D2027; --surface-2:#132A33; --line:#1E3942; --ink:#E4F1F4; --ink-2:#9DB8C0; --ink-3:#6A8A93; --accent:#2FC4DA; --accent-2:#1A9DB0; --accent-deep:#062A32; --accent-tint:#0F3A43; --accent-soft:#1C5A66; --line-2:#2A4A54 }
  :root:not([data-theme=light])[data-palette=ember]{ --bg:#15100C; --surface:#1E1712; --surface-2:#292019; --line:#3A2E24; --ink:#F3EBE2; --ink-2:#C2B4A5; --ink-3:#8C7E70; --accent:#FF7A38; --accent-2:#D95A1E; --accent-deep:#3A1A0A; --accent-tint:#3A2416; --accent-soft:#5E3520; --line-2:#4A3B2F }
  :root:not([data-theme=light])[data-palette=mono]{ --bg:#0E0E0E; --surface:#161616; --surface-2:#1F1F1F; --line:#2C2C2C; --ink:#F2F2F2; --ink-2:#B3B3B3; --ink-3:#7A7A7A; --accent:#F2F2F2; --accent-ink:#0E0E0E; --accent-2:#2B2B2B; --accent-deep:#000; --accent-tint:#262626; --accent-soft:#3A3A3A; --band-end:#3A3A3A; --line-2:#3A3A3A }
}
:root[data-theme=dark]{ --bg:#0A1730; --surface:#10213F; --surface-2:#172B50; --line:#22375E; --line-2:#2E4570; --ink:#EAF0FB; --ink-2:#AEBFDD; --ink-3:#7489AE; --accent:#4D8CFF; --accent-ink:#fff; --accent-2:#3572F0; --accent-deep:#071A45; --accent-tint:#183566; --accent-soft:#2C4E8F; --band-end:var(--accent); --shadow:0 1px 2px rgba(0,0,0,.3),0 8px 24px -12px rgba(0,0,0,.5); --pass:#34D07E; --fail:#FF6B85; --flaky:#F8B640; --skip:#6A7D9E; --pass-bg:#0F3A25; --fail-bg:#40192A; --skip-bg:#1B2A47; --flaky-bg:#3E2C08; --flaky-ink:#FFD58A; color-scheme:dark }
:root[data-theme=dark][data-palette=ocean]{ --bg:#07161B; --surface:#0D2027; --surface-2:#132A33; --line:#1E3942; --ink:#E4F1F4; --ink-2:#9DB8C0; --ink-3:#6A8A93; --accent:#2FC4DA; --accent-2:#1A9DB0; --accent-deep:#062A32; --accent-tint:#0F3A43; --accent-soft:#1C5A66; --line-2:#2A4A54 }
:root[data-theme=dark][data-palette=ember]{ --bg:#15100C; --surface:#1E1712; --surface-2:#292019; --line:#3A2E24; --ink:#F3EBE2; --ink-2:#C2B4A5; --ink-3:#8C7E70; --accent:#FF7A38; --accent-2:#D95A1E; --accent-deep:#3A1A0A; --accent-tint:#3A2416; --accent-soft:#5E3520; --line-2:#4A3B2F }
:root[data-theme=dark][data-palette=mono]{ --bg:#0E0E0E; --surface:#161616; --surface-2:#1F1F1F; --line:#2C2C2C; --ink:#F2F2F2; --ink-2:#B3B3B3; --ink-3:#7A7A7A; --accent:#F2F2F2; --accent-ink:#0E0E0E; --accent-2:#2B2B2B; --accent-deep:#000; --accent-tint:#262626; --accent-soft:#3A3A3A; --band-end:#3A3A3A; --line-2:#3A3A3A }
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 var(--sans)}
button,input,select{font:inherit;color:inherit}
button{cursor:pointer;background:none;border:0;padding:0}
a{color:var(--accent)}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}

/* top nav */
.nav{position:sticky;top:0;z-index:5;background:var(--surface);border-bottom:1px solid var(--line);padding:0 28px;display:flex;gap:2px;align-items:center}
.nav button{padding:12px 14px;font-size:13px;color:var(--ink-2);border-bottom:2px solid transparent;margin-bottom:-1px;display:inline-flex;gap:7px;align-items:center}
.nav button:hover{color:var(--ink)} .nav button[aria-selected=true]{color:var(--ink);border-bottom-color:var(--accent)}
.nav .cnt{font:11px var(--mono);padding:1px 6px;border-radius:999px;background:var(--surface-2);color:var(--ink-3)}
.nav .cnt.bad{background:var(--fail-bg);color:var(--fail)}
.nav .mini-verdict{margin-left:auto;font-size:12px;color:var(--ink-3);display:none}
.view{display:none} .view.on{display:block}
.view-pad{max-width:1400px;margin:0 auto;padding:22px 28px 40px}
.view-pad .grid{margin-top:0}
.main{margin-top:16px}
.list{top:64px;max-height:calc(100vh - 76px)}
/* api table */
.apitbl{width:100%;border-collapse:collapse;font-size:13px}
.apitbl th{text-align:left;font-weight:600;color:var(--ink-2);padding:8px 10px;border-bottom:1px solid var(--line);font-size:12px;position:sticky;top:44px;background:var(--surface)}
.apitbl td{padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:middle}
.apitbl tr:hover td{background:var(--surface-2)} .apitbl tr{cursor:pointer}
.apitbl .u{font:12px var(--mono);max-width:520px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.apitbl .t{color:var(--ink-3);font-size:12px;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.api-stats{display:flex;gap:16px;margin-bottom:14px;font-size:13px;color:var(--ink-2)} .api-stats b{color:var(--ink);font-variant-numeric:tabular-nums}
.api-stats .bad b{color:var(--fail)}
@media (max-width:700px){.nav{overflow-x:auto;padding:0 12px} .nav button{padding:10px 10px;white-space:nowrap}}
@media print{.nav{display:none} .view{display:block!important}}

/* verdict row with donut */
.vrow{display:flex;align-items:center;gap:32px;flex-wrap:wrap}
.vrow .vleft{flex:1;min-width:280px}
.vrow .donut{gap:14px} .vrow .donut svg{width:96px;height:96px}
.vrow .donut .c{font-size:17px} .vrow .donut .cl{font-size:8px}
.vrow .donut .legend{font-size:12px;gap:2px 8px}
/* breakdown tabs */
.bk-tabs{display:flex;gap:2px;flex-wrap:wrap;margin:-4px 0 14px}
.bk-tabs button{padding:5px 10px;font-size:12px;border-radius:999px;color:var(--ink-2)}
.bk-tabs button:hover{background:var(--surface-2)} .bk-tabs button[aria-selected=true]{background:var(--ink);color:var(--bg)}
.dim .row{grid-template-columns:110px 1fr 56px}
.attn .proj{font:10px var(--mono);color:var(--ink-3);background:var(--surface-2);padding:1px 5px;border-radius:3px;margin-left:6px}
.card.tight{padding:14px 20px}

/* outcome stripe above header */
.stripe{display:flex;height:4px} .stripe i{display:block;height:100%}
.hdr{border-top:0}
.hdr .ctl{display:flex;gap:6px;align-items:center}
.hdr select.pal{padding:6px 8px;border:1px solid var(--line);border-radius:var(--radius);background:var(--surface);font-size:12px;color:var(--ink-2)}
.btn{display:inline-flex;align-items:center;gap:6px;padding:7px 11px;border:1px solid var(--line);border-radius:var(--radius);font-size:12px;color:var(--ink-2);background:var(--surface)}
.btn:hover{border-color:var(--accent);color:var(--ink)} .btn.primary{background:var(--accent);color:var(--accent-ink);border-color:var(--accent)}
.btn.done{border-color:var(--pass);color:var(--pass)}
/* verdict */
.verdict .big{font-variant-numeric:tabular-nums;font-size:40px;letter-spacing:-.03em}
.verdict .big small{font-size:18px;font-weight:500;color:var(--ink-3);letter-spacing:0;margin-left:2px}
.pills{margin-top:18px}
.pill[aria-pressed=true]{background:var(--ink);color:var(--bg);border-color:var(--ink)} .pill[aria-pressed=true] .n{color:var(--bg)}
/* cards: status rail on left */
.card{position:relative;box-shadow:none}
.card.warn-rail::before,.card.fail-rail::before{content:"";position:absolute;left:0;top:10px;bottom:10px;width:3px;border-radius:0 2px 2px 0;background:var(--fail)}
.card.warn-rail::before{background:var(--flaky)}
.card h2{letter-spacing:.01em}
.badge.flaky{color:var(--flaky-ink)}
/* donut with gaps */
.donut svg circle{stroke-linecap:butt}
/* failure clusters */
.clu{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.clu li{border:1px solid var(--line);border-radius:var(--radius);padding:8px 10px}
.clu .msg{font:12px/1.45 var(--mono);white-space:pre-wrap;word-break:break-word;color:var(--ink);max-height:3em;overflow:hidden}
.clu .who{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px}
.clu .who button{font-size:11px;padding:2px 7px;border-radius:999px;background:var(--fail-bg);color:var(--fail)} .clu .who button:hover{outline:1px solid var(--fail)}
.clu .n{font-size:12px;color:var(--ink-3);margin-left:auto}
.clu .top{display:flex;gap:8px;align-items:baseline}
/* detail actions */
.detail .actions{display:flex;gap:6px;margin-left:auto}
.detail .titlebar{display:flex;align-items:flex-start;gap:10px}
.kbd{font:11px var(--mono);border:1px solid var(--line);border-radius:3px;padding:0 4px;color:var(--ink-3)}
.hint-kbd{font-size:11px;color:var(--ink-3);padding:8px 12px;border-top:1px solid var(--line)}
/* toast */
.toast{position:fixed;bottom:18px;left:50%;transform:translateX(-50%);background:var(--ink);color:var(--bg);padding:8px 14px;border-radius:999px;font-size:13px;z-index:20}
/* print */
@media print{ .hdr .ctl,.tools,.strip-cap,.hint-kbd,.detail .actions{display:none} .main{grid-template-columns:1fr} .list{position:static;max-height:none;border:0} .items{overflow:visible} body{background:#fff} .card{break-inside:avoid} }

/* ---------- header ---------- */
.hdr{display:flex;align-items:center;gap:16px;padding:14px 28px;border-bottom:1px solid var(--line);background:var(--surface)}
.hdr img{height:28px}
.hdr h1{font-size:16px;font-weight:600;margin:0}
.hdr .hmeta{display:flex;gap:6px;flex-wrap:wrap;margin-left:8px}
.chip{font:12px/1 var(--mono);padding:5px 8px;border-radius:4px;background:var(--surface-2);color:var(--ink-2)}
.chip b{color:var(--ink);font-weight:500}
.hdr .spacer{flex:1}
.hdr .when{color:var(--ink-3);font-size:12px}
.tbtn{width:32px;height:32px;border-radius:var(--radius);border:1px solid var(--line);display:grid;place-items:center;color:var(--ink-2)}
.tbtn:hover{background:var(--surface-2)}

/* ---------- summary ---------- */
.sum{padding:28px 28px 20px;max-width:1400px;margin:0 auto}
.verdict{display:flex;align-items:baseline;gap:14px;flex-wrap:wrap}
.verdict .big{font-size:34px;font-weight:600;letter-spacing:-.02em;line-height:1.1}
.verdict .big.ok{color:var(--pass)} .verdict .big.bad{color:var(--fail)}
.verdict .sub{font-size:15px;color:var(--ink-2)}
.pills{display:flex;gap:8px;margin-top:16px;flex-wrap:wrap}
.pill{display:inline-flex;align-items:center;gap:8px;padding:6px 12px 6px 8px;border:1px solid var(--line);border-radius:999px;background:var(--surface);font-size:13px;color:var(--ink-2)}
.pill .n{font-weight:600;color:var(--ink);font-variant-numeric:tabular-nums}
.pill .dot{width:8px;height:8px;border-radius:50%}
.pill[aria-pressed=true]{border-color:var(--ink);color:var(--ink)}
.pill:hover{background:var(--surface-2)}

/* run strip: the hero */
.strip{margin-top:22px;display:grid;grid-template-columns:repeat(auto-fill,14px);gap:3px}
.cell{width:14px;height:20px;border-radius:3px;background:var(--skip);transition:transform .08s}
.cell.passed{background:var(--pass)} .cell.failed,.cell.timedOut,.cell.interrupted{background:var(--fail)} .cell.flaky{background:var(--flaky)}
.cell:hover{transform:scaleY(1.25)} .cell.dim{opacity:.18}
.strip-cap{margin-top:8px;font-size:12px;color:var(--ink-3)}

/* widgets row */
.widgets{display:grid;grid-template-columns:2fr 1fr;gap:16px;margin-top:22px}
@media (max-width:900px){.widgets{grid-template-columns:1fr}}
.card{background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:18px 20px}
.card h2{font-size:11.5px;font-weight:600;margin:0 0 14px;color:var(--ink-3);text-transform:uppercase;letter-spacing:.06em}
.tl{width:100%;height:auto;display:block}
.tl rect.r{rx:2}
.tl .lane{fill:var(--surface-2)}
.tl text{font:11px var(--mono);fill:var(--ink-3)}
.slow{list-style:none;margin:0;padding:0}
.slow li{display:flex;gap:10px;align-items:center;padding:6px 0;border-top:1px solid var(--line);font-size:13px}
.slow li:first-child{border-top:0}
.slow .bar{height:6px;border-radius:3px;background:var(--accent);opacity:.7}
.slow .t{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.slow .d{font:12px var(--mono);color:var(--ink-3)}
.slow button{text-align:left;width:100%;display:flex;gap:10px;align-items:center}
.slow button:hover .t{color:var(--accent)}
.proj{display:flex;flex-direction:column;gap:8px}
.proj .row{display:flex;align-items:center;gap:10px;font-size:13px}
.proj .name{width:110px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.proj .bar{flex:1;height:10px;display:flex;border-radius:3px;overflow:hidden;background:var(--skip-bg)}
.proj .bar i{display:block;height:100%}
.section{margin-top:16px}
.section .body{color:var(--ink-2)}

/* ---------- main split ---------- */
.main{display:grid;grid-template-columns:380px 1fr;max-width:1400px;margin:8px auto 40px;padding:0 28px;gap:16px;min-height:60vh}
@media (max-width:900px){.main{grid-template-columns:1fr}}
.list{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);display:flex;flex-direction:column;overflow:hidden;position:sticky;top:12px;max-height:calc(100vh - 24px)}
.tools{padding:10px;border-bottom:1px solid var(--line);display:flex;gap:8px;flex-wrap:wrap}
.tools input{flex:1;min-width:120px;padding:7px 10px;border:1px solid var(--line);border-radius:var(--radius);background:var(--bg)}
.tools select{padding:7px 8px;border:1px solid var(--line);border-radius:var(--radius);background:var(--bg)}
.items{overflow:auto;flex:1}
.file{padding:10px 12px 4px;font:12px var(--mono);color:var(--ink-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;position:sticky;top:0;background:var(--surface)}
.item{display:flex;gap:10px;align-items:flex-start;width:100%;text-align:left;padding:8px 12px;border-left:3px solid transparent}
.item:hover{background:var(--surface-2)}
.item[aria-current=true]{background:var(--surface-2);border-left-color:var(--accent)}
.item .st{width:10px;height:10px;border-radius:50%;margin-top:5px;flex:none}
.st.passed{background:var(--pass)} .st.failed,.st.timedOut,.st.interrupted{background:var(--fail)} .st.skipped{background:var(--skip)} .st.flaky{background:var(--flaky)}
.item .tt{flex:1;min-width:0}
.item .tt .p{font-size:11px;color:var(--ink-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.item .tt .n{font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.item .d{font:11px var(--mono);color:var(--ink-3);margin-top:3px}
.empty{padding:40px 20px;text-align:center;color:var(--ink-3)}
.nudge{font-size:var(--fs-s);color:var(--ink-2);background:var(--surface-2);border:1px dashed var(--line);border-radius:var(--radius);padding:10px 12px;margin-bottom:10px;line-height:1.5} .nudge code{font-family:var(--mono);font-size:12px} .nudge b{color:var(--ink)}

/* ---------- detail ---------- */
.detail{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:22px;min-width:0}
.crumb{font-size:12px;color:var(--ink-3)} .crumb span+span::before{content:" / ";color:var(--line)}
.detail h3{font-size:20px;font-weight:600;margin:6px 0 10px;letter-spacing:-.01em}
.badges{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:18px}
.badge{font-size:12px;padding:3px 9px;border-radius:999px;font-weight:500}
.badge.passed{background:var(--pass-bg);color:var(--pass)} .badge.failed,.badge.timedOut,.badge.interrupted{background:var(--fail-bg);color:var(--fail)}
.badge.skipped{background:var(--skip-bg);color:var(--ink-2)} .badge.flaky{background:var(--flaky-bg);color:#9A6A00}
.badge.tag{background:var(--surface-2);color:var(--ink-2);font-family:var(--mono)}
.loc{font:12px var(--mono);color:var(--ink-3)}
.tabs{display:flex;gap:4px;border-bottom:1px solid var(--line);margin-bottom:16px}
.tab{padding:8px 12px;font-size:13px;color:var(--ink-2);border-bottom:2px solid transparent;margin-bottom:-1px}
.tab[aria-selected=true]{color:var(--ink);border-bottom-color:var(--accent)}
.detail h4{font-size:13px;font-weight:600;color:var(--ink-2);margin:20px 0 8px}
.err{background:var(--fail-bg);border:1px solid var(--line);padding:12px 14px;border-radius:var(--radius);font:12.5px/1.55 var(--mono);white-space:pre-wrap;word-break:break-word;color:var(--ink)}
.err+.err{margin-top:10px}
.err details{margin-top:8px} .err summary{cursor:pointer;color:var(--ink-2);font-family:var(--sans);font-size:12px}
.err .stack{color:var(--ink-2);margin-top:6px}
.steps{list-style:none;margin:0;padding:0}
.steps ul{list-style:none;margin:0;padding-left:18px;border-left:1px solid var(--line)}
.step{display:flex;gap:8px;align-items:center;padding:4px 6px;border-radius:4px;font-size:13px}
.step:hover{background:var(--surface-2)}
.step .tw{width:14px;color:var(--ink-3);font-size:10px;text-align:center;flex:none}
.step .cat{font:11px var(--mono);color:var(--ink-3);background:var(--surface-2);padding:1px 5px;border-radius:3px}
.step .t{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.step .d{font:11px var(--mono);color:var(--ink-3)}
.step.bad{color:var(--fail)} .step.bad .t{font-weight:500}
.step .e{font:12px var(--mono);color:var(--fail);padding:2px 0 6px 28px;white-space:pre-wrap}
li.collapsed>ul{display:none}
.att{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px}
.att figure{margin:0;border:1px solid var(--line);border-radius:var(--radius);overflow:hidden;background:var(--surface-2)}
.att img{width:100%;display:block;aspect-ratio:16/10;object-fit:cover;cursor:zoom-in}
.att figcaption{font:11px var(--mono);padding:6px 8px;color:var(--ink-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.att .file{padding:12px;position:static;background:none}
.att .file a{font:12px var(--mono)}
.txt{background:var(--surface-2);padding:10px 12px;border-radius:var(--radius);font:12px/1.5 var(--mono);white-space:pre-wrap;max-height:260px;overflow:auto}
.lb{position:fixed;inset:0;background:rgba(0,0,0,.85);display:grid;place-items:center;z-index:10;cursor:zoom-out}
.bugdlg{position:fixed;inset:0;background:rgba(10,20,40,.55);display:grid;place-items:center;z-index:11;padding:20px}
.bug-box{background:var(--surface);color:var(--ink);border-radius:12px;width:min(860px,100%);max-height:92vh;display:flex;flex-direction:column;box-shadow:0 30px 80px -20px rgba(0,0,0,.5);border:1px solid var(--line)}
.bug-head{display:flex;align-items:center;gap:12px;padding:14px 18px;border-bottom:1px solid var(--line)} .bug-head h3{margin:0;font-size:16px} .bug-head .hint{flex:1;color:var(--ink-3);font-size:12px}
.bug-tools{display:flex;align-items:center;gap:8px;padding:10px 18px;border-bottom:1px solid var(--line)} .bug-tools .grow{flex:1}
.bug-ta{flex:1;min-height:360px;margin:0;padding:14px 18px;border:0;resize:none;background:var(--surface-2);color:var(--ink);font:12.5px/1.55 var(--mono);outline:none;border-radius:0 0 12px 12px;white-space:pre}
.btn.primary{background:var(--accent);border-color:var(--accent);color:#fff} .btn.primary.done{background:var(--pass);border-color:var(--pass)}
.detail .actions .btn{cursor:pointer}
.lb img{max-width:95vw;max-height:95vh;border-radius:4px}
.kv{display:grid;grid-template-columns:auto 1fr;gap:4px 14px;font-size:13px}
.kv dt{color:var(--ink-3)} .kv dd{margin:0}

/* overview grid */
.grid{display:grid;grid-template-columns:repeat(12,1fr);gap:14px;margin-top:22px;align-items:start}
.grid>.card{grid-column:span 4;min-width:0}
.grid>.card.w6{grid-column:span 6} .grid>.card.w8{grid-column:span 8} .grid>.card.w12{grid-column:span 12}
@media (max-width:1100px){.grid>.card,.grid>.card.w6,.grid>.card.w8{grid-column:span 6}}
@media (max-width:760px){.grid>.card,.grid>.card.w6,.grid>.card.w8,.grid>.card.w12{grid-column:span 12}}
.card h2 .hint{font-weight:400;color:var(--ink-3);margin-left:8px;text-transform:none;letter-spacing:0;font-size:12px}
/* donut */
.donut{display:flex;align-items:center;gap:18px}
.donut svg{width:132px;height:132px;flex:none}
.donut .legend{display:grid;grid-template-columns:auto auto auto;gap:4px 10px;font-size:13px;align-items:center}
.donut .legend .dot{width:10px;height:10px;border-radius:2px}
.donut .legend .n{font-variant-numeric:tabular-nums;font-weight:600;text-align:right}
.donut .legend .pc{color:var(--ink-3);font:12px var(--mono)}
.donut .legend button{display:contents} .donut .legend button:hover span{color:var(--accent)}
.donut .c{font-size:22px;font-weight:600;fill:var(--ink)} .donut .cl{font-size:10px;fill:var(--ink-3)}
/* stacked bars (dimensions) */
.dim{display:flex;flex-direction:column;gap:9px}
.dim .row{display:grid;grid-template-columns:76px 1fr 44px;gap:10px;align-items:center;font-size:13px;width:100%;text-align:left;border-radius:4px;padding:2px 4px;margin:-2px -4px}
.dim .row:hover{background:var(--surface-2)}
.dim .row[aria-pressed=true]{background:var(--surface-2);outline:1px solid var(--line)}
.dim .k{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dim .bar{height:14px;display:flex;border-radius:3px;overflow:hidden;background:var(--skip-bg)}
.dim .bar i{display:block;height:100%}
.dim .n{font:12px var(--mono);color:var(--ink-3);text-align:right}
.dim .n b{color:var(--fail);font-weight:600}
.legend-inline{display:flex;gap:12px;font-size:11px;color:var(--ink-3);margin-top:10px}
.legend-inline span::before{content:"";display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:5px;background:var(--c)}
/* histogram */
.hist{display:flex;align-items:flex-end;gap:6px;height:110px;padding-top:6px}
.hist .b{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;gap:4px}
.hist .b i{display:block;width:100%;border-radius:3px 3px 0 0;background:var(--accent);opacity:.75;min-height:2px}
.hist .b i.slow{background:var(--flaky)}
.hist .b .l{font:10px var(--mono);color:var(--ink-3);white-space:nowrap}
.hist .b .v{font:11px var(--mono);color:var(--ink-2)}
/* attention */
.attn{list-style:none;margin:0;padding:0}
.attn li{border-top:1px solid var(--line)} .attn li:first-child{border-top:0}
.attn button{width:100%;text-align:left;padding:8px 0;display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:center}
.attn button:hover .t{color:var(--accent)}
.attn .t{font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.attn .m{font:11px var(--mono);color:var(--ink-3)}
.attn .sev{font-size:11px;padding:2px 7px;border-radius:999px;font-weight:600;background:var(--fail-bg);color:var(--fail);white-space:nowrap}
.attn .ok{color:var(--pass);font-size:13px;padding:6px 0}
/* tags */
.tags{display:flex;flex-wrap:wrap;gap:6px}
.tags button{display:inline-flex;align-items:center;gap:6px;font:12px var(--mono);padding:4px 8px;border:1px solid var(--line);border-radius:4px;background:var(--surface)}
.tags button:hover{border-color:var(--accent)}
.tags .bar{width:40px;height:5px;border-radius:3px;background:var(--skip-bg);display:flex;overflow:hidden}
.tags .bar i{display:block;height:100%}
/* meta chips in detail */
.metas{display:flex;flex-wrap:wrap;gap:6px;margin:-8px 0 18px}
.meta{display:inline-flex;align-items:center;gap:6px;font-size:12px;padding:4px 9px;border:1px solid var(--line);border-radius:4px;background:var(--surface-2)}
.meta .k{color:var(--ink-3)} .meta .v{font-weight:500}
.meta.priority .v,.meta.severity .v{color:var(--fail)}
.meta.priority.low .v,.meta.severity.low .v{color:var(--ink)}

/* videos, traces, visual compare */
.vids{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px}
.vids figure{margin:0;border:1px solid var(--line);border-radius:var(--radius);overflow:hidden;background:#000}
.vids video{width:100%;display:block;max-height:420px;background:#000}
.vids figcaption{font:11px var(--mono);padding:6px 8px;color:var(--ink-2);background:var(--surface-2)}
.trace-card{border:1px solid var(--line);border-radius:var(--radius);padding:12px 14px;display:flex;flex-direction:column;gap:8px;font-size:13px}
.trace-how{color:var(--ink-2);font-size:12px} .trace-how code{font:12px var(--mono);background:var(--surface-2);padding:1px 5px;border-radius:3px}
.trace-card .dl{align-self:flex-start;font-size:12px;padding:6px 10px;border:1px solid var(--accent);border-radius:var(--radius);text-decoration:none}
.trace-card .dl:hover{background:var(--accent);color:#fff}
.cmp-tabs{display:flex;gap:4px;border-bottom:1px solid var(--line);margin-bottom:12px}
.cmp-slider{position:relative;overflow:hidden;border:1px solid var(--line);border-radius:var(--radius);background:var(--surface-2);user-select:none}
.cmp-slider img{width:100%;display:block}
.cmp-top{position:absolute;inset:0 auto 0 0;overflow:hidden;width:50%} .cmp-top img{width:auto;height:100%;max-width:none}
.cmp-slider{aspect-ratio:auto}
.cmp-handle{position:absolute;top:0;bottom:0;width:2px;background:var(--accent);left:50%;pointer-events:none}
.cmp-handle::after{content:"⇔";position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:var(--accent);color:#fff;border-radius:999px;width:26px;height:26px;display:grid;place-items:center;font-size:13px}
.cmp input[type=range]{width:100%;margin:8px 0 0;accent-color:var(--accent)}
.cmp-cap{display:flex;justify-content:space-between;font:11px var(--mono);color:var(--ink-3)}
.cmp-side{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px}
.cmp-side figure,.cmp-one{margin:0;border:1px solid var(--line);border-radius:var(--radius);overflow:hidden;background:var(--surface-2)}
.cmp-side img,.cmp-one img{width:100%;display:block;cursor:zoom-in}
.cmp-side figcaption{font:11px var(--mono);padding:5px 8px;color:var(--ink-2)}

/* project block */
.hdr .proj-blk{display:flex;flex-direction:column;line-height:1.25}
.hdr .proj-blk h1{font-size:15px}
.hdr .proj-blk .sub{font-size:12px;color:var(--ink-3)} .hdr .proj-blk .sub a{color:var(--ink-3)}
/* trend */
.trend svg{width:100%;height:auto;display:block} .trend text{font:10px var(--mono);fill:var(--ink-3)}
.trend .grid line{stroke:var(--line)} .trend .pass{fill:none;stroke:var(--pass);stroke-width:2}
.trend .fail{fill:none;stroke:var(--fail);stroke-width:1.5;stroke-dasharray:3 3}
.trend .pt{fill:var(--surface);stroke:var(--pass);stroke-width:2} .trend .now{fill:var(--accent);stroke:var(--accent)}
.trend .dur{fill:var(--accent);opacity:.18}
.trend-cap{display:flex;gap:14px;font-size:11px;color:var(--ink-3);margin-top:8px}
/* workers */
.wk{display:flex;flex-direction:column;gap:8px}
.wk .row{display:grid;grid-template-columns:36px 1fr 120px;gap:10px;align-items:center;font-size:12px}
.wk .k{font:12px var(--mono);color:var(--ink-3)} .wk .bar{height:12px;display:flex;border-radius:3px;overflow:hidden;background:var(--skip-bg)} .wk .bar i{display:block;height:100%}
.wk .n{font:11px var(--mono);color:var(--ink-3);text-align:right}
.wk-sum{font-size:13px;color:var(--ink-2);margin-bottom:10px}
/* list: group toggle + folder tree */
.tools .seg,.bug-tools .seg{display:inline-flex;border:1px solid var(--line);border-radius:var(--radius);overflow:hidden}
.tools .seg button,.bug-tools .seg button{padding:6px 10px;font-size:12px;color:var(--ink-2);cursor:pointer} .tools .seg button[aria-pressed=true],.bug-tools .seg button[aria-pressed=true]{background:var(--surface-2);color:var(--ink)}
.folder{display:flex;align-items:center;gap:6px;padding:8px 12px 4px;font:12px var(--mono);color:var(--ink-2);width:100%;text-align:left}
.folder .cnt{margin-left:auto;display:flex;gap:6px} .folder .cnt b{color:var(--fail)} .folder .cnt span{color:var(--ink-3)}
.folder .tw{font-size:9px;color:var(--ink-3)}
.folder+.folder,.folder+.file{margin-left:0}
.suite{display:flex;align-items:center;gap:6px;padding:7px 12px 3px;font-size:12px;color:var(--ink-2)} .suite .sn{font-weight:500;color:var(--ink)} .suite .tw{font-size:9px;color:var(--ink-3)} .suite .cnt{margin-left:auto;display:flex;gap:6px} .suite .cnt b{color:var(--fail)} .suite .cnt span{color:var(--ink-3)}
.tree-indent{padding-left:14px;border-left:1px solid var(--line);margin-left:16px}
.file-row{display:flex;align-items:center;gap:6px;padding:6px 12px 2px;font:12px var(--mono);color:var(--ink-3);width:100%;text-align:left}
.file-row .mini{display:flex;gap:2px;margin-left:auto} .file-row .mini i{width:6px;height:6px;border-radius:50%;display:block}
/* links in meta */
.meta a{color:var(--accent);text-decoration:none;font-weight:500} .meta a:hover{text-decoration:underline}
.meta a::after{content:"↗";font-size:10px;margin-left:3px;color:var(--ink-3)}
/* logs */
.logs{background:var(--surface-2);border-radius:var(--radius);padding:8px 0;font:12px/1.55 var(--mono);max-height:320px;overflow:auto}
.logs .ln{display:grid;grid-template-columns:78px 1fr;gap:12px;padding:1px 12px}
.logs .ln:hover{background:var(--surface)} .logs .ts{color:var(--ink-3)} .logs .lm{white-space:pre-wrap;word-break:break-word}
.logs .ln.err .lm{color:var(--fail)} .logs .ln.warn .lm{color:#9A6A00} .logs.plain .ln{grid-template-columns:1fr}
/* data tables */
.tbl-wrap{overflow:auto;border:1px solid var(--line);border-radius:var(--radius);max-height:360px}
table.tbl{border-collapse:collapse;font-size:12.5px;width:100%;min-width:100%}
.tbl th{position:sticky;top:0;background:var(--surface-2);text-align:left;font-weight:600;padding:7px 10px;border-bottom:1px solid var(--line);white-space:nowrap}
.tbl td{padding:6px 10px;border-bottom:1px solid var(--line);font-family:var(--mono);font-size:12px;white-space:nowrap;max-width:360px;overflow:hidden;text-overflow:ellipsis}
.tbl tr:last-child td{border-bottom:0} .tbl td.mask{color:var(--ink-3);letter-spacing:1px}
.kv2{display:grid;grid-template-columns:max-content 1fr;gap:4px 16px;font-size:13px;border:1px solid var(--line);border-radius:var(--radius);padding:10px 12px}
.kv2 dt{color:var(--ink-3)} .kv2 dd{margin:0;font-family:var(--mono);font-size:12px;word-break:break-all}
.mask-note{font-size:11px;color:var(--ink-3);margin-top:6px}
/* api panel */
.api{border:1px solid var(--line);border-radius:var(--radius);margin-bottom:10px;overflow:hidden}
.api-head{display:flex;align-items:center;gap:10px;padding:9px 12px;background:var(--surface-2);cursor:pointer;width:100%;text-align:left}
.api-head .m{font:11px/1 var(--mono);font-weight:600;padding:4px 7px;border-radius:3px;color:#fff;background:var(--ink-3)}
.api-head .m.GET{background:#2A7FBF} .api-head .m.POST{background:var(--pass)} .api-head .m.PUT,.api-head .m.PATCH{background:#C77D14} .api-head .m.DELETE{background:var(--fail)}
.api-head .u{flex:1;font:12px var(--mono);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.api-head .sc{font:12px var(--mono);font-weight:600} .api-head .sc.ok{color:var(--pass)} .api-head .sc.bad{color:var(--fail)} .api-head .sc.warn{color:#9A6A00}
.api-head .d{font:11px var(--mono);color:var(--ink-3)}
.api-body{display:grid;grid-template-columns:1fr 1fr;gap:0}
@media (max-width:900px){.api-body{grid-template-columns:1fr}}
.api-col{padding:10px 12px;min-width:0} .api-col+.api-col{border-left:1px solid var(--line)}
.api-col h5{margin:0 0 6px;font-size:11px;font-weight:600;color:var(--ink-3)}
.api-col pre{margin:0 0 10px;background:var(--surface-2);padding:8px 10px;border-radius:4px;font:11.5px/1.5 var(--mono);white-space:pre-wrap;word-break:break-all;max-height:260px;overflow:auto}
.api.collapsed .api-body,.api.collapsed .api-tools{display:none}
.api-tools{display:flex;gap:8px;padding:8px 12px;border-top:1px solid var(--line);background:var(--surface)} .api-tools .btn{padding:5px 10px;cursor:pointer} .api-tools .btn.done{color:var(--pass);border-color:var(--pass)}
/* bdd */
.step .kw{font-weight:600;color:var(--accent);margin-right:4px} .step .kw.and{color:var(--ink-3)}
.badge.scenario{background:var(--surface-2);color:var(--ink-2)}
.tools .dims{display:flex;gap:6px;flex-wrap:wrap;width:100%}
.tools .dims select{flex:1;min-width:90px}

/* ---------- blue & white skin ---------- */
:root{--radius:10px}
html,body{-webkit-font-smoothing:antialiased}
.card,.list,.detail{border-radius:var(--radius);box-shadow:var(--shadow)}
.card h2{color:var(--accent-2);font-size:12px;font-weight:600;letter-spacing:.07em;display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
.card h2 .hint{margin-left:0}
.card h2 .hint.badge{margin-left:auto;font:600 11px var(--mono);padding:2px 8px;border-radius:999px;background:var(--fail-bg);color:var(--fail)}
.card.fail-rail::before,.card.warn-rail::before{display:none}
/* top band: stripe + header + nav on a deep accent gradient */
.band{background:linear-gradient(115deg,var(--accent-deep) 0%,var(--accent-2) 55%,var(--band-end) 100%);color:#fff;position:relative}
.band::after{content:"";position:absolute;inset:0;background:radial-gradient(700px 260px at 85% -40%,rgba(255,255,255,.18),transparent 60%),radial-gradient(400px 200px at 10% 120%,rgba(255,255,255,.10),transparent 60%);pointer-events:none}
.band>*{position:relative;z-index:1}
.stripe{opacity:.9}
.hdr{background:transparent;border-bottom:0;color:#fff;max-width:1400px;margin:0 auto;padding:18px 28px 0;gap:14px}
.hdr h1,.hdr .proj-blk h1{color:#fff;font-size:20px;font-weight:600;letter-spacing:-.01em;line-height:1.2}
.hdr .proj-blk .sub,.hdr .proj-blk .sub a,.hdr .when{color:rgba(255,255,255,.78)}
.hdr .logo{width:42px;height:42px;border-radius:11px;flex:none;box-shadow:0 0 0 1px rgba(255,255,255,.35),0 6px 16px -6px rgba(0,0,0,.45)} .hdr .logo svg{width:42px;height:42px;display:block;border-radius:11px}
.hdr img.logo.brand{width:auto;max-width:180px;height:42px;object-fit:contain;border-radius:8px;background:#fff;padding:4px;box-sizing:border-box}
.hdr img{height:32px;border-radius:6px}
.hdr .chip{background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.22);color:rgba(255,255,255,.85);border-radius:999px;padding:4px 9px}
.hdr .chip b{color:#fff}
.hdr .btn{background:rgba(255,255,255,.12);border-color:rgba(255,255,255,.28);color:#fff;border-radius:9px;padding:8px 12px;font-weight:500}
.hdr .btn:hover{background:rgba(255,255,255,.2);color:#fff}
.hdr .btn.done{background:var(--pass);border-color:var(--pass);color:#fff}
.hdr select.pal{background:rgba(255,255,255,.12);border-color:rgba(255,255,255,.28);color:#fff;border-radius:9px;padding:7px 8px}
.hdr select.pal option{color:var(--ink);background:var(--surface)}
.hdr .tbtn{border-color:rgba(255,255,255,.28);background:rgba(255,255,255,.12);color:#fff;border-radius:9px;width:34px;height:34px}
.hdr .tbtn:hover{background:rgba(255,255,255,.2)}
.nav{background:transparent;border-bottom:0;max-width:1400px;margin:0 auto;padding:0 28px;gap:4px;position:static}
.nav>div{display:flex;gap:4px;margin-top:16px;overflow-x:auto;width:100%}
.nav button{padding:10px 14px 12px;font-size:13.5px;font-weight:500;color:rgba(255,255,255,.75);border-bottom:0;margin-bottom:0;border-radius:9px 9px 0 0;white-space:nowrap}
.nav button:hover{color:#fff;background:rgba(255,255,255,.1)}
.nav button[aria-selected=true]{background:var(--bg);color:var(--accent-2)}
.nav .cnt{background:rgba(255,255,255,.16);color:#fff;font-size:11.5px;padding:1px 7px}
.nav button[aria-selected=true] .cnt{background:var(--accent-tint);color:var(--accent-2)}
.nav .cnt.bad{background:var(--fail);color:#fff}
.nav button[aria-selected=true] .cnt.bad{background:var(--fail);color:#fff}
@media (max-width:700px){.nav{padding:0 16px} .hdr{padding:14px 16px 0;flex-wrap:wrap;gap:10px} .hdr h1,.hdr .proj-blk h1{font-size:17px} .hdr .when,.hdr .spacer{display:none} .hdr .hmeta{width:100%;margin-left:0} .hdr .ctl{margin-left:auto} .hdr .proj-blk{flex:1;min-width:0}}
/* KPI tiles replace the verdict row */
.sum{padding:22px 28px 20px}
.kpis{display:grid;grid-template-columns:repeat(6,1fr);gap:14px}
.kpi{position:relative;overflow:hidden;text-align:left;background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:14px 16px 14px 20px;box-shadow:var(--shadow);display:block;font-size:inherit;color:var(--ink);transition:transform .12s,box-shadow .12s}
.kpi::before{content:"";position:absolute;left:0;top:0;bottom:0;width:4px;background:var(--c,var(--accent))}
.kpi:hover{transform:translateY(-1px);box-shadow:0 2px 4px rgba(11,31,68,.06),0 14px 28px -14px rgba(26,86,219,.3)}
.kpi .l{font-size:11.5px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3)}
.kpi .v{font-size:28px;font-weight:600;line-height:1.15;letter-spacing:-.02em;margin-top:6px;color:var(--ink);font-variant-numeric:tabular-nums}
.kpi .v small{font-size:13px;font-weight:500;color:var(--ink-3);letter-spacing:0;margin-left:4px}
.kpi .d{font-size:12px;color:var(--ink-3);margin-top:4px}
.kpi .d.up{color:var(--pass)} .kpi .d.down{color:var(--fail)}
.kpi[aria-pressed=true]{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-tint),var(--shadow)}
.kpi.hero{grid-column:span 2;background:linear-gradient(135deg,var(--accent) 0%,var(--accent-2) 100%);border-color:transparent;color:#fff;display:flex;align-items:center;gap:18px;padding:16px 20px}
.kpi.hero::before{display:none}
.kpi.hero .l,.kpi.hero .d{color:rgba(255,255,255,.8)} .kpi.hero .v{color:#fff;font-size:38px} .kpi.hero .v small{color:rgba(255,255,255,.78)}
.kpi.hero .body{flex:1;min-width:0}
.kpi.hero .ring{width:84px;height:84px;flex:none} .kpi.hero .ring svg{width:84px;height:84px;display:block}
.kpi.hero .ring text{fill:#fff;font-weight:600;font-size:17px;font-family:var(--sans)}
.kpi.hero .mini{margin-top:8px;height:6px;border-radius:999px;background:rgba(255,255,255,.22);overflow:hidden;display:flex} .kpi.hero .mini i{display:block;height:100%}
.kpi.hero[aria-pressed=true]{box-shadow:0 0 0 3px var(--accent-soft),var(--shadow)}
:root[data-palette=mono] .kpi.hero{background:linear-gradient(135deg,var(--accent-2),var(--accent-deep))}
@media (max-width:1100px){.kpis{grid-template-columns:repeat(3,1fr)} .kpi.hero{grid-column:span 3}}
@media (max-width:640px){.sum{padding:16px 16px 12px} .kpis{grid-template-columns:repeat(2,1fr)} .kpi.hero{grid-column:span 2}}
/* run strip */
.strip{margin-top:18px} .cell{height:14px;border-radius:3px}
/* overview cards */
.grid{gap:16px;margin-top:18px;align-items:stretch} .grid>.card{display:flex;flex-direction:column;min-height:0} .grid>.card>h2{flex:none}
.attn button{padding:10px 6px;gap:12px;border-radius:8px;margin:0 -6px;width:calc(100% + 12px)}
.attn button:hover{background:var(--surface-2)} .attn button:hover .t{color:var(--ink)}
.attn .t{font-weight:500}
.attn .sev{font:600 11px var(--mono);padding:3px 8px;border-radius:6px}
.attn .sev.p0{background:var(--fail);color:#fff}
.attn .proj{display:inline-block;flex-direction:row;width:auto;border-radius:4px;padding:1px 6px;font-size:11px;margin-left:8px;vertical-align:1px}
.attn .m{font:12px var(--sans);color:var(--ink-3);display:inline-flex;align-items:center;gap:6px}
.attn .av{display:inline-grid;place-items:center;width:22px;height:22px;border-radius:50%;background:var(--accent-tint);color:var(--accent-2);font-size:10px;font-weight:600;text-transform:uppercase}
.clu{gap:10px}
.clu li{border-left:1px solid var(--line);border-radius:10px;padding:10px 12px}
.clu .top{align-items:flex-start} .clu .msg{font-size:12.5px}
.clu .n{font:600 11px var(--mono);padding:2px 8px;border-radius:999px;background:var(--fail-bg);color:var(--fail);white-space:nowrap}
.clu .who{gap:6px;margin-top:8px}
.clu .who button{font-size:11.5px;padding:3px 9px;background:var(--accent-tint);color:var(--accent-2)} .clu .who button:hover{outline:0;background:var(--accent-soft)}
.btn.more{margin-top:12px;border-color:var(--line-2);color:var(--accent-2);font-weight:500;font-size:12.5px;padding:7px 12px;border-radius:8px}
.bk-tabs{gap:4px;padding:4px;background:var(--surface-2);border-radius:10px;width:max-content;max-width:100%}
.bk-tabs button{padding:5px 11px;font-size:12.5px;font-weight:500;border-radius:7px}
.bk-tabs button[aria-selected=true]{background:var(--surface);color:var(--accent-2);box-shadow:0 1px 3px rgba(11,31,68,.12)}
.bk-tabs button:hover{background:var(--surface)}
.dim{gap:6px} .dim .row{padding:6px 8px;margin:0;border-radius:8px;grid-template-columns:110px 1fr 64px;gap:12px}
.dim .k{font:600 12.5px var(--mono);color:var(--ink-2)} .dim .bar{height:12px;border-radius:999px;background:var(--surface-2)}
.dim .row[aria-pressed=true]{background:var(--accent-tint);outline:0}
.legend-inline{font-size:12px;gap:14px;margin-top:12px} .legend-inline span::before{width:9px;height:9px;border-radius:3px;margin-right:6px}
.slow li{padding:9px 0} .slow button{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:start}
.slow .t{white-space:normal}
.slow .bar{display:block;height:5px;border-radius:999px;background:var(--accent-soft);opacity:1;margin-top:6px;position:relative;overflow:hidden;width:100%!important}
.slow .bar i{position:absolute;inset:0;width:var(--w);background:var(--accent);border-radius:999px}
.slow button:hover .t{color:var(--accent-2)}
.trend .grid line{stroke-dasharray:2 4} .trend text{font-size:11px}
.trend{position:relative} .trend .area{fill:var(--pass);opacity:.12;pointer-events:none} .trend .dur{fill:var(--accent);opacity:.14} .trend .hit{cursor:crosshair} .trend .hit:hover{fill:var(--accent);fill-opacity:.06} .trend .guide{stroke:var(--accent);stroke-width:1;stroke-dasharray:3 3;pointer-events:none}
.ttip{position:absolute;z-index:6;min-width:200px;max-width:240px;background:var(--surface);border:1px solid var(--line-2);border-radius:10px;box-shadow:0 10px 30px -10px rgba(11,31,68,.35);padding:10px 12px;font-size:12.5px;pointer-events:none}
.ttip .tt-h{font-weight:600;display:flex;justify-content:space-between;gap:10px;align-items:baseline} .ttip .tt-h span{font:11px var(--mono);color:var(--ink-3);font-weight:400}
.ttip .tt-big{font-size:20px;font-weight:600;margin:4px 0 6px;font-variant-numeric:tabular-nums} .ttip .tt-big small{font-size:11.5px;font-weight:400;color:var(--ink-3)}
.ttip .tt-row{display:flex;align-items:center;gap:8px;padding:2px 0;color:var(--ink-2)} .ttip .tt-row i{width:8px;height:8px;border-radius:2px;flex:none} .ttip .tt-row b{margin-left:auto;font-variant-numeric:tabular-nums;color:var(--ink)}
.trend .pass{stroke-width:2.2} .trend .pt.now{r:4.5}
.trend-cap{font-size:12px;gap:16px}
.section .body code{font:12.5px var(--mono);background:var(--accent-tint);color:var(--accent-2);padding:1px 6px;border-radius:5px}
.hist .b i{opacity:.85;border-radius:4px 4px 0 0}
.wk .bar,.proj .bar{border-radius:999px}
/* tests view */
.main{margin-top:20px}
.list{top:12px;max-height:calc(100vh - 24px)}
.tools{padding:12px;gap:8px;background:var(--surface)}
.tools input,.tools select{border-radius:8px;background:var(--bg);border-color:var(--line)}
.tools input:focus,.tools select:focus{border-color:var(--accent);outline:0;box-shadow:0 0 0 3px var(--accent-tint)}
.tools .seg,.bug-tools .seg{border-radius:8px} .tools .seg button[aria-pressed=true],.bug-tools .seg button[aria-pressed=true]{background:var(--accent-tint);color:var(--accent-2);font-weight:500}
.item{border-left-width:3px;padding:9px 12px}
.item[aria-current=true]{background:var(--accent-tint);border-left-color:var(--accent)}
.item .tt .n{font-weight:500}
.file{background:var(--surface);color:var(--accent-2);font-weight:500}
.hint-kbd{background:var(--surface-2)} .kbd{background:var(--surface);border-color:var(--line-2);border-bottom-width:2px;border-radius:5px;padding:0 5px}
.detail{padding:24px 26px}
.detail h3{font-size:21px}
.badge{font-weight:600;font-size:11.5px}
.badge.tag{font-weight:500}
.tabs{gap:6px} .tab{border-radius:8px 8px 0 0;font-weight:500}
.tab[aria-selected=true]{color:var(--accent-2);border-bottom-color:var(--accent)}
.detail h4{color:var(--accent-2);text-transform:uppercase;letter-spacing:.06em;font-size:11.5px}
.err{border-radius:8px}
.meta{border-radius:8px;background:var(--surface)}
.meta .k{text-transform:uppercase;font-size:10.5px;letter-spacing:.05em}
.step{border-radius:6px} .step .cat{border-radius:4px}
.api{border-radius:10px} .api-head .m{border-radius:5px}
.att figure,.vids figure,.trace-card,.cmp-slider,.cmp-side figure,.cmp-one,.tbl-wrap,.kv2{border-radius:10px}
/* failures / api tables */
.apitbl th{color:var(--accent-2);text-transform:uppercase;letter-spacing:.06em;font-size:11px;background:var(--surface);top:0}
.apitbl td{padding:10px} .apitbl tr:hover td{background:var(--accent-tint)}
.api-stats{gap:10px;flex-wrap:wrap} .api-stats span{background:var(--surface);border:1px solid var(--line);border-radius:999px;padding:5px 12px;box-shadow:var(--shadow)}
.api-stats b{margin-right:4px}
.view-pad{padding-top:20px}
/* misc */
.toast{background:var(--accent-2);color:#fff}
.lb img{border-radius:10px}
@media print{ .band{background:#fff!important;color:var(--ink)} .hdr h1,.hdr .proj-blk h1,.hdr .when,.hdr .proj-blk .sub{color:var(--ink)} .nav{display:none} .kpi.hero{background:var(--accent)!important} }

/* ---------- triage lists: plain, dense, table-like ---------- */
.attn-wrap{display:flex;flex-direction:column;flex:1;min-height:0}
.attn2{width:100%;border-collapse:collapse;font-size:13px}
.attn2 tr{cursor:pointer} .attn2 tr:hover td{background:var(--surface-2)} .attn2 tr:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}
.attn2 td{padding:9px 8px;border-top:1px solid var(--line);vertical-align:top} .attn2 tr:first-child td{border-top:0}
.attn2 td:first-child{border-radius:6px 0 0 6px} .attn2 td:last-child{border-radius:0 6px 6px 0}
.attn2 .pr{width:96px;white-space:nowrap;font-size:12.5px;line-height:1.35} .attn2 .pr .dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:7px}
.attn2 .pr span{font-weight:600;color:var(--ink)} .attn2 .pr small{display:block;color:var(--ink-3);font-size:11.5px;padding-left:15px}
.attn2 .tt .n{font-weight:500;color:var(--ink);line-height:1.35} .attn2 .tt .s{font-size:12px;color:var(--ink-3);margin-top:2px} .attn2 .tt .s b.new{color:var(--fail);font-weight:600} .attn2 .tt .s .rsn{color:var(--ink-2)}
.attn2 .ow{text-align:right;color:var(--ink-3);font-size:12.5px;white-space:nowrap;width:1%;padding-top:10px}
.attn-foot{margin-top:auto;padding-top:12px;border-top:1px solid var(--line)} .attn-foot button{font-size:12.5px;font-weight:500;color:var(--accent-2)} .attn-foot button:hover{text-decoration:underline}
.clu2{list-style:none;margin:0;padding:0}
.clu2 li{display:grid;grid-template-columns:44px 1fr;gap:12px;padding:11px 0;border-top:1px solid var(--line)} .clu2 li:first-child{border-top:0;padding-top:2px}
.clu2 .n{font-size:20px;font-weight:600;color:var(--fail);font-variant-numeric:tabular-nums;line-height:1.1} .clu2 .n small{display:block;font-size:10.5px;color:var(--ink-3);font-weight:500;letter-spacing:.04em;margin-top:1px}
.clu2 .b{min-width:0} .clu2 .msg{font:12.5px/1.45 var(--mono);color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.clu2 .who{font-size:12.5px;color:var(--ink-2);margin-top:4px;line-height:1.6} .clu2 .who button{color:var(--accent-2);font-weight:500} .clu2 .who button:hover{text-decoration:underline} .clu2 .who button small{color:var(--ink-3);font-weight:400;font-size:11px}
.clu2 .who .sep{color:var(--line-2);margin:0 7px} .clu2 .who .ex{color:var(--ink-3)}
@media (max-width:640px){.attn2 .ow{display:none} .attn2 .pr{width:72px} .attn2 .pr small{display:none}}
/* ---------- run status, errors outside tests, snippets ---------- */
.att-err{padding:12px 14px;background:var(--fail-bg);color:var(--ink);border-radius:8px 8px 0 0;line-height:1.5} .att-err code{font:12px var(--mono);background:var(--surface);padding:1px 5px;border-radius:4px}
.runbanner{margin-bottom:14px;padding:10px 14px;border-radius:10px;background:var(--flaky-bg);color:var(--flaky-ink);border:1px solid color-mix(in srgb,var(--flaky) 40%,transparent)}
.note{padding:10px 14px;border-radius:8px;margin-bottom:10px;border:1px solid var(--line)} .note.ok{background:var(--pass-bg);color:var(--ink)} .note.warn{background:var(--flaky-bg);color:var(--flaky-ink)}
.badge.xfail{background:var(--flaky-bg);color:var(--flaky-ink)}
.errwrap+.errwrap{margin-top:14px}
.why{border:1px solid var(--line);border-radius:var(--radius);padding:10px 14px;margin-bottom:10px;background:var(--surface)}
.why-c{font-size:12.5px;color:var(--ink);margin-bottom:2px;line-height:1.4} .why-c .why-k{margin-right:2px}
.why-l{display:flex;align-items:center;gap:8px;margin-bottom:4px} .why-k{font-size:12px;font-weight:600;color:var(--fail)} .why-a{font:11.5px var(--mono);color:var(--ink-3)}
.why-s{font-size:var(--fs);color:var(--ink);line-height:1.45} .why-h{font-size:12.5px;color:var(--ink-2);margin-top:4px;line-height:1.45}
.why.assertion .why-k,.why.visual .why-k{color:#9A6A00}
.why.script .why-k,.why.thrown .why-k,.why.file .why-k{color:var(--ink-2)}
.errloc{font-family:var(--mono);color:var(--ink-3);margin-bottom:6px} .errloc a{color:var(--accent-2);text-decoration:none} .errloc a:hover{text-decoration:underline}
.snip{margin:10px 0 0;background:var(--surface-2);border:1px solid var(--line);border-radius:8px;padding:10px 12px;font-family:var(--mono);line-height:1.55;white-space:pre;overflow:auto;color:var(--ink-2)}
/* ---------- triage extras: history, diff, export, env, heatmap ---------- */
.kpi .sp{position:absolute;right:14px;top:14px;opacity:.9} .kpi.hero .sp{right:16px;top:14px}
.kpi .sp svg{display:block}
.badge.since{background:none;padding:0;border-radius:0;font-weight:500;font-size:12.5px} .badge.since.new{color:var(--fail);font-weight:600} .badge.since.known{color:var(--ink-3)}
.since-txt{font-size:12.5px;white-space:nowrap} .since-txt.new{color:var(--fail);font-weight:600} .since-txt.known{color:var(--ink-2)}
.attn .tag.since{margin-left:8px;flex:none} .attn .t{display:flex;align-items:center;min-width:0} .attn .t .tt{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0} .attn .t .proj{flex:none}
.detail h4 .hint{margin-left:8px;font-weight:400;text-transform:none;letter-spacing:0;color:var(--ink-3);font-size:12px}
.dots{display:inline-flex;gap:3px;align-items:center;vertical-align:middle} .dots i{display:block;width:8px;height:8px;border-radius:2px;background:var(--skip-bg)}
.dots i.p{background:var(--pass)} .dots i.f{background:var(--fail)} .dots i.k{background:var(--flaky)} .dots i.s{background:var(--skip)} .dots i.n{background:transparent;border:1px solid var(--line-2)}
.badges .dots{margin-left:2px;margin-right:4px}
.flk{list-style:none;margin:0;padding:0} .flk li{border-top:1px solid var(--line)} .flk li:first-child{border-top:0}
.flk button{width:100%;text-align:left;padding:9px 4px;display:grid;grid-template-columns:1fr auto;gap:4px 12px;align-items:center}
.flk .t{font-size:13px;font-weight:500;color:var(--ink)} .flk .m{grid-column:1/-1;font-size:12px;color:var(--ink-3)}
.own{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:10px} .own li{border:1px solid var(--line);border-radius:10px;min-width:0}
.own button{width:100%;text-align:left;padding:10px 12px;display:grid;grid-template-columns:1fr auto;gap:2px 12px;align-items:center;border-radius:10px}
.own button:hover{background:var(--surface-2)}
.own .nm{font-weight:600} .own .cnts{font-size:12.5px;color:var(--ink-3);white-space:nowrap} .own .cnts b{font-weight:600}
.own .cnts b.f{color:var(--fail)} .own .cnts b.k{color:var(--flaky-ink)}
.own .ts{grid-column:1/-1;font-size:12px;color:var(--ink-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fx-tools{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:-4px} .fx-tools .fx-sum{font-size:13px;color:var(--ink-2);font-weight:500} .fx-tools .spacer{flex:1}
a.btn{text-decoration:none}
.skp{list-style:none;margin:0;padding:0} .skp li{border-top:1px solid var(--line)} .skp li:first-child{border-top:0}
.skp button{width:100%;text-align:left;padding:8px 4px;display:flex;flex-direction:column;gap:2px}
.skp .t{font-size:13px;font-weight:500;color:var(--ink)} .skp .r{font-size:12px;color:var(--ink-3)}
.kv.env{grid-template-columns:max-content 1fr;gap:8px 16px} .kv.env dt{font-size:11.5px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;padding-top:1px} .kv.env dd{font:12.5px var(--mono);word-break:break-word} .kv.env a{color:var(--accent-2)}
.hm-wrap{overflow-x:auto} .hm{border-collapse:separate;border-spacing:4px;font-size:12.5px;min-width:100%}
.hm th{font-weight:600;color:var(--ink-2);text-align:left;padding:4px 8px;white-space:nowrap} .hm thead th{font:600 11px var(--mono);color:var(--ink-3);text-align:center;letter-spacing:.03em}
.hm td{padding:0;border-radius:8px;text-align:center;min-width:90px} .hm td button{width:100%;padding:9px 8px;font-variant-numeric:tabular-nums;border-radius:8px} .hm td small{color:inherit;opacity:.65;margin-left:2px}
.hm td.ok{background:var(--pass-bg);color:var(--pass)} .hm td.warn{background:var(--flaky-bg);color:var(--flaky-ink)} .hm td.bad{background:color-mix(in srgb,var(--fail) calc(var(--a,.5)*100%),var(--surface))} .hm td b{color:inherit}
.grid>.fx-tools{grid-column:span 12}
.hm td.none{color:var(--ink-3);padding:9px 8px;background:var(--surface-2)}
.hm td button:hover{outline:2px solid var(--accent);outline-offset:-2px}
.ediff{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px}
.ediff .side{border:1px solid var(--line);border-radius:8px;overflow:hidden}
.ediff .lbl{font:600 11px var(--mono);letter-spacing:.04em;padding:6px 10px;border-bottom:1px solid var(--line)}
.ediff .exp .lbl{background:var(--pass-bg);color:var(--pass)} .ediff .rcv .lbl{background:var(--fail-bg);color:var(--fail)}
.ediff .val{font:12.5px/1.6 var(--mono);padding:10px 12px;white-space:pre-wrap;word-break:break-word;color:var(--ink)}
.ediff mark{border-radius:3px;padding:0 1px;color:inherit} .ediff mark.del{background:var(--pass-bg);text-decoration:line-through;text-decoration-color:var(--pass)} .ediff mark.ins{background:var(--fail-bg);box-shadow:inset 0 -2px var(--fail)}
.ediff.lines{display:block;border:1px solid var(--line);border-radius:8px;overflow:hidden;font:12.5px/1.55 var(--mono);white-space:pre-wrap;word-break:break-word}
.ediff.lines .ln{padding:1px 12px} .ediff.lines .ln.exp{background:var(--pass-bg);color:var(--pass)} .ediff.lines .ln.rcv{background:var(--fail-bg);color:var(--fail)} .ediff.lines .ln.hunk{color:var(--ink-3)}
.errfull{margin-bottom:10px} .errfull summary{cursor:pointer;font-size:12px;color:var(--ink-2);margin-bottom:6px}
.step .tb{width:96px;height:6px;border-radius:999px;background:var(--surface-2);overflow:hidden;flex:none} .step .tb i{display:block;height:100%;background:var(--accent);border-radius:999px;opacity:.85} .step .tb i.slow{background:var(--flaky);opacity:1}
@media (max-width:700px){.ediff{grid-template-columns:1fr} .step .tb{width:48px} .kpi .sp{display:none}}
@media print{.fx-tools .btn{display:none}}

/* ---------- typography system: 3 sizes, sentence-case headings, weight for hierarchy, mono only for data ---------- */
:root{--fs:13.5px;--fs-s:12px;--fs-n:28px;--fs-n2:20px}
html,body{font-size:var(--fs)}
/* sizes: everything secondary is 12px, everything primary is 13.5px */
.hint,.card h2 .hint,.strip-cap,.legend-inline,.trend-cap,.kpi .l,.kpi .d,.chip,.hdr .when,.hdr .proj-blk .sub,.nav .cnt,.badge,.badge.tag,.badge.since,.since-txt,.loc,.crumb,.meta,.meta .k,.item .tt .p,.item .d,.file,.folder,.file-row,.kbd,.hint-kbd,.step .cat,.step .d,.step .e,.att figcaption,.vids figcaption,.cmp-cap,.cmp-side figcaption,.api-head .m,.api-head .d,.api-head .sc,.api-col h5,.api-col pre,.hist .l,.hist .v,.wk .k,.wk .n,.wk-sum,.dim .n,.dim .k,.tags button,.mask-note,.trace-how,.trace-how code,.tbl td,.kv2 dd,.logs,.txt,.apitbl th,.apitbl .u,.apitbl .t,.attn2 .pr,.attn2 .pr small,.attn2 .tt .s,.attn2 .ow,.clu2 .n small,.clu2 .msg,.clu2 .who,.clu2 .who button small,.flk .m,.skp .r,.own .cnts,.own .ts,.kv.env dt,.kv.env dd,.hm thead th,.hm td button,.ediff .lbl,.ediff .val,.ediff.lines,.errfull summary,.ttip,.ttip .tt-h span,.ttip .tt-big small,.tt-row,.fx-tools .fx-sum,.attn-foot button,.btn,.hdr .btn,.hdr select.pal,.bk-tabs button,.tools .seg button,.tools input,.tools select,.detail .actions .btn,.section .body code,.err summary,.err .stack,.dots+*{font-size:var(--fs-s)}
.err,.step,.tab,.nav button,.item .tt .n,.attn2,.attn2 .tt .n,.flk .t,.skp .t,.slow li,.slow .t,.own .nm,.api-stats,.apitbl,.apitbl td,.section .body,.kv,.kv2,.proj .row,.detail h4,.tools input,.tools select,.clu2 .who,.ttip .tt-h,.pill,.empty,.ok,.hm,.hm th,.trace-card,.attn-foot button,.fx-tools .fx-sum{font-size:var(--fs)}
.kpi .v,.kpi.hero .v{font-size:var(--fs-n)} .kpi .v small{font-size:var(--fs-s)}
.clu2 .n,.ttip .tt-big{font-size:var(--fs-n2)} .detail h3{font-size:20px} .hdr h1,.hdr .proj-blk h1{font-size:18px}
/* headings: sentence case, semibold, ink. Uppercase only on table headers */
.card h2,.detail h4,.kpi .l,.meta .k,.kv.env dt,.api-col h5,.ediff .lbl,.hm thead th{text-transform:none;letter-spacing:0}
.card h2{font-size:14px;font-weight:600;color:var(--ink);margin-bottom:12px}
.detail h4{font-weight:600;color:var(--ink);margin:22px 0 8px}
.kpi .l{font-weight:500;color:var(--ink-3)} .kpi.hero .l{color:rgba(255,255,255,.8)}
.meta .k,.kv.env dt,.api-col h5{font-weight:500;color:var(--ink-3)}
.apitbl th{text-transform:uppercase;letter-spacing:.05em;font-size:11.5px;font-weight:600;color:var(--ink-3)}
.hm thead th{font-weight:600;color:var(--ink-2);font-family:var(--sans)}
/* weight carries hierarchy: titles 500, body 400, numbers 600. Blue text only on links */
.attn2 .tt .n,.flk .t,.skp .t,.slow .t,.item .tt .n,.own .nm,.clu2 .who button,.attn-foot button{font-weight:500}
.kpi .v,.clu2 .n,.ttip .tt-big,.own .cnts b,.dim .n b,.api-stats b{font-weight:600}
.file{color:var(--ink-2);font-weight:500} .step .kw{color:var(--ink);font-weight:600} .step .kw.and{color:var(--ink-3);font-weight:500}
.nav button[aria-selected=true]{color:var(--ink)} .nav button[aria-selected=true] .cnt{background:var(--surface-2);color:var(--ink-2)}
.bk-tabs button[aria-selected=true],.tools .seg button[aria-pressed=true]{color:var(--ink)}
.tab[aria-selected=true]{color:var(--ink)} .section .body code{color:var(--ink-2);background:var(--surface-2)}
.ttip .tt-h{font-weight:600} .attn2 .pr span{font-weight:600}
/* mono only where the text is data: paths, ids, durations, errors, payloads */
.nav .cnt,.chip,.step .cat,.folder,.item .d,.dim .k,.wk .n,.wk-sum,.attn2 .pr,.clu2 .n small,.flk .m,.own .cnts,.ediff .lbl,.ttip .tt-h span,.tags button,.hint-kbd,.trace-how,.api-col h5,.meta .k,.kv.env dt,.apitbl th,.hm thead th,.hm td button{font-family:var(--sans)}
.chip b,.loc,.file,.file-row,.kbd,.slow .d,.step .d,.hist .l,.wk .k,.tbl td,.kv2 dd,.kv.env dd,.logs,.txt,.err,.ediff .val,.ediff.lines,.clu2 .msg,.apitbl .u,.api-head .m,.api-head .sc,.api-head .d,.api-col pre,.badge.tag,.trend text,.tl text,.attn2 .tt .s .mono,.trace-how code{font-family:var(--mono)}
.chip{font-family:var(--sans)} .chip b{font-weight:500}
`;

const JS = String.raw`
(function(){
const data = JSON.parse(document.getElementById('rl-data').textContent);
const $ = (s,el=document)=>el.querySelector(s);
const h = (tag, attrs={}, ...kids)=>{const e=document.createElement(tag);for(const [k,v] of Object.entries(attrs)){if(k==='class')e.className=v;else if(k==='html')e.innerHTML=v;else if(k.startsWith('on'))e.addEventListener(k.slice(2),v);else if(v!==false&&v!=null)e.setAttribute(k,v);}for(const k of kids.flat(Infinity)){if(k==null)continue;e.append(k.nodeType?k:document.createTextNode(k));}return e;};
const ms = n => n<1000? Math.round(n)+'ms' : n<60000 ? (n/1000).toFixed(1)+'s' : Math.floor(n/60000)+'m '+Math.round((n%60000)/1000)+'s';
const isFail = s => s==='failed'||s==='timedOut'||s==='interrupted';
const colorOf = k => k==='passed'?'var(--pass)':k==='flaky'?'var(--flaky)':k==='skipped'?'var(--skip)':'var(--fail)';
const bucket = t => isFail(t.outcome)?'failed':t.outcome;
const label = {passed:'Passed',failed:'Failed',flaky:'Flaky',skipped:'Skipped',timedOut:'Timed out',interrupted:'Interrupted'};
const HIST = data.history||[];
const HRUNS = HIST.filter(e=>e&&e.tests);                 // entries that carry per-test outcomes; the last one is this run
const PREV = HRUNS.length>1 ? HRUNS.slice(0,-1) : [];      // earlier runs only
const runLabel = e => e.label || new Date(e.time).toLocaleDateString(undefined,{month:'short',day:'numeric'});

const state = { q:'', status:'all', project:'all', dims:{}, selected:null, retry:null, group:'file', open:{}, view:'overview' };
const DIMS = data.options.dimensions.filter(d=>data.tests.some(t=>t.meta[d]));
const dimValues = d => { const vals=[...new Set(data.tests.map(t=>t.meta[d]).filter(Boolean))]; const order=(data.options.dimensionOrder[d]||[]).map(x=>x.toLowerCase()); return vals.sort((a,b)=>{ const ia=order.indexOf(a.toLowerCase()), ib=order.indexOf(b.toLowerCase()); if(ia>-1||ib>-1) return (ia===-1?99:ia)-(ib===-1?99:ib); return a.localeCompare(b); }); };
const rank = t => { const p=(t.meta.priority||'').toUpperCase(), sv=(t.meta.severity||'').toLowerCase(); const po=data.options.dimensionOrder.priority.indexOf(p), so=data.options.dimensionOrder.severity.map(x=>x.toLowerCase()).indexOf(sv); return (po===-1?9:po)*10+(so===-1?9:so); };
const params = new URLSearchParams(location.hash.slice(1));
if(params.get('t')) { state.selected = params.get('t'); state.view='tests'; }
if(params.get('view')) state.view = params.get('view');

try{ const p=localStorage.getItem('rl-palette'); if(p) document.documentElement.setAttribute('data-palette',p); const th=localStorage.getItem('rl-theme'); if(th) document.documentElement.setAttribute('data-theme',th); }catch(e){}
const app = $('#app');
app.append(h('div',{class:'band'}, stripe(), header(), nav()),
  h('div',{class:'view','data-view':'overview'}, summary()),
  h('div',{class:'view','data-view':'tests'}, main()),
  h('div',{class:'view','data-view':'failures'}, h('div',{class:'view-pad'}, failuresView())),
  h('div',{class:'view','data-view':'api'}, h('div',{class:'view-pad'}, apiView())),
  hasTimelineView()? h('div',{class:'view','data-view':'timeline'}, h('div',{class:'view-pad'}, timelineView())) : null);
select(state.selected || firstInteresting(), true);
showView(state.view);
window.addEventListener('keydown', e=>{
  if(e.key==='Escape'){const lb=$('.lb'); if(lb) lb.remove(); return;}
  const tag=(e.target.tagName||'').toLowerCase(); if(tag==='input'||tag==='select'||tag==='textarea') return;
  if(e.key==='/'){ e.preventDefault(); showView('tests'); $('.tools input').focus(); return; }
  const vk={'1':'overview','2':'tests','3':'failures','4':'api','5':'timeline'}[e.key]; if(vk&&document.querySelector('.nav button[data-view='+vk+']')){ showView(vk); return; }
  if(e.key==='f'){ state.status=state.status==='failed'?'all':'failed'; refresh(); return; }
  if(e.key==='j'||e.key==='k'){ const ids=[...document.querySelectorAll('.item')].map(i=>i.dataset.id); if(!ids.length) return; let i=ids.indexOf(state.selected); i=e.key==='j'?Math.min(ids.length-1,i+1):Math.max(0,i-1); select(ids[i]); }
});

/* ---------- header ---------- */
function setHash(){ const p=new URLSearchParams(); if(state.view!=='overview') p.set('view',state.view); if(state.selected&&state.view==='tests') p.set('t',state.selected); const hs=p.toString(); history.replaceState(null,'',hs?'#'+hs:location.pathname+location.search); }
function showView(v){
  if(!document.querySelector('.view[data-view='+v+']')) v='overview';
  state.view=v; document.querySelectorAll('.view').forEach(el=>el.classList.toggle('on',el.dataset.view===v));
  document.querySelectorAll('.nav button[data-view]').forEach(b=>b.setAttribute('aria-selected',b.dataset.view===v));
  setHash(); try{window.scrollTo(0,0);}catch(e){}
}
function nav(){
  const s=data.stats, f=s.failed+s.timedOut+s.interrupted, apiN=data.tests.reduce((a,t)=>a+t.results.reduce((b,r)=>b+r.api.length,0),0);
  const tabs=[['overview','Overview',null],['tests','Tests',s.total],['failures','Failures',f+s.flaky,f>0],['api','API',apiN],['timeline','Timeline',null]].filter(t=>(t[0]!=='api'||apiN>0)&&(t[0]!=='timeline'||hasTimelineView()));
  return h('nav',{class:'nav'}, h('div',{}, tabs.map(([v,l,n,bad])=>h('button',{'data-view':v,'aria-selected':state.view===v,onclick:()=>showView(v)}, l, n!=null?h('span',{class:'cnt'+(bad?' bad':'')},n):null))));
}
function failuresView(){
  const bad=data.tests.filter(t=>isFail(t.outcome)||t.outcome==='flaky');
  if(!bad.length) return h('div',{class:'card'}, h('div',{style:'font-size:18px;color:var(--pass);font-weight:600'},'No failures.'), h('div',{style:'color:var(--ink-3);margin-top:6px'},'Every test that ran passed on the first attempt.'));
  const cl=failureClusters();
  const grid=h('div',{class:'grid'});
  grid.append(h('div',{class:'w12 fx-tools'}, h('span',{class:'fx-sum'}, bad.length+' failed or flaky', PREV.length? ' · '+bad.filter(t=>isFail(t.outcome)&&sinceInfo(t).kind==='new').length+' new since '+runLabel(PREV[PREV.length-1]) : ''), h('span',{class:'spacer'}),
    h('button',{class:'btn',onclick:exportCsv,title:'Failures as CSV for Jira or a sheet'},'Download CSV'), h('button',{class:'btn',onclick:exportJson,title:'Failures as JSON'},'Download JSON'), h('button',{class:'btn primary',onclick:e=>copyText(summaryMarkdown(),e.currentTarget,'Copied for Slack')},'Copy summary')));
  if(cl.length) grid.append(h('div',{class:'card w6 fail-rail'}, h('h2',{},'Failure clusters', h('span',{class:'hint'},cl.length+' distinct error'+(cl.length>1?'s':''))), clustersView(cl)));
  if(DIMS.length) grid.append(h('div',{class:'card w6 fail-rail'}, h('h2',{},'Needs attention', h('span',{class:'hint'},'ranked by priority and severity')), attention()));
  const oc=ownerCard(); if(oc) grid.append(oc);
  const rows=[...bad].sort((a,b)=>rank(a)-rank(b)||b.duration-a.duration);
  grid.append(h('div',{class:'card w12'}, h('h2',{},rows.length+' failed or flaky tests'), h('table',{class:'apitbl'},
    h('thead',{}, h('tr',{}, ['','Test','Spec','Priority','Owner','Ticket','Attempts',PREV.length?'Since':'',HRUNS.length>1?'History':'',''].map(x=>h('th',{},x)))),
    h('tbody',{}, rows.map(t=>{ const e=t.results[t.results.length-1].errors[0]; return h('tr',{onclick:()=>select(t.id)},
      h('td',{}, h('span',{class:'st '+t.outcome,style:'display:inline-block'})), h('td',{}, h('div',{},t.title), h('div',{class:'t',title:e?e.message:''}, e? e.message.split('\n')[0].slice(0,110):'')),
      h('td',{class:'t'},t.file.split('/').pop()+(data.projects.length>1?' · '+t.project:'')), h('td',{},[t.meta.priority,t.meta.severity].filter(Boolean).join(' · ')), h('td',{},t.meta.owner||''), h('td',{},t.meta.story||t.meta.issue||''), h('td',{},t.results.length), PREV.length?h('td',{},(()=>{ const si=sinceInfo(t); return si? h('span',{class:'since-txt '+si.kind}, si.kind==='new'?'new':runLabel(si.since)) : h('span',{class:'t'},'–'); })()):null, HRUNS.length>1?h('td',{},dots(t,10)):null, h('td',{class:'t'},ms(t.duration))); })))));
  return grid;
}
function apiView(){
  const calls=[]; for(const t of data.tests) for(const r of t.results) for(const c of r.api) calls.push({c,t,r});
  if(!calls.length) return h('div',{class:'card'},h('b',{},'No API calls recorded.'),' Add ',h('code',{},"import 'reporting-labs/auto'"),' to playwright.config.ts and every request.get / request.post / page.request call shows up here with headers, bodies and a cURL command. Calls made with other clients can be recorded with api().');
  const bad=calls.filter(x=>(x.c.status||0)>=400).length, avg=Math.round(calls.reduce((a,x)=>a+(x.c.duration||0),0)/calls.length), slow=calls.filter(x=>(x.c.duration||0)>1000).length;
  calls.sort((a,b)=>((b.c.status||0)>=400)-((a.c.status||0)>=400)||(b.c.duration||0)-(a.c.duration||0));
  const byHost=new Map(); for(const x of calls){ try{ const hst=new URL(x.c.url).host; byHost.set(hst,(byHost.get(hst)||0)+1);}catch(e){} }
  return h('div',{}, h('div',{class:'api-stats'}, h('span',{},h('b',{},calls.length),' calls'), h('span',{class:bad?'bad':''},h('b',{},bad),' failed (4xx/5xx)'), h('span',{},h('b',{},ms(avg)),' avg'), h('span',{},h('b',{},slow),' over 1s'), h('span',{},h('b',{},byHost.size),' host'+(byHost.size===1?'':'s'))),
    h('div',{class:'card w12'}, h('table',{class:'apitbl'}, h('thead',{}, h('tr',{}, ['Method','URL','Status','Time','Test'].map(x=>h('th',{},x)))),
      h('tbody',{}, calls.map(({c,t})=>{ const st=c.status||0, cls=st>=400?'bad':st>=300?'warn':'ok'; return h('tr',{onclick:()=>select(t.id)},
        h('td',{}, h('span',{class:'m '+c.method.toUpperCase(),style:'font:11px var(--mono);font-weight:600;padding:3px 6px;border-radius:3px;color:#fff;background:'+({GET:'#2A7FBF',POST:'var(--pass)',PUT:'#C77D14',PATCH:'#C77D14',DELETE:'var(--fail)'}[c.method.toUpperCase()]||'var(--ink-3)')},c.method.toUpperCase())),
        h('td',{class:'u',title:c.url},c.url), h('td',{}, h('span',{class:'sc '+cls,style:'font:12px var(--mono);font-weight:600;color:'+(cls==='bad'?'var(--fail)':cls==='warn'?'var(--flaky-ink)':'var(--pass)')},st||'—')), h('td',{class:'t'},c.duration!=null?ms(c.duration):'—'), h('td',{class:'t',title:t.title},t.title)); })))));
}
function timelineView(){
  const W=data.options.widgets, cards=[];
  if(W.timeline!==false) cards.push(h('div',{class:'card w12'}, h('h2',{},'Timeline by worker'), timeline()), h('div',{class:'card w6'}, h('h2',{},'Workers'), workers()));
  if(W.durations!==false) cards.push(h('div',{class:W.timeline!==false?'card w6':'card w12'}, h('h2',{},'Duration spread'), histogram()));
  return h('div',{class:'grid'}, cards);
}
function hasTimelineView(){ return data.options.widgets.timeline!==false || data.options.widgets.durations!==false; }
function stripe(){
  const s=data.stats, f=s.failed+s.timedOut+s.interrupted, tot=s.total||1;
  return h('div',{class:'stripe','aria-hidden':'true'}, [['passed',s.passed],['flaky',s.flaky],['failed',f],['skipped',s.skipped]].filter(x=>x[1]).map(([k,n])=>h('i',{style:'width:'+(n/tot*100)+'%;background:'+colorOf(k)})));
}
function isDark(){ return getComputedStyle(document.documentElement).getPropertyValue('--_dark').trim()==='1'; }
function copyText(txt,btn,done){ const ok=()=>{ if(btn){ const o=btn.textContent; btn.textContent=done||'Copied'; btn.classList.add('done'); setTimeout(()=>{btn.textContent=o;btn.classList.remove('done');},1400);} };
  if(navigator.clipboard&&navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(ok,()=>fallback()); else fallback();
  function fallback(){ const ta=h('textarea',{style:'position:fixed;opacity:0'},txt); document.body.append(ta); ta.select(); try{document.execCommand('copy');ok();}catch(e){} ta.remove(); } }
function summaryMarkdown(){
  const s=data.stats, f=s.failed+s.timedOut+s.interrupted, ran=s.total-s.skipped, rate=ran?Math.round(s.passed/ran*100):0;
  const meta=Object.entries(data.metadata).map(([k,v])=>k+': '+v).join(' · ');
  const lines=['*'+data.title+'* — '+((data.runStatus==='interrupted'||data.runStatus==='timedout')?':warning: run '+data.runStatus+' · ':'')+(f?':red_circle:':':large_green_circle:')+' '+rate+'% passed ('+s.passed+'/'+ran+')'+(f?', '+f+' failed'+(PREV.length?' ('+data.tests.filter(t=>isFail(t.outcome)&&sinceInfo(t).kind==='new').length+' new)':''):'')+(s.flaky?', '+s.flaky+' flaky':'')+(s.skipped?', '+s.skipped+' skipped':'')+' · '+ms(data.duration)+(meta?' · '+meta:'')];
  const bad=data.tests.filter(t=>isFail(t.outcome)).sort((a,b)=>rank(a)-rank(b)).slice(0,10);
  if(bad.length){ lines.push('Failures:'); for(const t of bad) lines.push('• '+[t.meta.priority,t.meta.severity].filter(Boolean).join('/')+(t.meta.priority||t.meta.severity?' ':'')+t.title+(t.meta.owner?' ('+t.meta.owner+')':'')+(t.meta.story?' '+t.meta.story:'')); if(f>bad.length) lines.push('… and '+(f-bad.length)+' more'); }
  const owners=byOwner(); if(owners.length>1||(owners.length===1&&owners[0].owner!=='unassigned')) lines.push('By owner: '+owners.map(o=>o.owner+' '+(o.failed?o.failed:'')+(o.failed&&o.flaky?'+':'')+(o.flaky?o.flaky+' flaky':'')).join(' · '));
  return lines.join('\n');
}
function header(){
  const html = document.documentElement;
  const toggle = h('button',{class:'tbtn',title:'Toggle light/dark','aria-label':'Toggle theme',onclick:()=>{
    const next=isDark()?'light':'dark'; html.setAttribute('data-theme', next); try{localStorage.setItem('rl-theme',next);}catch(e){}
  }}, '◐');
  const pal = h('select',{class:'pal','aria-label':'Palette',onchange:e=>{ html.setAttribute('data-palette',e.target.value); try{localStorage.setItem('rl-palette',e.target.value);}catch(e){} }},
    [['lab','Blue'],['ocean','Ocean'],['ember','Ember'],['mono','Mono']].map(([v,l])=>h('option',{value:v,selected:html.getAttribute('data-palette')===v},l)));
  const copy = h('button',{class:'btn',onclick:e=>copyText(summaryMarkdown(),e.currentTarget,'Copied for Slack')}, 'Copy summary');
  return h('header',{class:'hdr'},
    data.options.logo ? h('img',{class:'logo brand',src:data.options.logo,alt:''}) : h('div',{class:'logo',title:'Generated by reportingLabs','aria-label':'reportingLabs'}, document.getElementById('rl-logo').content.cloneNode(true)),
    data.options.project ? h('div',{class:'proj-blk'}, h('h1',{}, data.title),
      h('div',{class:'sub'}, [data.options.project.name, data.options.project.version?'v'+data.options.project.version:null, data.options.project.team].filter(Boolean).join(' · '),
        data.options.project.url? [' · ', h('a',{href:data.options.project.url,target:'_blank',rel:'noopener'}, data.options.project.url.replace(/^https?:\/\//,''))] : null),
      data.options.project.description? h('div',{class:'sub desc'}, data.options.project.description) : null)
    : h('h1',{}, data.title),
    h('div',{class:'hmeta'}, Object.entries(data.metadata).map(([k,v])=>h('span',{class:'chip'}, k+' ', h('b',{},v)))),
    h('div',{class:'spacer'}),
    h('span',{class:'when'}, new Date(data.startTime).toLocaleString()+' · '+ms(data.duration)+' · '+data.workers+' worker'+(data.workers===1?'':'s')),
    h('div',{class:'ctl'}, copy, pal, toggle));
}

/* ---------- summary ---------- */
function summary(){
  const s = data.stats;
  const failed = s.failed+s.timedOut+s.interrupted;
  const ran = s.total - s.skipped;
  const ok = failed===0;
  const rate = ran? Math.round(s.passed/ran*100):0;
  const parts=[]; if(failed)parts.push(failed+' failed'); if(s.flaky)parts.push(s.flaky+' flaky'); if(s.skipped)parts.push(s.skipped+' skipped');
  const nClu=failureClusters().length;
  const nNew=PREV.length? data.tests.filter(t=>isFail(t.outcome)&&sinceInfo(t).kind==='new').length : null;
  const notRun=data.tests.filter(t=>!t.results.length||t.outcome==='interrupted').length;
  const banner=(data.runStatus==='interrupted'||data.runStatus==='timedout')? h('div',{class:'runbanner'}, h('b',{}, data.runStatus==='timedout'?'Global timeout hit.':'Run was interrupted.'), ' '+(notRun?notRun+' test'+(notRun>1?'s':'')+' did not finish, so the numbers below are partial.':'The numbers below may be partial.')) : null;
  const el = h('section',{class:'sum'}, banner,
    h('div',{class:'kpis'},
      hero(),
      pill('passed','Passed',s.passed,'var(--pass)', ok&&s.passed? 'Every test on first attempt' : 'On first attempt', '', hseries(e=>e.passed)),
      pill('failed','Failed',failed,'var(--fail)', failed? (nNew!=null? nNew+' new · '+(failed-nNew)+' known' : nClu+' root cause'+(nClu===1?'':'s')) : 'Nothing broke', failed?'down':'', hseries(e=>e.failed)),
      pill('flaky','Flaky',s.flaky,'var(--flaky)', s.flaky? 'Passed on retry' : 'No retries needed', '', hseries(e=>e.flaky)),
      pill('skipped','Skipped',s.skipped,'var(--skip)', s.skipped? 'Not executed' : 'Everything ran', '', hseries(e=>e.skipped))));
  if(data.options.widgets.runStrip && data.tests.length){
    const strip = h('div',{class:'strip',id:'strip'}, data.tests.map(t=>h('button',{class:'cell '+t.outcome,'data-id':t.id,title:t.title+' · '+label[t.outcome]+' · '+ms(t.duration),'aria-label':t.title,onclick:()=>select(t.id)})));
    el.append(strip, h('div',{class:'strip-cap'}, 'Every test in run order. Hover for details, click to open.'));
  }
  const W=data.options.widgets, g=[];
  const hasFail=data.tests.some(t=>isFail(t.outcome)||t.outcome==='flaky');
  if(W.attention && hasFail) g.push(h('div',{class:'card w6 fail-rail'}, h('h2',{},'Needs attention', h('span',{class:'hint'},(failed+s.flaky)+' open · ranked by priority and severity')), attention(8)));
  const clusters=failureClusters(); if(clusters.length) g.push(h('div',{class:'card w6 fail-rail'}, h('h2',{},'Failure clusters', h('span',{class:'hint'},clusters.length+' root cause'+(clusters.length>1?'s':'')+' · '+clusters.reduce((a,c)=>a+c.tests.length,0)+' failures')), clustersView(clusters.slice(0,6)), clusters.length>6?h('div',{class:'attn-foot'}, h('button',{onclick:()=>showView('failures')},'View all '+clusters.length+' clusters →')):null));
  if(W.dimensions) g.push(h('div',{class:'card w8'}, h('h2',{},'Breakdown', h('span',{class:'hint'},'click a row to filter')), breakdown()));
  if(W.slowest){ const reg=regressions().length; g.push(h('div',{class:'card'}, h('h2',{},'Slowest tests', reg?h('span',{class:'hint badge'},reg+' got slower'):null), tabbed([['slow','Slowest',slowest],['reg','Got slower'+(reg?' ('+reg+')':''),slowerView]]))); }
  if(W.flaky!==false && HRUNS.length>1) g.push(h('div',{class:'card'}, h('h2',{},'Flakiest tests', h('span',{class:'hint'},'last '+Math.min(10,HRUNS.length)+' runs')), flakiest()));
  if(W.skipped!==false) { const sc=skippedCard(); if(sc) g.push(sc); }
  if(W.environment!==false) { const ec=envCard(); if(ec) g.push(ec); }
  if(data.history.length>1) g.push(h('div',{class:'card w12'}, h('h2',{},'Trend', h('span',{class:'hint'},'last '+data.history.length+' runs')), trend()));
  else if(data.history.length===1) g.push(h('div',{class:'card w12'}, h('h2',{},'Trend', h('span',{class:'hint'},'from the second run')), h('div',{class:'nudge'}, h('b',{},'First run recorded.'),' Run the suite once more and this card shows the pass-rate trend, and every failure gets "new this run" or "failing since #…", last-10-runs dots, a Flakiest tests card and a Got slower tab. History lives in ',h('code',{},data.historyFile||'reporting-labs.history.json'),', commit it or cache it in CI.')));
  const ge=data.globalErrors||[], go=data.globalOutput||[];
  if(ge.length||go.some(x=>x.stream==='err')) g.unshift(h('div',{class:'card w12 fail-rail'}, h('h2',{}, ge.length? ge.length+' error'+(ge.length>1?'s':'')+' outside tests' : 'Output outside tests', h('span',{class:'hint'},'spec files that failed to load, global setup, worker crashes')),
    ...ge.map(errorView), go.length? h('details',{class:'errfull'}, h('summary',{},'Console output outside tests ('+go.length+' chunks)'), h('pre',{class:'txt'}, go.map(x=>(x.stream==='err'?'[stderr] ':'')+x.text).join(''))) : null));
  if(g.length) el.append(h('div',{class:'grid'}, g));
  for(const sec of data.options.sections) el.append(h('div',{class:'card section'}, h('h2',{},sec.title), h('div',{class:'body',html:sec.html})));
  return el;
}
function pill(key,text,n,color,sub,tone,series){
  return h('button',{class:'pill kpi','aria-pressed':state.status===key,'data-k':key,style:'--c:'+color,title:'Show '+text.toLowerCase()+' tests',onclick:()=>{state.status=key;refresh();if(key!=='all')showView('tests');}},
    series? spark(series,color) : null, h('div',{class:'l'},text), h('div',{class:'v'},n), h('div',{class:'d '+(tone||'')},sub||''));
}
function initials(name){ return (name||'').split(/[\s\-–—·]+/).filter(Boolean).slice(0,2).map(w=>w[0]).join('').toUpperCase()||'R'; }
function prevRun(){
  const H=data.history||[]; if(H.length<2) return null;
  const cur=H[H.length-1]; for(let i=H.length-2;i>=0;i--){ if(!cur.label||H[i].label!==cur.label) return H[i]; }
  return H[H.length-2];
}

/* ---------- run history per test ---------- */
function runsOf(t){ return HRUNS.map(e=>({e, r:(t.key&&e.tests[t.key])||null})); }
/* new vs known: walk back through earlier runs while the test kept failing */
function sinceInfo(t){
  if(!PREV.length||!isFail(t.outcome)) return null;
  let since=null, seen=false;
  for(let i=PREV.length-1;i>=0;i--){ const r=PREV[i].tests[t.key]; if(!r) continue; seen=true; if(r[0]==='f') since=PREV[i]; else break; }
  if(!seen) return {kind:'new', label:'New test'};
  return since ? {kind:'known', since, label:'since '+runLabel(since)} : {kind:'new', label:'New'};
}
function sinceBadge(t, cls){
  const si=sinceInfo(t); if(!si) return null;
  return h('span',{class:(cls||'badge')+' since '+si.kind, title:si.kind==='new'?'Passed in the previous run':'Has been failing since '+runLabel(si.since)}, si.kind==='new'?'NEW':si.label);
}
/* last N runs as dots */
function dots(t, n){
  const rs=runsOf(t).slice(-(n||10)); if(rs.length<2) return null;
  return h('span',{class:'dots','aria-label':'Last '+rs.length+' runs'}, rs.map(({e,r})=>h('i',{class:r?r[0]:'n', title:runLabel(e)+' · '+(r?({p:'passed',f:'failed',k:'flaky',s:'skipped'})[r[0]]:'not run')})));
}
function flakyScore(t){
  const rs=runsOf(t).map(x=>x.r&&x.r[0]).filter(c=>c&&c!=='s'); let k=0, flips=0;
  for(let i=0;i<rs.length;i++){ if(rs[i]==='k') k++; if(i&&rs[i]!==rs[i-1]&&(rs[i]!=='k'&&rs[i-1]!=='k')) flips++; }
  return {k, flips, runs:rs.length, score:k*2+flips};
}
function flakiest(){
  if(HRUNS.length<2) return h('div',{class:'empty'},'Run a few more times: flaky history builds up from reporting-labs.history.json.');
  const rows=data.tests.map(t=>({t, f:flakyScore(t)})).filter(x=>x.f.score>0).sort((a,b)=>b.f.score-a.f.score||b.f.k-a.f.k).slice(0,6);
  if(!rows.length) return h('div',{class:'ok'},'Nothing flaked across the last '+HRUNS.length+' runs.');
  return h('ul',{class:'flk'}, rows.map(({t,f})=>h('li',{}, h('button',{onclick:()=>select(t.id)},
    h('span',{class:'t'}, t.title),
    dots(t,10),
    h('span',{class:'m'}, (data.projects.length>1? t.project+' · ' : '')+(f.k?f.k+' flaky':'')+(f.k&&f.flips?' · ':'')+(f.flips?f.flips+' flip'+(f.flips>1?'s':''):'')+' in '+f.runs+' runs')))));
}
/* duration regression vs the previous run that has this test */
function lastDur(t){ const r=t.results[t.results.length-1]; return r?r.duration:t.duration; }
function prevDur(t){ for(let i=PREV.length-1;i>=0;i--){ const r=PREV[i].tests[t.key]; if(r&&r[0]!=='s') return {ms:r[1], e:PREV[i]}; } return null; }
function regressions(){
  const out=[]; for(const t of data.tests){ if(t.outcome==='skipped') continue; const p=prevDur(t); if(!p||p.ms<=0) continue; const cur=lastDur(t); if(cur>=p.ms*2&&cur-p.ms>=500) out.push({t,prev:p.ms,cur,ratio:cur/p.ms}); }
  return out.sort((a,b)=>b.ratio-a.ratio);
}
function slowerView(){
  if(!PREV.length) return h('div',{class:'empty'},'Needs a previous run to compare against.');
  const rows=regressions().slice(0,6);
  if(!rows.length) return h('div',{class:'ok'},'No test got 2× slower than last run.');
  return h('ul',{class:'slow'}, rows.map(({t,prev,cur,ratio})=>h('li',{}, h('button',{onclick:()=>select(t.id)},
    h('span',{}, h('span',{class:'t'},t.title), h('span',{class:'bar',style:'--w:'+Math.min(100,Math.round(prev/cur*100))+'%'}, h('i',{style:'background:var(--flaky)'}))),
    h('span',{class:'d'}, h('b',{style:'color:var(--fail)'},'×'+(ratio>=10?Math.round(ratio):ratio.toFixed(1))), ' ', ms(prev)+' → '+ms(cur))))));
}
/* sparklines from the whole history (counts, no per-test data needed) */
function spark(series, color, w, h2){
  w=w||64; h2=h2||20; const n=series.length; if(n<3) return null;
  const max=Math.max(...series,1), min=Math.min(...series,0); if(Math.max(...series)===Math.min(...series)) return null;
  const x=i=>1+i/(n-1)*(w-2), y=v=>h2-2-(max===min?0.5:(v-min)/(max-min))*(h2-4);
  const pts=series.map((v,i)=>x(i)+','+y(v)).join(' ');
  return h('span',{class:'sp','aria-hidden':'true',html:'<svg viewBox="0 0 '+w+' '+h2+'" width="'+w+'" height="'+h2+'"><polyline points="'+pts+'" fill="none" stroke="'+color+'" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" opacity=".9"/><circle cx="'+x(n-1)+'" cy="'+y(series[n-1])+'" r="2.2" fill="'+color+'"/></svg>'});
}
function hseries(f){ return HIST.slice(-12).map(f); }
/* owner rollup for the Failures view and the copied summary */
function byOwner(){
  const m=new Map();
  for(const t of data.tests){ if(!isFail(t.outcome)&&t.outcome!=='flaky') continue; const o=t.meta.owner||'unassigned'; const e=m.get(o)||{owner:o,failed:0,flaky:0,tests:[]}; if(isFail(t.outcome)) e.failed++; else e.flaky++; e.tests.push(t); m.set(o,e); }
  return [...m.values()].sort((a,b)=>b.failed-a.failed||b.flaky-a.flaky||a.owner.localeCompare(b.owner));
}
function ownerCard(){
  const rows=byOwner(); if(!rows.length) return null;
  return h('div',{class:'card w12'}, h('h2',{},'By owner', h('span',{class:'hint'},rows.length+' owner'+(rows.length>1?'s':'')+' to ping')),
    h('ul',{class:'own'}, rows.map(o=>h('li',{}, h('button',{onclick:()=>{ if(o.owner!=='unassigned'&&DIMS.includes('owner')) state.dims.owner=o.owner; state.status='failed'; refresh(); showView('tests'); }},
      h('span',{class:'nm'},o.owner),
      h('span',{class:'cnts'}, [o.failed?h('b',{class:'f'},o.failed+' failed'):null, o.failed&&o.flaky?' · ':null, o.flaky?h('b',{class:'k'},o.flaky+' flaky'):null]),
      h('span',{class:'ts'}, o.tests.slice(0,3).map(t=>t.title).join(' · ')+(o.tests.length>3?' · +'+(o.tests.length-3):'')))))));
}
/* export */
function download(name, text, type){
  const blob=new Blob([text],{type:type||'text/plain'}); const url=URL.createObjectURL(blob);
  const a=h('a',{href:url,download:name,style:'display:none'}); document.body.append(a); a.click(); setTimeout(()=>{URL.revokeObjectURL(url); a.remove();},500);
}
function csvCell(v){ v=v==null?'':String(v); return /[",\n]/.test(v)? '"'+v.replace(/"/g,'""')+'"' : v; }
function failureRows(){
  const bad=data.tests.filter(t=>isFail(t.outcome)||t.outcome==='flaky').sort((a,b)=>rank(a)-rank(b));
  return bad.map(t=>{ const r=t.results[t.results.length-1], e=r&&r.errors[0], si=sinceInfo(t);
    return { title:t.title, suite:t.path.join(' > '), file:t.file, line:t.line, project:t.project, outcome:label[t.outcome], since:si?(si.kind==='new'?'new':runLabel(si.since)):'', priority:t.meta.priority||'', severity:t.meta.severity||'', owner:t.meta.owner||'', feature:t.meta.feature||'', story:t.meta.story||t.meta.issue||'', epic:t.meta.epic||'', attempts:t.results.length, duration_ms:Math.round(t.duration), reason:e&&e.explain?e.explain.label:'', why:e&&e.explain?e.explain.summary:'', error:e?e.message.split('\n')[0]:'', tags:t.tags.join(' ') }; });
}
function exportCsv(){ const rows=failureRows(); if(!rows.length) return; const cols=Object.keys(rows[0]); download(fileStem()+'-failures.csv', [cols.join(','), ...rows.map(r=>cols.map(c=>csvCell(r[c])).join(','))].join('\n'), 'text/csv'); }
function exportJson(){ const rows=failureRows().map(r=>{ const t=data.tests.find(x=>x.title===r.title&&x.project===r.project&&x.file===r.file); const res=t&&t.results[t.results.length-1]; return Object.assign({}, r, {errorFull:res&&res.errors[0]?res.errors[0].message:''}); });
  download(fileStem()+'-failures.json', JSON.stringify({title:data.title, generatedAt:new Date(data.generatedAt).toISOString(), metadata:data.metadata, stats:data.stats, failures:rows},null,2), 'application/json'); }
function fileStem(){ return (data.title||'report').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,40)||'report'; }
/* expected vs received diff */
function tokenDiff(a,b){
  const byChar=a.length<=160&&b.length<=160;
  const ta=byChar?[...a]:a.split(/(\s+)/).filter(x=>x!==''), tb=byChar?[...b]:b.split(/(\s+)/).filter(x=>x!=='');
  const n=ta.length, m=tb.length; if(n*m>250000) return null;
  const L=Array.from({length:n+1},()=>new Uint16Array(m+1));
  for(let i=n-1;i>=0;i--) for(let j=m-1;j>=0;j--) L[i][j]=ta[i]===tb[j]?L[i+1][j+1]+1:Math.max(L[i+1][j],L[i][j+1]);
  const A=[], B=[]; let i=0,j=0;
  while(i<n&&j<m){ if(ta[i]===tb[j]){A.push([ta[i],0]);B.push([tb[j],0]);i++;j++;} else if(L[i+1][j]>=L[i][j+1]){A.push([ta[i],1]);i++;} else {B.push([tb[j],1]);j++;} }
  while(i<n){A.push([ta[i++],1]);} while(j<m){B.push([tb[j++],1]);}
  const join=(arr,cls)=>{ const out=[]; for(const [t,d] of arr){ const last=out[out.length-1]; if(last&&last.d===d) last.t+=t; else out.push({t,d}); } return out.map(x=>x.d?h('mark',{class:cls},x.t):x.t); };
  return {a:join(A,'del'), b:join(B,'ins')};
}
function errorView(e){ return h('div',{class:'errwrap'}, whyView(e.explain), errorWhere(e), errorBody(e), e.snippet? h('pre',{class:'snip'}, e.snippet) : null); }
function whyView(x){
  if(!x) return null;
  return h('div',{class:'why '+x.kind}, h('div',{class:'why-l'}, h('span',{class:'why-k'},x.label), x.action? h('code',{class:'why-a'},x.action):null),
    h('div',{class:'why-s'},x.summary), x.hint? h('div',{class:'why-h'},x.hint):null);
}
function errorWhere(e){
  if(!e.location) return null;
  const l=e.location, txt=l.file+':'+l.line+(l.column?':'+l.column:'');
  const href=vscodeHref(l.file, l.line, l.column);
  return h('div',{class:'errloc'}, 'at ', href? h('a',{href,title:'Open in VS Code'},txt) : h('span',{},txt));
}
function errorBody(e){
  const msg=e.message||'';
  const box=h('div',{class:'err'}, msg, e.stack&&e.stack!==msg? h('details',{}, h('summary',{},'Stack trace'), h('div',{class:'stack'},e.stack)) : null);
  const ex=msg.match(/^(Expected[^:\n]{0,40}):[ \t]*(.+)$/m), rc=msg.match(/^(Received[^:\n]{0,40}):[ \t]*(.+)$/m);
  if(ex&&rc&&ex[2].trim()&&rc[2].trim()&&ex[2].length<2000&&rc[2].length<2000){
    const d=tokenDiff(ex[2].trim(), rc[2].trim());
    if(d){ return h('div',{}, h('div',{class:'ediff'},
      h('div',{class:'side exp'}, h('div',{class:'lbl'},ex[1]), h('div',{class:'val'},d.a)),
      h('div',{class:'side rcv'}, h('div',{class:'lbl'},rc[1]), h('div',{class:'val'},d.b))),
      h('details',{class:'errfull'}, h('summary',{},'Full message'), box)); }
  }
  const lines=msg.split('\n');
  if(lines.some(l=>/^- /.test(l))&&lines.some(l=>/^\+ /.test(l))){
    return h('div',{}, h('div',{class:'ediff lines'}, lines.map(l=>h('div',{class:'ln '+(/^- /.test(l)?'exp':/^\+ /.test(l)?'rcv':/^@@/.test(l)?'hunk':'')},l))), h('details',{class:'errfull'}, h('summary',{},'Full message'), box));
  }
  return box;
}
/* skipped reasons */
function skipReason(t){ const a=t.annotations.find(x=>/^(skip|fixme|slow)$/i.test(x.type)&&x.description); return a? (a.type.toLowerCase()==='fixme'?'fixme: ':'')+a.description : (t.annotations.some(x=>/^fixme$/i.test(x.type))?'fixme':''); }
function skippedCard(){
  const sk=data.tests.filter(t=>t.outcome==='skipped'); if(!sk.length) return null;
  const withReason=sk.filter(skipReason).length;
  return h('div',{class:'card'}, h('h2',{},'Skipped', h('span',{class:'hint'},sk.length+' test'+(sk.length>1?'s':'')+(withReason<sk.length?' · '+(sk.length-withReason)+' without a reason':''))),
    h('ul',{class:'skp'}, sk.slice(0,6).map(t=>h('li',{}, h('button',{onclick:()=>select(t.id)}, h('span',{class:'t'},t.title), h('span',{class:'r'},(data.projects.length>1? t.project+' · ' : '')+(skipReason(t)||'no reason given'))))),
      sk.length>6? h('li',{}, h('button',{onclick:()=>{state.status='skipped';refresh();showView('tests');}}, h('span',{class:'t',style:'color:var(--accent)'},'+'+(sk.length-6)+' more'))) : null));
}
/* environment card */
function envCard(){
  const rows=(data.env||[]); const meta=Object.entries(data.metadata||{});
  if(!rows.length&&!meta.length) return null;
  return h('div',{class:'card'}, h('h2',{},'Environment'),
    h('dl',{class:'kv env'}, rows.map(r=>[h('dt',{},r.k), h('dd',{}, r.href? h('a',{href:r.href,target:'_blank',rel:'noopener'},r.v) : r.v)])));
}
/* feature × project heatmap */
function heatmap(){
  const d=DIMS.includes('feature')?'feature':DIMS[0]; const vals=dimValues(d), ps=data.projects;
  const cell=(v,p)=>{ const ts=data.tests.filter(t=>t.meta[d]===v&&t.project===p); const f=ts.filter(t=>isFail(t.outcome)).length, k=ts.filter(t=>t.outcome==='flaky').length; return {ts,f,k}; };
  return h('div',{class:'hm-wrap'}, h('table',{class:'hm'},
    h('thead',{}, h('tr',{}, h('th',{},d), ps.map(p=>h('th',{},p)))),
    h('tbody',{}, vals.map(v=>h('tr',{}, h('th',{},v), ps.map(p=>{ const c=cell(v,p); if(!c.ts.length) return h('td',{class:'none'},'–');
      const cls=c.f?'bad':c.k?'warn':'ok', ratio=c.f/c.ts.length;
      return h('td',{class:cls,style:c.f?'--a:'+(0.25+ratio*0.75)+';color:'+(ratio>=0.5?'#fff':'var(--fail)'):'',title:c.ts.length+' tests · '+c.f+' failed · '+c.k+' flaky'}, h('button',{onclick:()=>{ state.dims[d]=v; state.project=p; state.status='all'; refresh(); showView('tests'); }}, c.f? h('b',{},c.f+' ✕') : c.k? h('b',{},c.k+' ~') : '✓', h('small',{},'/'+c.ts.length))); }))))),
    h('div',{class:'legend-inline'}, h('span',{style:'--c:var(--pass-bg)'},'all passed'), h('span',{style:'--c:var(--flaky-bg)'},'flaky'), h('span',{style:'--c:var(--fail)'},'failed, darker = higher share'), h('span',{style:'--c:transparent;margin-left:auto'},'click a cell to filter')));
}
function vscodeHref(file, line, column){
  if(data.options.editorLinks===false||!data.rootDir||!file) return null;
  const root=String(data.rootDir).replace(/\\/g,'/').replace(/\/$/,''); const abs=/^([a-zA-Z]:\/|\/)/.test(file)? file : root+'/'+file;
  return 'vscode://file'+(abs.startsWith('/')?'':'/')+abs+(line?':'+line+(column?':'+column:''):'');
}
function editorLink(t){
  const href=vscodeHref(t.file, t.line, t.column); if(!href) return null;
  return h('a',{class:'btn',href,title:'Open '+t.file+':'+t.line+' in VS Code'},'Open in VS Code');
}
function hero(){
  const s=data.stats, failed=s.failed+s.timedOut+s.interrupted, ran=s.total-s.skipped, total=s.total||1;
  const rate=ran?Math.round(s.passed/ran*100):0, ok=failed===0;
  const parts=[['passed',s.passed,'#3DDC8C'],['failed',failed,'#FF7A90'],['flaky',s.flaky,'#FFC65C'],['skipped',s.skipped,'rgba(255,255,255,.4)']].filter(p=>p[1]>0);
  const R=34, C=2*Math.PI*R; let off=0, arcs='<circle cx="42" cy="42" r="34" fill="none" stroke="rgba(255,255,255,.22)" stroke-width="9"/>';
  for(const [k,n,c] of parts){ const len=n/total*C; arcs+='<circle cx="42" cy="42" r="34" fill="none" stroke="'+c+'" stroke-width="9" stroke-dasharray="'+Math.max(0,len-2)+' '+(C-Math.max(0,len-2))+'" stroke-dashoffset="'+(-off)+'" transform="rotate(-90 42 42)"><title>'+label[k]+': '+n+'</title></circle>'; off+=len; }
  const ring=h('div',{class:'ring','aria-hidden':'true',html:'<svg viewBox="0 0 84 84">'+arcs+'<text x="42" y="47" text-anchor="middle">'+rate+'%</text></svg>'});
  const prev=prevRun(); let delta='';
  if(prev){ const pr=prev.total-prev.skipped, prate=pr?Math.round(prev.passed/pr*100):0, d=rate-prate; delta=(d===0?'Same as':d>0?'Up '+d+' pts from':'Down '+Math.abs(d)+' pts from')+' '+(prev.label||'last run'); }
  else delta=ok? 'Nothing to worry about.' : failed+' failed'+(s.flaky?', '+s.flaky+' flaky':'')+(s.skipped?', '+s.skipped+' skipped':'');
  return h('button',{class:'pill kpi hero','aria-pressed':state.status==='all','data-k':'all',title:'Show all tests',onclick:()=>{state.status='all';refresh();showView('tests');}},
    spark(hseries(e=>{ const rn=e.total-e.skipped; return rn?Math.round(e.passed/rn*100):0; }),'#fff'),
    data.options.widgets.outcome!==false? ring : null,
    h('div',{class:'body'},
      h('div',{class:'l'}, ok? 'All passed' : 'Pass rate'),
      h('div',{class:'v'}, s.passed, h('small',{}, 'of '+ran+' ran')),
      h('div',{class:'mini'}, parts.map(([k,n,c])=>h('i',{style:'width:'+(n/total*100)+'%;background:'+c}))),
      h('div',{class:'d'}, delta)));
}

function donut(){
  const s=data.stats, failed=s.failed+s.timedOut+s.interrupted, total=s.total||1;
  const parts=[['passed',s.passed],['failed',failed],['flaky',s.flaky],['skipped',s.skipped]].filter(p=>p[1]>0);
  const R=54, C=2*Math.PI*R; let off=0, arcs='';
  const gap=parts.length>1?3:0;
  for(const [k,n] of parts){ const len=n/total*C; arcs+='<circle r="'+R+'" cx="66" cy="66" fill="none" stroke="'+colorOf(k)+'" stroke-width="18" stroke-dasharray="'+Math.max(0,len-gap)+' '+(C-Math.max(0,len-gap))+'" stroke-dashoffset="'+(-off)+'" transform="rotate(-90 66 66)"><title>'+label[k]+': '+n+'</title></circle>'; off+=len; }
  const ran=s.total-s.skipped, rate=ran?Math.round(s.passed/ran*100):0;
  const svg=h('div',{html:'<svg viewBox="0 0 132 132">'+arcs+'<text class="c" x="66" y="64" text-anchor="middle">'+rate+'%</text><text class="cl" x="66" y="80" text-anchor="middle">pass rate</text></svg>'}).firstChild;
  return h('div',{class:'donut'}, svg, h('div',{class:'legend'}, parts.map(([k,n])=>h('button',{onclick:()=>{state.status=k;refresh();showView('tests');}}, h('span',{class:'dot',style:'background:'+colorOf(k)}), h('span',{},label[k]), h('span',{class:'n'},n)))));
}
function attention(limit){
  const bad=data.tests.filter(t=>isFail(t.outcome)||t.outcome==='flaky').sort((a,b)=>rank(a)-rank(b)||(isFail(b.outcome)-isFail(a.outcome))||b.duration-a.duration);
  if(!bad.length) return h('div',{class:'ok'},'No failures. Ship it.');
  const groups=new Map(); for(const t of bad){ const k=t.file+'::'+t.path.join('/')+'::'+t.title; const g=groups.get(k)||{t,projects:[]}; g.projects.push(t.project); groups.set(k,g); }
  const all=[...groups.values()], rows=limit?all.slice(0,limit):all;
  const sub=(t,projects)=>{ const parts=[t.file.split('/').pop()];
    if(data.projects.length>1) parts.push(projects.length>1? projects.length+' projects' : projects[0]);
    const si=sinceInfo(t); if(si) parts.push(si.kind==='new'? h('b',{class:'new'},'new this run') : 'failing since '+runLabel(si.since));
    const le=t.results[t.results.length-1]&&t.results[t.results.length-1].errors[0]; if(le&&le.explain) parts.push(h('span',{class:'rsn',title:le.explain.summary},le.explain.label));
    else if(t.outcome==='flaky') parts.push('passed on retry '+t.results.length);
    const out=[]; parts.forEach((x,k)=>{ if(k) out.push(' · '); out.push(x); }); return out; };
  const tbl=h('table',{class:'attn2'}, h('tbody',{}, rows.map(({t,projects})=>h('tr',{tabindex:'0',onclick:()=>select(t.id),onkeydown:e=>{ if(e.key==='Enter') select(t.id); }},
    h('td',{class:'pr'}, h('i',{class:'dot',style:'background:'+colorOf(bucket(t))}), h('span',{},t.meta.priority||label[t.outcome]), t.meta.severity? h('small',{},t.meta.severity) : null),
    h('td',{class:'tt'}, h('div',{class:'n'},t.title), h('div',{class:'s'}, sub(t,projects))),
    h('td',{class:'ow'}, t.meta.owner||'')))));
  const more=all.length-rows.length;
  return h('div',{class:'attn-wrap'}, tbl, more>0? h('div',{class:'attn-foot'}, h('button',{onclick:()=>showView('failures')}, 'View all '+all.length+' in Failures →')) : null);
}
function dimension(d){
  const vals=dimValues(d), keys=['passed','flaky','failed','skipped'];
  const rows=vals.map(v=>{ const ts=data.tests.filter(t=>t.meta[d]===v), n=ts.length||1, cnt={}; for(const k of keys) cnt[k]=ts.filter(t=>bucket(t)===k).length;
    return h('button',{class:'row','aria-pressed':state.dims[d]===v,title:ts.length+' tests',onclick:()=>{state.dims[d]=state.dims[d]===v?null:v;refresh();showView('tests');}},
      h('span',{class:'k'},v), h('span',{class:'bar'}, keys.map(k=>h('i',{style:'width:'+(cnt[k]/n*100)+'%;background:'+colorOf(k),title:label[k]+' '+cnt[k]}))),
      h('span',{class:'n'}, cnt.failed? h('b',{},cnt.failed+' ✕ ') : null, ts.length)); });
  const untagged=data.tests.filter(t=>!t.meta[d]).length;
  return h('div',{}, h('div',{class:'dim'}, rows), h('div',{class:'legend-inline'}, keys.map(k=>h('span',{style:'--c:'+colorOf(k)},label[k])), untagged?h('span',{style:'--c:transparent;margin-left:auto'},untagged+' without '+d):null));
}
function histogram(){
  const ds=data.tests.filter(t=>t.outcome!=='skipped').map(t=>t.duration); if(!ds.length) return h('div',{class:'empty'},'No timings');
  const edges=[0,250,500,1000,2000,5000,10000,30000,Infinity], lbl=['<250ms','250–500ms','0.5–1s','1–2s','2–5s','5–10s','10–30s','>30s'];
  const counts=edges.slice(0,-1).map((e,i)=>ds.filter(x=>x>=e&&x<edges[i+1]).length), max=Math.max(...counts,1);
  const last=counts.map((c,i)=>c?i:-1).filter(i=>i>-1).pop();
  return h('div',{class:'hist'}, counts.slice(0,last+1).map((c,i)=>h('div',{class:'b',title:c+' tests '+lbl[i]}, h('span',{class:'v'},c||''), h('i',{class:i>=4?'slow':'',style:'height:'+Math.max(2,c/max*70)+'px'}), h('span',{class:'l'},lbl[i]))));
}
function tagsChart(){
  const m=new Map(); for(const t of data.tests) for(const g of t.tags){ if(/[:=]/.test(g)||/^@P[0-4]$/i.test(g)) continue; const e=m.get(g)||{n:0,f:0}; e.n++; if(isFail(t.outcome)) e.f++; m.set(g,e); }
  const list=[...m.entries()].sort((a,b)=>b[1].f-a[1].f||b[1].n-a[1].n).slice(0,24);
  return h('div',{class:'tags'}, list.map(([g,e])=>h('button',{onclick:()=>{ const inp=document.querySelector('.tools input'); inp.value=g; state.q=g.toLowerCase(); refresh(); showView('tests'); }}, g, h('span',{class:'bar'}, h('i',{style:'width:'+((e.n-e.f)/e.n*100)+'%;background:var(--pass)'}), h('i',{style:'width:'+(e.f/e.n*100)+'%;background:var(--fail)'})), h('span',{style:'color:var(--ink-3)'},e.n))));
}

function tabbed(tabs){
  let cur=tabs[0][0]; const bar=h('div',{class:'bk-tabs'}), body=h('div',{});
  const render=()=>{ body.innerHTML=''; body.append(tabs.find(t=>t[0]===cur)[2]()); bar.querySelectorAll('button').forEach(b=>b.setAttribute('aria-selected',b.dataset.k===cur)); };
  for(const [k,l] of tabs) bar.append(h('button',{'data-k':k,onclick:()=>{cur=k;render();}},l));
  render(); return h('div',{}, bar, body);
}
function breakdown(){
  const tabs=[...DIMS.map(d=>[d,d[0].toUpperCase()+d.slice(1),()=>dimension(d)])];
  if(data.tests.length>1) tabs.push(['file','Spec file',byFile]);
  if(data.projects.length>1&&data.options.widgets.projects) tabs.push(['project','Project',projects]);
  if(data.options.widgets.tags&&data.tests.some(t=>t.tags.length)) tabs.push(['tags','Tags',tagsChart]);
  if(data.projects.length>1&&DIMS.length) tabs.push(['heat','Heatmap',heatmap]);
  if(!tabs.length) return h('div',{class:'empty'},'Add meta({ priority, severity, owner, feature }) to your tests to see breakdowns here.');
  const nudge=!DIMS.length? h('div',{class:'nudge'}, h('b',{},'Tip:'),' add ',h('code',{},"meta({ priority: 'P1', severity: 'major', owner: 'priya', feature: 'checkout' })"),' at the top of a test and this card gains Priority, Severity, Feature and Owner tabs, the failures get ranked, and owners get their own rollup.') : null;
  let cur=tabs[0][0]; const bar=h('div',{class:'bk-tabs'}), body=h('div',{});
  const render=()=>{ body.innerHTML=''; body.append(tabs.find(t=>t[0]===cur)[2]()); bar.querySelectorAll('button').forEach(b=>b.setAttribute('aria-selected',b.dataset.k===cur)); };
  for(const [k,l] of tabs) bar.append(h('button',{'data-k':k,onclick:()=>{cur=k;render();}},l));
  render(); return h('div',{}, nudge, bar, body);
}
function errorSignature(msg){
  return (msg||'').split('\n')[0].replace(/\d+(\.\d+)?(ms|s)\b/g,'N').replace(/\b\d{2,}\b/g,'N').replace(/["'][^"']{0,60}["']/g,'"…"').replace(/\s+/g,' ').trim().slice(0,160);
}
function failureClusters(){
  const m=new Map();
  for(const t of data.tests){ if(!isFail(t.outcome)) continue; const r=t.results[t.results.length-1]; const e=r&&r.errors[0]; const x=e&&e.explain; const sig=x&&!/^(thrown|script)$/.test(x.kind)? x.kind+'|'+(x.locator||x.url||'')+'|'+(x.matcher||x.action||'') : errorSignature(e?e.message:'(no error message)'); const c=m.get(sig)||{sig,sample:e?e.message.split('\n').slice(0,2).join('\n'):'(no error message)',why:e&&e.explain?e.explain:null,tests:[]}; c.tests.push(t); m.set(sig,c); }
  return [...m.values()].sort((a,b)=>b.tests.length-a.tests.length);
}
function clustersView(cl){
  return h('ol',{class:'clu2'}, cl.map(c=>{
    const byTitle=new Map(); for(const t of c.tests){ const g=byTitle.get(t.title)||[]; g.push(t); byTitle.set(t.title,g); }
    const names=[...byTitle.entries()].slice(0,6), extra=byTitle.size-names.length;
    const who=[]; names.forEach(([title,ts],k)=>{ if(k) who.push(h('span',{class:'sep'},'·')); who.push(h('button',{onclick:()=>select(ts[0].id),title:ts.map(t=>t.project).join(', ')}, title, data.projects.length>1&&ts.length>1? h('small',{},' ×'+ts.length) : null)); });
    if(extra>0) who.push(h('span',{class:'sep'},'·'), h('span',{class:'ex'},'+'+extra+' more'));
    return h('li',{}, h('span',{class:'n'}, c.tests.length, h('small',{},c.tests.length===1?'test':'tests')),
      h('div',{class:'b'}, c.why? h('div',{class:'why-c'}, h('span',{class:'why-k'},c.why.label), ' ', c.why.summary) : null, h('div',{class:'msg',title:c.sample}, c.sample.split('\n')[0]), h('div',{class:'who'}, who)));
  }));
}
function trend(){
  const H=data.history, W=760, HT=170, padL=34, padR=12, padT=12, padB=26, n=H.length;
  const x=i=>padL+(n===1?0:i/(n-1))*(W-padL-padR), y=v=>padT+(1-v/100)*(HT-padT-padB);
  const rate=e=>{ const ran=e.total-e.skipped; return ran?Math.round(e.passed/ran*100):0; };
  const failPct=e=>{ const ran=e.total-e.skipped; return ran?Math.round(e.failed/ran*100):0; };
  const maxD=Math.max(...H.map(e=>e.duration),1);
  let svg='<g class="grid">'; for(const v of [0,25,50,75,100]) svg+='<line x1="'+padL+'" x2="'+(W-padR)+'" y1="'+y(v)+'" y2="'+y(v)+'"/><text x="'+(padL-6)+'" y="'+(y(v)+3)+'" text-anchor="end">'+v+'%</text>'; svg+='</g>';
  svg+=H.map((e,i)=>'<rect class="dur" x="'+(x(i)-6)+'" y="'+(y(0)-(e.duration/maxD)*(HT-padT-padB)*0.5)+'" width="12" height="'+((e.duration/maxD)*(HT-padT-padB)*0.5)+'" rx="2"><title>'+ms(e.duration)+'</title></rect>').join('');
  svg+='<path class="area" d="M'+x(0)+','+y(0)+' '+H.map((e,i)=>'L'+x(i)+','+y(rate(e))).join(' ')+' L'+x(n-1)+','+y(0)+' Z"/>';
  svg+='<polyline class="fail" points="'+H.map((e,i)=>x(i)+','+y(failPct(e))).join(' ')+'"/>';
  svg+='<polyline class="pass" points="'+H.map((e,i)=>x(i)+','+y(rate(e))).join(' ')+'"/>';
  svg+=H.map((e,i)=>'<circle class="pt'+(i===n-1?' now':'')+'" cx="'+x(i)+'" cy="'+y(rate(e))+'" r="3.5"><title>'+new Date(e.time).toLocaleString()+(e.label?' · '+e.label:'')+' · '+rate(e)+'% pass · '+e.failed+' failed · '+ms(e.duration)+'</title></circle>').join('');
  const step=Math.max(1,Math.ceil(n/8));
  svg+=H.map((e,i)=>(i===n-1||(i%step===0&&n-1-i>=step))?'<text x="'+x(i)+'" y="'+(HT-6)+'" text-anchor="'+(i===n-1&&n>1?'end':'middle')+'">'+(e.label||new Date(e.time).toLocaleDateString(undefined,{month:'short',day:'numeric'}))+'</text>':'').join('');
  const colW=n>1?(x(1)-x(0)):(W-padL-padR);
  svg+='<line class="guide" x1="0" x2="0" y1="'+padT+'" y2="'+y(0)+'" style="display:none"/>';
  svg+=H.map((e,i)=>'<rect class="hit" data-i="'+i+'" x="'+(x(i)-colW/2)+'" y="0" width="'+colW+'" height="'+HT+'" fill="transparent"/>').join('');
  const svgEl=h('div',{html:'<svg viewBox="0 0 '+W+' '+HT+'">'+svg+'</svg>'}).firstChild;
  const tip=h('div',{class:'ttip'}); tip.hidden=true;
  const wrap=h('div',{class:'trend'}, svgEl, tip);
  const guide=svgEl.querySelector('.guide');
  const show=(i,ev)=>{ const e=H[i], ran=e.total-e.skipped, prev=H[i-1];
    const d=prev? rate(e)-rate(prev) : null;
    tip.innerHTML='<div class="tt-h">'+escape(e.label||'Run '+(i+1))+'<span>'+escape(new Date(e.time).toLocaleString())+'</span></div>'
      +'<div class="tt-big">'+rate(e)+'% <small>pass rate'+(d==null?'':d===0?' · same as previous':' · '+(d>0?'+':'')+d+' pts vs previous')+'</small></div>'
      +'<div class="tt-row"><i style="background:var(--pass)"></i>Passed<b>'+e.passed+'</b></div>'
      +'<div class="tt-row"><i style="background:var(--fail)"></i>Failed<b>'+e.failed+'</b></div>'
      +(e.flaky?'<div class="tt-row"><i style="background:var(--flaky)"></i>Flaky<b>'+e.flaky+'</b></div>':'')
      +(e.skipped?'<div class="tt-row"><i style="background:var(--skip)"></i>Skipped<b>'+e.skipped+'</b></div>':'')
      +'<div class="tt-row"><i style="background:var(--accent)"></i>Duration<b>'+ms(e.duration)+'</b></div>'
      +'<div class="tt-row"><i style="background:transparent"></i>Total<b>'+e.total+'</b></div>';
    tip.hidden=false; guide.style.display=''; guide.setAttribute('x1',x(i)); guide.setAttribute('x2',x(i));
    const box=wrap.getBoundingClientRect(); let lx=ev.clientX-box.left+14, ly=ev.clientY-box.top+14;
    if(lx+240>box.width) lx=Math.max(0,ev.clientX-box.left-254); if(ly+170>box.height) ly=Math.max(0,ly-190);
    tip.style.left=lx+'px'; tip.style.top=ly+'px'; };
  svgEl.addEventListener('mousemove',ev=>{ const r=ev.target.closest&&ev.target.closest('.hit'); if(!r){ tip.hidden=true; guide.style.display='none'; return; } show(+r.dataset.i,ev); });
  svgEl.addEventListener('mouseleave',()=>{ tip.hidden=true; guide.style.display='none'; });
  wrap.append(
    h('div',{class:'trend-cap'}, h('span',{style:'color:var(--pass)'},'— pass rate'), h('span',{style:'color:var(--fail)'},'- - fail rate'), h('span',{style:'color:var(--accent)'},'▮ duration'), h('span',{style:'margin-left:auto'}, 'this run: '+rate(H[n-1])+'% · '+ms(H[n-1].duration))));
  return wrap;
}
function workers(){
  const lanes=[]; for(let i=0;i<data.workers;i++) lanes.push({i,tests:0,fail:0,ms:0});
  for(const t of data.tests) for(const r of t.results){ const l=lanes[r.workerIndex]; if(!l) continue; l.tests++; l.ms+=r.duration; if(isFail(r.status)) l.fail++; }
  const max=Math.max(...lanes.map(l=>l.ms),1), busy=lanes.reduce((a,l)=>a+l.ms,0);
  const util=data.duration? Math.round(busy/(data.duration*data.workers)*100):0;
  return h('div',{}, h('div',{class:'wk-sum'}, data.workers+' parallel worker'+(data.workers===1?'':'s')+' · '+util+'% busy · wall clock '+ms(data.duration)+' vs '+ms(busy)+' of test time'),
    h('div',{class:'wk'}, lanes.map(l=>h('div',{class:'row'}, h('span',{class:'k'},'w'+l.i), h('span',{class:'bar'}, h('i',{style:'width:'+((l.ms-0)/max*100)+'%;background:'+(l.fail?'var(--fail)':'var(--pass)'),title:ms(l.ms)})), h('span',{class:'n'}, l.tests+' runs'+(l.fail?' · '+l.fail+' ✕':'')+' · '+ms(l.ms))))));
}
function byFile(){
  const m=new Map(); for(const t of data.tests){ const e=m.get(t.file)||{n:0,f:0,fl:0,ms:0}; e.n++; e.ms+=t.duration; if(isFail(t.outcome)) e.f++; if(t.outcome==='flaky') e.fl++; m.set(t.file,e); }
  const list=[...m.entries()].sort((a,b)=>b[1].f-a[1].f||b[1].n-a[1].n);
  return h('div',{class:'dim'}, list.map(([f,e])=>h('button',{class:'row',title:f+' · '+ms(e.ms),onclick:()=>{ const inp=document.querySelector('.tools input'); inp.value=f; state.q=f.toLowerCase(); refresh(); showView('tests'); }},
    h('span',{class:'k',style:'font:12px var(--mono)'},f.split('/').pop()), h('span',{class:'bar'}, h('i',{style:'width:'+((e.n-e.f-e.fl)/e.n*100)+'%;background:var(--pass)'}), h('i',{style:'width:'+(e.fl/e.n*100)+'%;background:var(--flaky)'}), h('i',{style:'width:'+(e.f/e.n*100)+'%;background:var(--fail)'})),
    h('span',{class:'n'}, e.f?h('b',{},e.f+' ✕ '):null, e.n))));
}
function timeline(){
  const W=900, laneH=18, pad=44, gap=6;
  const t0=data.startTime, t1=Math.max(...data.tests.flatMap(t=>t.results.map(r=>r.startTime+r.duration)), t0+1);
  const span=t1-t0, H=data.workers*(laneH+gap)+24;
  const x = t => pad+ (t-t0)/span*(W-pad-8);
  let s='';
  for(let i=0;i<data.workers;i++){ const y=i*(laneH+gap)+2; s+='<rect class="lane" x="'+pad+'" y="'+y+'" width="'+(W-pad-8)+'" height="'+laneH+'" rx="2"/><text x="0" y="'+(y+13)+'">w'+i+'</text>'; }
  for(const t of data.tests) for(const r of t.results){
    const y=r.workerIndex*(laneH+gap)+2, x0=x(r.startTime), w=Math.max(2,x(r.startTime+r.duration)-x0);
    const c = isFail(r.status)?'var(--fail)': r.status==='skipped'?'var(--skip)': (t.outcome==='flaky'?'var(--flaky)':'var(--pass)');
    s+='<rect class="r" data-id="'+t.id+'" x="'+x0+'" y="'+(y+3)+'" width="'+w+'" height="'+(laneH-6)+'" fill="'+c+'" style="cursor:pointer"><title>'+escape(t.title)+' (retry '+r.retry+') · '+ms(r.duration)+'</title></rect>';
  }
  const ticks=4; for(let i=0;i<=ticks;i++){ const t=t0+span*i/ticks; s+='<text x="'+x(t)+'" y="'+(H-4)+'" text-anchor="'+(i===ticks?'end':i===0?'start':'middle')+'">'+ms(t-t0)+'</text>'; }
  const svg=h('div',{html:'<svg class="tl" viewBox="0 0 '+W+' '+H+'" xmlns="http://www.w3.org/2000/svg">'+s+'</svg>'});
  svg.addEventListener('click',e=>{const id=e.target.getAttribute('data-id'); if(id) select(id);});
  return svg;
}
function slowest(){
  const top=[...data.tests].filter(t=>t.outcome!=='skipped').sort((a,b)=>b.duration-a.duration).slice(0,5);
  const max=top[0]?top[0].duration:1;
  return h('ul',{class:'slow'}, top.map(t=>h('li',{}, h('button',{onclick:()=>select(t.id)},
    h('span',{}, h('span',{class:'t'},t.title), h('span',{class:'bar',style:'--w:'+Math.max(4,Math.round(t.duration/max*100))+'%'}, h('i',{}))), h('span',{class:'d'},ms(t.duration))))));
}
function projects(){
  return h('div',{class:'proj'}, data.projects.map(p=>{
    const ts=data.tests.filter(t=>t.project===p), n=ts.length||1;
    const cnt=k=>ts.filter(t=>k==='failed'?isFail(t.outcome):t.outcome===k).length;
    return h('div',{class:'row'}, h('span',{class:'name',title:p},p),
      h('span',{class:'bar'}, ['passed','flaky','failed'].map(k=>h('i',{style:'width:'+(cnt(k)/n*100)+'%;background:var(--'+(k==='failed'?'fail':k==='passed'?'pass':'flaky')+')'}))),
      h('span',{class:'d',style:'font:11px var(--mono);color:var(--ink-3)'}, cnt('passed')+'/'+ts.length));
  }));
}

/* ---------- main ---------- */
function main(){
  const projSel = h('select',{id:'projsel',onchange:e=>{state.project=e.target.value;refresh();}}, h('option',{value:'all'},'All projects'), data.projects.map(p=>h('option',{value:p},p)));
  return h('div',{class:'main'},
    h('aside',{class:'list'},
      h('div',{class:'tools'}, h('input',{type:'search',placeholder:'Search tests, tags, files…',oninput:e=>{state.q=e.target.value.toLowerCase();refresh();}}), data.projects.length>1?projSel:null,
        h('div',{class:'seg'}, [['file','Spec files'],['folder','Folders'],['flat','Flat']].map(([k,l])=>h('button',{'data-g':k,'aria-pressed':state.group===k,onclick:()=>{state.group=k;refresh();}},l))),
        DIMS.length? h('div',{class:'dims'}, DIMS.map(d=>h('select',{'data-dim':d,onchange:e=>{state.dims[d]=e.target.value||null;refresh();}}, h('option',{value:''},'Any '+d), dimValues(d).map(v=>h('option',{value:v},v))))) : null),
      h('div',{class:'items',id:'items'}),
      h('div',{class:'hint-kbd'}, h('span',{class:'kbd'},'j'),' / ',h('span',{class:'kbd'},'k'),' next / prev · ',h('span',{class:'kbd'},'f'),' failed only · ',h('span',{class:'kbd'},'/'),' search · ',h('span',{class:'kbd'},'1'),'–',h('span',{class:'kbd'},'5'),' switch view')),
    h('section',{class:'detail',id:'detail'}));
}
function visible(){
  return data.tests.filter(t=>{
    if(state.project!=='all'&&t.project!==state.project) return false;
    for(const d of DIMS) if(state.dims[d]&&t.meta[d]!==state.dims[d]) return false;
    if(state.status==='failed'? !isFail(t.outcome) : state.status!=='all'&&t.outcome!==state.status) return false;
    if(state.q){ const hay=(t.path.join(' ')+' '+t.title+' '+t.file+' '+t.tags.join(' ')+' '+t.project+' '+Object.values(t.meta).join(' ')).toLowerCase(); if(!hay.includes(state.q)) return false; }
    return true;
  });
}
function refresh(){
  document.querySelectorAll('.pill').forEach(p=>p.setAttribute('aria-pressed',p.dataset.k===state.status));
  document.querySelectorAll('.dim .row').forEach(r=>{ const card=r.closest('.card'); const d=card.querySelector('h2').textContent.replace(/^By /,''); r.setAttribute('aria-pressed', state.dims[d]===r.querySelector('.k').textContent); });
  document.querySelectorAll('select[data-dim]').forEach(sel=>{ sel.value=state.dims[sel.dataset.dim]||''; });
  const ps=$('#projsel'); if(ps) ps.value=state.project;
  const vis=visible(), ids=new Set(vis.map(t=>t.id));
  document.querySelectorAll('.cell').forEach(c=>c.classList.toggle('dim',!ids.has(c.dataset.id)));
  const box=$('#items'); box.innerHTML='';
  if(!vis.length){ box.append(h('div',{class:'empty'},'No tests match. Clear the search or pick another filter.')); return; }
  document.querySelectorAll('.seg button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.g===state.group));
  const item=(t,inGroup)=>h('button',{class:'item','data-id':t.id,'aria-current':state.selected===t.id,onclick:()=>select(t.id)},
      h('span',{class:'st '+t.outcome}),
      h('span',{class:'tt'}, t.path.length&&!inGroup?h('div',{class:'p'},t.path.join(' › ')):null, h('div',{class:'n'},t.title), h('div',{class:'d'}, ms(t.duration)+(t.results.length>1?' · '+t.results.length+' attempts':'')+(data.projects.length>1?' · '+t.project:'')+(t.outcome==='skipped'&&skipReason(t)?' · '+skipReason(t):'')+(t.expectedFailure?' · expected failure':''))));
  const counts=ts=>{ const f=ts.filter(t=>isFail(t.outcome)).length; return h('span',{class:'cnt'}, f?h('b',{},f+' ✕'):null, h('span',{},ts.length)); };
  // describe blocks: a header per level, tests indented under it
  const grouped=(ts,indent)=>{
    const out=[]; let last=[];
    for(const t of ts){
      const p=t.path; let i=0; while(i<p.length && i<last.length && p[i]===last[i]) i++;
      for(let d=i; d<p.length; d++){
        const inSuite=ts.filter(x=>x.path.length>d && p.slice(0,d+1).every((seg,k)=>x.path[k]===seg));
        out.push(h('div',{class:'suite',style:'padding-left:'+(indent+d*14)+'px'}, h('span',{class:'tw'},'▾'), h('span',{class:'sn'},p[d]), counts(inSuite)));
      }
      const el=item(t,true); el.style.paddingLeft=(indent+p.length*14)+'px'; out.push(el); last=p;
    }
    return out;
  };
  if(state.group==='flat'){ for(const t of vis) box.append(item(t)); }
  else if(state.group==='file'){
    const byF=new Map(); for(const t of vis){ if(!byF.has(t.file)) byF.set(t.file,[]); byF.get(t.file).push(t); }
    for(const [f,ts] of byF){ box.append(h('div',{class:'file'},f)); for(const el of grouped(ts,12)) box.append(el); }
  } else {
    // folder tree
    const root={dirs:new Map(),files:new Map()};
    for(const t of vis){ const parts=t.file.split('/'); const fname=parts.pop(); let node=root; for(const p of parts){ if(!node.dirs.has(p)) node.dirs.set(p,{dirs:new Map(),files:new Map()}); node=node.dirs.get(p); } if(!node.files.has(fname)) node.files.set(fname,[]); node.files.get(fname).push(t); }
    const allTests=n=>[...n.files.values()].flat().concat([...n.dirs.values()].flatMap(allTests));
    const render=(node,path,depth)=>{
      const out=[];
      for(const [name,child] of [...node.dirs.entries()].sort()){ const key=path+name+'/'; const open=state.open[key]!==false; const ts=allTests(child);
        out.push(h('button',{class:'folder',style:'padding-left:'+(12+depth*14)+'px',onclick:()=>{state.open[key]=!open;refresh();}}, h('span',{class:'tw'},open?'▾':'▸'), '📁 '+name, counts(ts)));
        if(open) out.push(...render(child,key,depth+1)); }
      for(const [name,ts] of [...node.files.entries()].sort()){ const key=path+name; const open=state.open[key]!==false;
        out.push(h('button',{class:'file-row',style:'padding-left:'+(12+depth*14)+'px',onclick:()=>{state.open[key]=!open;refresh();}}, h('span',{class:'tw'},open?'▾':'▸'), name, h('span',{class:'mini'}, ts.map(t=>h('i',{style:'background:'+colorOf(bucket(t))})))));
        if(open) out.push(...grouped(ts,24+depth*14)); }
      return out;
    };
    for(const el of render(root,'',0)) box.append(el);
  }
}
function firstInteresting(){ const f=data.tests.find(t=>isFail(t.outcome))||data.tests.find(t=>t.outcome==='flaky')||data.tests[0]; return f&&f.id; }

/* ---------- detail ---------- */
function select(id, quiet){
  const t=data.tests.find(x=>x.id===id); if(!t) return;
  state.selected=id; state.retry=t.results.length-1; if(!quiet){ if(state.view!=='tests') showView('tests'); else setHash(); } refresh(); renderDetail(t);
  const it=document.querySelector('.item[data-id="'+id+'"]'); if(it&&it.scrollIntoView) it.scrollIntoView({block:'nearest'});
}
function renderDetail(t){
  const d=$('#detail'); d.innerHTML='';
  d.append(h('div',{class:'crumb'}, [t.file, ...t.path.map(p=>data.bdd&&!/^Feature:/i.test(p)?'Feature: '+p:p)].map(p=>h('span',{},p))),
    h('div',{class:'titlebar'}, h('h3',{},t.title), h('div',{class:'actions'},
      h('button',{class:'btn',onclick:e=>copyText(location.href.split('#')[0]+'#t='+t.id,e.currentTarget,'Link copied')},'Copy link'),
      (()=>{ const r=t.results[t.results.length-1]; const e=r&&r.errors[0]; return e? [h('button',{class:'btn',onclick:ev=>copyText(t.title+'\n'+t.file+':'+t.line+'\n\n'+e.message,ev.currentTarget,'Error copied')},'Copy error'), h('button',{class:'btn primary',onclick:()=>openBugReport(t)},'Bug report')] : null; })(),
      editorLink(t))),
    h('div',{class:'badges'}, h('span',{class:'badge '+t.outcome},label[t.outcome]), t.expectedFailure? h('span',{class:'badge xfail',title:'Marked test.fail(): failing is the expected result'},'Expected failure') : null, sinceBadge(t), dots(t,10), data.bdd?h('span',{class:'badge scenario'},'Scenario'):null, t.tags.map(g=>h('span',{class:'badge tag'},g)), data.projects.length>1?h('span',{class:'badge tag'},t.project):null, h('span',{class:'loc'}, t.file+':'+t.line+' · '+ms(t.duration)+(t.outcome==='timedOut'&&t.timeout?' · timeout '+ms(t.timeout):'')+(t.retries?' · retries '+t.retries:''))));
  const metaKeys=Object.keys(t.meta);
  const linkFor=(k,v)=>{ const tpl=data.options.links[k]||data.options.links['*']; if(tpl) return tpl.replace('{id}',encodeURIComponent(v)); if(/^https?:\/\//.test(v)) return v; return null; };
  if(metaKeys.length) d.append(h('div',{class:'metas'}, metaKeys.map(k=>{ const v=t.meta[k], low=/^(P[3-4]|low|minor|trivial|normal|medium)$/i.test(v), href=linkFor(k,v); return h('span',{class:'meta '+k+(low?' low':'')}, h('span',{class:'k'},k), href? h('a',{href,target:'_blank',rel:'noopener'},v) : h('span',{class:'v'},v)); })));
  const otherAnn=t.annotations.filter(a=>!DIMS.includes(a.type.toLowerCase()) && !(a.type.toLowerCase() in t.meta));
  if(otherAnn.length) d.append(h('h4',{},'Annotations'), h('dl',{class:'kv'}, otherAnn.map(a=>[h('dt',{},a.type),h('dd',{},a.description||'')])));
  if(t.results.length>1){
    d.append(h('div',{class:'tabs'}, t.results.map((r,i)=>h('button',{class:'tab','aria-selected':state.retry===i,onclick:()=>{state.retry=i;renderDetail(t);}}, (i===0?'Attempt 1':'Retry '+i)+' · '+(label[r.status]||r.status)))));
  }
  const r=t.results[state.retry]; if(!r){ d.append(h('p',{class:'empty'},'This test did not run.')); return; }
  const body=h('div',{});
  if(t.note&&state.retry===t.results.length-1) body.append(h('div',{class:'note '+(t.outcome==='passed'?'ok':'warn')}, t.note));
  if(r.errors.length){ body.append(h('h4',{},r.errors.length>1?'Errors':'Error'), ...r.errors.map(errorView)); }
  if(r.steps.length){ const stepTotal=Math.max(1, r.duration||0, r.steps.reduce((a,x)=>a+x.duration,0)); body.append(h('h4',{},data.bdd?'Scenario steps':'Steps', h('span',{class:'hint'},'bar = share of '+ms(stepTotal))), stepTree(r.steps, stepTotal)); }
  if(r.logs.length){ const t0=r.startTime; body.append(h('h4',{},'Log'), h('div',{class:'logs'}, r.logs.map(l=>h('div',{class:'ln'+(/\b(error|fail|exception)\b/i.test(l.msg)?' err':/\bwarn/i.test(l.msg)?' warn':'')}, h('span',{class:'ts'},'+'+ms(Math.max(0,l.t-t0))), h('span',{class:'lm'},l.msg))))); }
  for(const b of r.data){ body.append(h('h4',{},b.name), dataBlock(b)); }
  if(r.api.length){ body.append(h('h4',{},r.api.length+' API call'+(r.api.length>1?'s':'')), ...r.api.map(apiPanel)); body.append(h('div',{class:'mask-note'},'Secrets and auth headers are masked as ****')); }
  const imgs=r.attachments.filter(a=>a.src&&a.contentType.startsWith('image/'));
  const vids=r.attachments.filter(a=>a.src&&a.contentType.startsWith('video/'));
  const traces=r.attachments.filter(a=>a.src&&(a.name==='trace'||/\.zip$/.test(a.src)));
  const files=r.attachments.filter(a=>a.src&&!imgs.includes(a)&&!vids.includes(a)&&!traces.includes(a));
  const texts=r.attachments.filter(a=>a.text!=null);
  // visual comparison sets: <name>-expected / -actual / -diff
  const cmp=new Map();
  for(const a of imgs){ const m=a.name.match(/^(.*)-(expected|actual|diff)(\.\w+)?$/); if(m){ const set=cmp.get(m[1])||{}; set[m[2]]=a; cmp.set(m[1],set); } }
  const plainImgs=imgs.filter(a=>!/-(expected|actual|diff)(\.\w+)?$/.test(a.name));
  for(const [name,set] of cmp) if(set.expected&&set.actual) body.append(h('h4',{},'Visual comparison · '+name), compare(set)); else for(const k of Object.keys(set)) plainImgs.push(set[k]);
  if(vids.length){ body.append(h('h4',{},vids.length>1?'Videos':'Video'), h('div',{class:'vids'}, vids.map(a=>{ const fig=h('figure',{}); const v=h('video',{src:a.src,controls:'',preload:'metadata',playsinline:''});
    v.addEventListener('error',()=>{ const code=v.error&&v.error.code; const why=code===4?'The file is missing, or it is not a format this browser can play.':code===2?'The file could not be read.':'The file could not be decoded.'; v.replaceWith(h('div',{class:'att-err'}, h('b',{},'Video could not be loaded.'), ' '+why+' Expected at ', h('code',{},a.src), '. Common causes: on macOS, Chrome cannot read files next to a report opened from Downloads, Desktop or Documents until you allow it under System Settings → Privacy & Security → Files and Folders (or move the project elsewhere); or the assets folder was replaced by a newer run. Setting embedVideos: true in the reporter options puts videos inside the HTML and avoids both.')); });
    fig.append(v, h('figcaption',{}, a.name, a.size?h('span',{},' · '+kb(a.size)):null, ' · ', h('a',{href:a.src,download:'',target:'_blank',rel:'noopener',title:'Downloads when the report is served over http; opens in a new tab when opened as a file'},'download'))); return fig; }))); }
  if(plainImgs.length){ body.append(h('h4',{},plainImgs.length>1?'Screenshots':'Screenshot'), h('div',{class:'att'}, plainImgs.map(a=>h('figure',{}, h('img',{src:a.src,alt:a.name,loading:'lazy',onclick:()=>lightbox(a.src)}), h('figcaption',{},a.name))))); }
  if(traces.length){ body.append(h('h4',{},'Trace'), h('div',{class:'trace'}, traces.map(a=>h('div',{class:'trace-card'},
    h('div',{}, h('b',{},a.name), a.size?h('span',{style:'color:var(--ink-3)'},' · '+kb(a.size)):null),
    h('div',{class:'trace-how'}, 'Open with ', h('code',{},'npx playwright show-trace '+a.src), ' or drop the file on ', h('a',{href:'https://trace.playwright.dev',target:'_blank',rel:'noopener'},'trace.playwright.dev')),
    h('a',{class:'dl',href:a.src,download:''},'Download trace'))))); }
  if(files.length){ body.append(h('h4',{},'Files'), h('div',{class:'att'}, files.map(a=>h('figure',{}, h('div',{class:'file'}, h('a',{href:a.src,download:''},a.name), h('div',{style:'font-size:11px;color:var(--ink-3)'},a.contentType+(a.size?' · '+kb(a.size):''))))))); }
  for(const a of texts){ if(/^error-context/i.test(a.name)) body.append(h('details',{class:'errfull'}, h('summary',{},'Error context (written by Playwright for AI tools)'), h('pre',{class:'txt'},a.text))); else body.append(h('h4',{},a.name), h('pre',{class:'txt'},a.text)); }
  const conLines=(arr,forceErr)=>arr.join('').split('\n').filter(x=>x.trim()).map(x=>h('div',{class:'ln'+(forceErr||/\b(error|fail|exception)\b/i.test(x)?' err':/\bwarn/i.test(x)?' warn':'')}, h('span',{class:'lm'},x)));
  if(r.stdout.length) body.append(h('h4',{},'Console output', h('span',{class:'hint'},'console.log in this test')), h('div',{class:'logs plain'}, conLines(r.stdout,false)));
  if(r.stderr.length) body.append(h('h4',{},'Console errors', h('span',{class:'hint'},'console.error in this test')), h('div',{class:'logs plain'}, conLines(r.stderr,true)));
  if(!body.children.length) body.append(h('p',{style:'color:var(--ink-3)'}, r.status==='skipped'?'Skipped — nothing was executed.'+(skipReason(t)?' Reason: '+skipReason(t):''):'Passed with no steps or attachments recorded.'));
  d.append(body);
}
function stepTree(steps, total){
  return h('ul',{class:'steps'}, steps.map(s=>{
    const bad=!!s.error, kids=s.steps.length>0, pct=total?Math.min(100,s.duration/total*100):0;
    const li=h('li',{class:kids&&!hasError(s)?'collapsed':''});
    const row=h('div',{class:'step'+(bad?' bad':'')},
      h('span',{class:'tw'}, kids? '▸' : ''), data.bdd?null:h('span',{class:'cat'},s.category), gherkin(s.title), total? h('span',{class:'tb',title:Math.round(pct)+'% of the test'}, h('i',{class:pct>=30?'slow':'',style:'width:'+Math.max(pct,s.duration>0?1.5:0)+'%'})) : null, h('span',{class:'d'},ms(s.duration)));
    if(kids){ row.style.cursor='pointer'; row.addEventListener('click',()=>{li.classList.toggle('collapsed'); row.querySelector('.tw').textContent=li.classList.contains('collapsed')?'▸':'▾';}); if(!li.classList.contains('collapsed')) row.querySelector('.tw').textContent='▾'; }
    li.append(row); if(bad) li.append(h('div',{class:'e'},s.error)); if(kids) li.append(stepTree(s.steps, total));
    return li;
  }));
}
function gherkin(title){ const m=data.bdd&&title.match(/^(Given|When|Then|And|But)\b\s*(.*)$/); if(!m) return h('span',{class:'t',title},title); return h('span',{class:'t',title}, h('span',{class:'kw'+(/^(And|But)$/.test(m[1])?' and':'')},m[1]), m[2]); }
function hasError(s){ return !!s.error || s.steps.some(hasError); }
function dataBlock(b){
  if(b.kind==='table') return h('div',{}, h('div',{class:'tbl-wrap'}, h('table',{class:'tbl'}, h('thead',{}, h('tr',{}, b.columns.map(c=>h('th',{},c)))), h('tbody',{}, b.rows.map(r=>h('tr',{}, r.map(c=>h('td',{class:c==='****'?'mask':'',title:c},c))))))), h('div',{class:'mask-note'}, b.rows.length+' rows · sensitive columns masked'));
  if(b.kind==='kv') return h('dl',{class:'kv2'}, b.kv.map(([k,v])=>[h('dt',{},k),h('dd',{class:v==='****'?'mask':''},v)]));
  return h('pre',{class:'txt'},b.text);
}
function apiPanel(c){
  const st=c.status||0, cls=st>=500||st>=400?'bad':st>=300?'warn':'ok';
  const wrap=h('div',{class:'api collapsed'});
  const head=h('button',{class:'api-head',onclick:()=>wrap.classList.toggle('collapsed')}, h('span',{class:'m '+c.method.toUpperCase()},c.method.toUpperCase()), h('span',{class:'u',title:c.url},c.url), st?h('span',{class:'sc '+cls},st):null, c.duration!=null?h('span',{class:'d'},ms(c.duration)):null);
  const pre=v=>v==null?null:h('pre',{}, typeof v==='string'?v:JSON.stringify(v,null,2));
  const col=(title,headers,bodyv)=>h('div',{class:'api-col'}, h('h5',{},title), headers&&Object.keys(headers).length? [h('h5',{},'Headers'), pre(headers)] : null, bodyv!=null? [h('h5',{},'Body'), pre(bodyv)] : h('div',{style:'font-size:12px;color:var(--ink-3)'},'no body'));
  const tools=h('div',{class:'api-tools'}, h('button',{class:'btn',onclick:e=>copyText(curlOf(c),e.currentTarget,'Copied')},'Copy as cURL'), h('button',{class:'btn',onclick:e=>copyText(c.url,e.currentTarget,'Copied')},'Copy URL'));
  wrap.append(head, h('div',{class:'api-body'}, col('Request',c.requestHeaders,c.requestBody), col('Response',c.responseHeaders,c.responseBody)), tools);
  if(cls==='bad') wrap.classList.remove('collapsed');
  return wrap;
}
function curlOf(c){
  const q=v=>"'"+String(v).replace(/'/g,"'\\''")+"'";
  const hdr=c.requestHeaders||{}, type=Object.keys(hdr).filter(k=>k.toLowerCase()==='content-type').map(k=>hdr[k])[0]||'';
  const parts=['curl -X '+c.method.toUpperCase()+' '+q(c.url)];
  for(const k of Object.keys(hdr)) parts.push('-H '+q(k+': '+hdr[k]));
  if(c.requestBody!=null){
    let b=c.requestBody;
    if(typeof b==='object' && /x-www-form-urlencoded/i.test(type)) b=Object.keys(b).map(k=>encodeURIComponent(k)+'='+encodeURIComponent(String(b[k]))).join('&');
    else if(typeof b!=='string') b=JSON.stringify(b);
    if(!/^<(binary|file|multipart)/.test(b)) parts.push('--data-raw '+q(b));
  }
  return parts.join(' \\\n  ');
}
function kb(n){ return n<1024?n+' B':n<1048576?(n/1024).toFixed(0)+' KB':(n/1048576).toFixed(1)+' MB'; }
function compare(set){
  const wrap=h('div',{class:'cmp'});
  const tabs=h('div',{class:'cmp-tabs'});
  const stage=h('div',{class:'cmp-stage'});
  const views={
    slider:()=>{ const s=h('div',{class:'cmp-slider'}, h('img',{src:set.expected.src,alt:'expected'}), h('div',{class:'cmp-top'}, h('img',{src:set.actual.src,alt:'actual'})), h('div',{class:'cmp-handle'}));
      const rng=h('input',{type:'range',min:0,max:100,value:50,'aria-label':'Compare'}); const upd=()=>{ s.querySelector('.cmp-top').style.width=rng.value+'%'; s.querySelector('.cmp-handle').style.left=rng.value+'%'; }; rng.addEventListener('input',upd); upd();
      return h('div',{}, s, rng, h('div',{class:'cmp-cap'}, h('span',{},'expected'), h('span',{},'actual'))); },
    side:()=>h('div',{class:'cmp-side'}, ['expected','actual','diff'].filter(k=>set[k]).map(k=>h('figure',{}, h('img',{src:set[k].src,alt:k,onclick:()=>lightbox(set[k].src)}), h('figcaption',{},k)))),
    diff:()=>set.diff? h('figure',{class:'cmp-one'}, h('img',{src:set.diff.src,alt:'diff',onclick:()=>lightbox(set.diff.src)})) : h('p',{style:'color:var(--ink-3)'},'No diff image attached.'),
  };
  let cur='slider';
  const render=()=>{ stage.innerHTML=''; stage.append(views[cur]()); tabs.querySelectorAll('button').forEach(b=>b.setAttribute('aria-selected',b.dataset.v===cur)); };
  for(const [v,l] of [['slider','Slider'],['side','Side by side'],['diff','Diff']]) tabs.append(h('button',{class:'tab','data-v':v,onclick:()=>{cur=v;render();}},l));
  wrap.append(tabs,stage); render(); return wrap;
}
/* ---- bug report: a ready-to-paste ticket built from the failure ---- */
function bugModel(t){
  const r=t.results[t.results.length-1], e=r&&r.errors[0], x=e&&e.explain, msg=e?e.message:'';
  const ex=msg.match(/^(Expected[^:\n]{0,40}):[ \t]*(.+)$/m), rc=msg.match(/^(Received[^:\n]{0,40}):[ \t]*(.+)$/m);
  const si=sinceInfo(t);
  const steps=[]; const walk=(list,depth)=>{ for(const st of list){ if(st.category==='hook'||/^Attach "/.test(st.title)||/^Worker Cleanup/.test(st.title)) continue; const user=st.category==='test.step'; if(user||depth===0) steps.push({title:st.title.replace(/^(Given|When|Then|And|But)\s+/,m=>m), failed:!!st.error, user}); if(user&&st.steps.length&&!st.steps.some(c=>c.category==='test.step')) continue; if(st.steps.length) walk(st.steps,depth+1); } };
  if(r) walk(r.steps,0);
  const userSteps=steps.filter(s=>s.user); const repro=(userSteps.length?userSteps:steps).filter(s=>!/^Expect "/.test(s.title)||s.failed);
  const env=[]; if(data.options.project&&data.options.project.name) env.push(['Application', data.options.project.name+(data.options.project.version?' v'+data.options.project.version:'')]);
  for(const [k,v] of Object.entries(data.metadata||{})) env.push([k,v]);
  if(data.projects.length>1||t.project) env.push(['Playwright project', t.project]);
  for(const row of (data.env||[])) if(!/^(Workers|Shard)$/.test(row.k)) env.push([row.k, row.href&&row.href!==row.v? row.v+' ('+row.href+')' : row.v]);
  const dataBlocks=(r?r.data:[]).map(b=>{ if(b.kind==='kv') return {name:b.name, lines:b.kv.map(([k,v])=>k+': '+v)}; if(b.kind==='table') return {name:b.name, lines:b.rows.slice(0,5).map(row=>row.map((c,i)=>(b.columns[i]||'')+'='+c).join(', ')).concat(b.rows.length>5?['… '+(b.rows.length-5)+' more rows']:[])}; return {name:b.name, lines:[String(b.text||'').slice(0,300)]}; });
  const api=(r?r.api:[]).map(c=>c.method.toUpperCase()+' '+c.url+' → '+(c.status||'no response')+(c.duration!=null?' ('+ms(c.duration)+')':''));
  const logs=(r?r.logs:[]).slice(-8).map(l=>l.msg);
  const att=(r?r.attachments:[]).filter(a=>a.contentType.startsWith('image/')||a.contentType.startsWith('video/')||/zip/.test(a.contentType)).map(a=>{ const kind=a.contentType.startsWith('video/')?'video':/zip/.test(a.contentType)?'trace':'screenshot'; return a.name.toLowerCase()===kind? kind : a.name+' ('+kind+')'; });
  const expected= ex? ex[2].trim() : (x&&x.kind==='not-found'? 'The element is present and the step completes.' : x&&x.kind==='not-visible'? 'The element is visible.' : x&&/^(network|navigation)$/.test(x.kind)? 'The page loads.' : x&&x.kind==='api'? 'The API responds successfully.' : 'The step completes and the test passes.');
  const actual= rc? rc[2].trim() : (x? x.summary : msg.split('\n')[0]);
  return { t, r, e, x, si, repro, env, dataBlocks, api, logs, att, expected, actual,
    title: t.title+(x? ' – '+x.label.toLowerCase() : ''),
    where: t.file+':'+t.line+(data.projects.length>1?' ['+t.project+']':''),
    history: si? (si.kind==='new'? 'New failure in this run' : 'Failing since '+runLabel(si.since)) : (t.outcome==='flaky'? 'Flaky: passed on retry' : ''),
    attempts: t.results.length, when: new Date(data.startTime).toLocaleString() };
}
function bugReport(t, fmt){
  const m=bugModel(t), L=[];
  const H=(txt)=> fmt==='jira'? 'h3. '+txt : fmt==='md'? '### '+txt : txt.toUpperCase();
  const B=(txt)=> fmt==='text'? txt : '*'+txt+'*';
  const FENCE=String.fromCharCode(96,96,96);
  const code=(txt)=> fmt==='jira'? ['{code}',txt,'{code}'] : fmt==='md'? [FENCE,txt,FENCE] : [txt];
  const li=(i,txt)=> (fmt==='jira'? '# ' : (i+1)+'. ')+txt;
  const bullet=(txt)=> (fmt==='jira'? '* ' : '- ')+txt;
  const kv=(k,v)=> fmt==='text'? k+': '+v : (fmt==='jira'? '*'+k+':* ' : '**'+k+':** ')+v;
  L.push(fmt==='jira'? 'h2. '+m.title : fmt==='md'? '## '+m.title : m.title, '');
  const pr=[m.t.meta.priority, m.t.meta.severity].filter(Boolean).join(' / ');
  if(pr) L.push(kv('Priority', pr)); if(m.t.meta.owner) L.push(kv('Owner', m.t.meta.owner)); if(m.t.meta.feature) L.push(kv('Feature', m.t.meta.feature));
  for(const k of ['story','epic','issue']) if(m.t.meta[k]) L.push(kv(k[0].toUpperCase()+k.slice(1), m.t.meta[k]));
  L.push(kv('Test', m.where), kv('Run', m.when+(m.attempts>1?' · failed '+m.attempts+' attempts':'')+(m.history?' · '+m.history:'')), '');
  if(m.x){ L.push(H('Summary'), m.x.summary, ''); }
  if(m.env.length){ L.push(H('Environment')); for(const [k,v] of m.env) L.push(bullet(k+': '+v)); L.push(''); }
  if(m.dataBlocks.length){ L.push(H('Test data')); for(const b of m.dataBlocks){ L.push(B(b.name)); for(const ln of b.lines) L.push(bullet(ln)); } L.push(''); }
  L.push(H('Steps to reproduce'));
  if(m.repro.length) m.repro.forEach((s,i)=>L.push(li(i, s.title+(s.failed?'  ← fails here':'')))); else L.push(li(0,'Run the test: '+m.where));
  L.push('', H('Expected result'), m.expected, '', H('Actual result'), m.actual, '');
  if(m.e){ L.push(H('Error')); L.push(...code(m.e.message.split('\n').slice(0,12).join('\n').trim())); L.push(''); }
  if(m.api.length){ L.push(H('API calls')); for(const a of m.api) L.push(bullet(a)); L.push(''); }
  if(m.logs.length){ L.push(H('Test log')); L.push(...code(m.logs.join('\n'))); L.push(''); }
  if(m.att.length){ L.push(H('Attachments')); L.push('In the report next to this test: '+m.att.join(', ')); L.push(''); }
  L.push(fmt==='text'? 'Generated by reportingLabs' : '_Generated by reportingLabs_');
  return L.join('\n').replace(/\n{3,}/g,'\n\n');
}
function openBugReport(t){
  let fmt=localStorage.getItem('rl-bug-fmt')||'md';
  const ta=h('textarea',{class:'bug-ta',spellcheck:'false'});
  const render=()=>{ ta.value=bugReport(t,fmt); ta.scrollTop=0; seg.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.f===fmt)); };
  const seg=h('div',{class:'seg'}, [['md','Markdown'],['jira','Jira'],['text','Plain text']].map(([f,l])=>h('button',{'data-f':f,onclick:()=>{fmt=f; try{localStorage.setItem('rl-bug-fmt',f);}catch(e){} render();}},l)));
  const dlg=h('div',{class:'bugdlg',onclick:e=>{ if(e.target===dlg) dlg.remove(); }},
    h('div',{class:'bug-box',role:'dialog','aria-label':'Bug report'},
      h('div',{class:'bug-head'}, h('h3',{},'Bug report'), h('span',{class:'hint'},'Edit the text if you like, then copy it into Jira, GitHub, Azure DevOps or an email.'), h('button',{class:'btn',onclick:()=>dlg.remove()},'Close')),
      h('div',{class:'bug-tools'}, seg, h('div',{class:'grow'}), h('button',{class:'btn',onclick:()=>download((fileStem()+'-'+t.title.replace(/[^a-z0-9]+/gi,'-').toLowerCase()).slice(0,80)+(fmt==='md'?'.md':'.txt'), ta.value, 'text/plain')},'Download'), h('button',{class:'btn primary',onclick:e=>copyText(ta.value,e.currentTarget,'Copied')},'Copy')),
      ta));
  render(); document.body.append(dlg); ta.scrollTop=0; try{ ta.focus({preventScroll:true}); ta.setSelectionRange(0,0); }catch(e){}
}
function lightbox(src){ const lb=h('div',{class:'lb',onclick:()=>lb.remove()}, h('img',{src})); document.body.append(lb); }
function escape(s){ return s.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
})();
`;
