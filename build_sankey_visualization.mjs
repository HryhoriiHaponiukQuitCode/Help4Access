import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const sourceCsv = "snitcher_export_20260710_142327_0ZrlFmrqaM.csv";
const blueprintJson = "Visit-Parse Domain Info.blueprint.json";
const outputDir = path.join(root, "outputs");
const docsDir = path.join(root, "docs", "2026-07-10-h4a-v7-sankey-filter-visualizer");
const outputPath = path.join(outputDir, "h4a_v7_sankey_filter_visualizer.html");
const docsPath = path.join(docsDir, "index.html");

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        value += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(value);
      value = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        i += 1;
      }
      row.push(value);
      value = "";
      if (row.some((cell) => cell !== "")) {
        rows.push(row);
      }
      row = [];
      continue;
    }

    value += char;
  }

  if (value || row.length) {
    row.push(value);
    rows.push(row);
  }

  const [headers, ...records] = rows;
  return records.map((record) =>
    Object.fromEntries(headers.map((header, index) => [header, record[index] ?? ""])),
  );
}

function clean(value) {
  return String(value ?? "").trim();
}

function secondsFromTime(value) {
  const text = clean(value);
  if (!text) {
    return 0;
  }
  const parts = text.split(":");
  if (parts.length === 3) {
    const [hours, minutes, seconds] = parts.map(Number);
    if ([hours, minutes, seconds].every(Number.isFinite)) {
      return hours * 3600 + minutes * 60 + Math.floor(seconds);
    }
  }
  const numeric = Number(text);
  return Number.isFinite(numeric) ? numeric : 0;
}

function normalizeDomain(value) {
  const text = clean(value);
  if (!text) {
    return "";
  }
  try {
    const candidate = text.includes("://") ? text : `https://${text}`;
    const parsed = new URL(candidate);
    return (parsed.hostname || parsed.pathname).toLowerCase().replace(/^www\./, "");
  } catch {
    return text.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  }
}

function extractPagePaths(value) {
  const text = clean(value);
  if (!text) {
    return "";
  }
  return text
    .split(",")
    .map((item) => {
      const url = item.trim();
      if (!url) {
        return "";
      }
      try {
        const parsed = new URL(url);
        return `${parsed.pathname || "/"}${parsed.search || ""}`;
      } catch {
        return url;
      }
    })
    .filter(Boolean)
    .join(", ");
}

function loadRules(blueprint) {
  const module = blueprint.flow.find((item) => item.id === 2);
  const variables = Object.fromEntries(module.mapper.variables.map((item) => [item.name, item.value]));
  return {
    partnerKeywords: variables.industries.split(",").map((item) => item.trim()).filter(Boolean),
    urlKeywords: variables.urls.split(",").map((item) => item.trim()).filter(Boolean),
  };
}

function buildHtml(payload) {
  const payloadJson = JSON.stringify(payload).replaceAll("<", "\\u003c");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <title>H4A Routing Sankey Visualizer</title>
  <style>
    :root {
      --paper: #f4efe4;
      --card: #fffdf7;
      --chart: #fbf8f0;
      --ink: #232823;
      --muted: #6f7a72;
      --line: #ddd4c2;
      --deep: #122721;
      --blue: #2e6db4;
      --green: #0e8a6c;
      --amber: #a9741a;
      --red: #b34a3a;
      --plum: #7c5296;
      --shadow: 0 10px 30px rgba(52, 42, 24, 0.10);
      --radius: 10px;
      --sans: "Avenir Next", "Segoe UI", "Helvetica Neue", Arial, sans-serif;
      --serif: Georgia, "Times New Roman", serif;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      color: var(--ink);
      background:
        radial-gradient(circle at 15% -6%, rgba(14, 138, 108, 0.10), transparent 30rem),
        radial-gradient(circle at 95% 8%, rgba(169, 116, 26, 0.10), transparent 26rem),
        linear-gradient(180deg, #faf6ec 0%, var(--paper) 100%);
      font-family: var(--serif);
    }

    button, input, textarea, select { font: inherit; color: inherit; }

    .page {
      width: min(1480px, calc(100vw - 32px));
      margin: 0 auto;
      padding: 26px 0 30px;
    }

    .card {
      background: var(--card);
      border: 1px solid rgba(35, 40, 35, 0.10);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
    }

    /* ---------- masthead ---------- */
    .masthead {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 340px;
      gap: 14px;
      align-items: stretch;
      margin-bottom: 14px;
    }

    .hero {
      position: relative;
      overflow: hidden;
      padding: 26px 30px 24px;
    }

    .hero::before {
      content: "";
      position: absolute;
      inset: 0 0 auto 0;
      height: 4px;
      background: linear-gradient(90deg, var(--green) 0 30%, var(--amber) 0 55%, var(--red) 0 78%, var(--plum) 0 100%);
    }

    .eyebrow {
      margin: 0 0 10px;
      color: var(--green);
      font: 700 11.5px/1.2 var(--sans);
      letter-spacing: 0.16em;
      text-transform: uppercase;
    }

    h1 {
      margin: 0;
      font-size: clamp(30px, 3.6vw, 46px);
      line-height: 1.04;
      font-weight: 600;
      letter-spacing: -0.01em;
    }

    .subtitle {
      margin: 12px 0 0;
      max-width: 74ch;
      color: var(--muted);
      font: 15px/1.55 var(--sans);
    }

    .meta-line {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 16px;
    }

    .chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 11px;
      border: 1px solid var(--line);
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.6);
      color: var(--muted);
      font: 600 12px/1.4 var(--sans);
    }

    .summary {
      background: var(--deep);
      color: #f6f2e6;
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      padding: 22px 24px;
      display: grid;
      align-content: center;
      gap: 4px;
    }

    .summary small {
      color: #9db5ab;
      font: 700 11px/1.3 var(--sans);
      letter-spacing: 0.14em;
      text-transform: uppercase;
    }

    .summary strong {
      font: 650 52px/1 var(--sans);
      letter-spacing: -0.02em;
    }

    .summary p {
      margin: 8px 0 0;
      color: #cfdad2;
      font: 13.5px/1.5 var(--sans);
    }

    /* ---------- metrics ---------- */
    .metrics {
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 12px;
      margin-bottom: 14px;
    }

    .metric { padding: 14px 16px 13px; }

    .metric span {
      display: block;
      color: var(--muted);
      font: 700 10.5px/1.3 var(--sans);
      letter-spacing: 0.11em;
      text-transform: uppercase;
    }

    .metric strong {
      display: block;
      margin-top: 6px;
      font: 700 27px/1.1 var(--sans);
      letter-spacing: -0.01em;
    }

    .metric em {
      display: block;
      margin: 3px 0 9px;
      color: var(--muted);
      font: 600 11.5px/1.3 var(--sans);
      font-style: normal;
    }

    .bar {
      height: 4px;
      border-radius: 2px;
      background: rgba(35, 40, 35, 0.08);
      overflow: hidden;
    }

    .bar i {
      display: block;
      height: 100%;
      border-radius: 2px;
      width: 0%;
      transition: width 300ms ease;
    }

    /* ---------- rules ---------- */
    .rules {
      padding: 16px 18px 18px;
      margin-bottom: 14px;
    }

    .rules-head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
      margin-bottom: 12px;
    }

    h2 {
      margin: 0;
      font-size: 19px;
      line-height: 1.2;
      font-weight: 600;
    }

    .hint {
      margin: 3px 0 0;
      color: var(--muted);
      font: 13px/1.45 var(--sans);
    }

    .reset-btn {
      border: 1px solid var(--line);
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.65);
      color: var(--muted);
      padding: 6px 14px;
      cursor: pointer;
      font: 600 12.5px/1.2 var(--sans);
      transition: border-color 150ms ease, color 150ms ease;
    }

    .reset-btn:hover { border-color: var(--green); color: var(--green); }

    .rules-grid {
      display: grid;
      grid-template-columns: 215px minmax(0, 1fr) minmax(0, 1.35fr) 255px;
      gap: 12px;
      align-items: stretch;
    }

    .panel {
      border: 1px solid rgba(35, 40, 35, 0.10);
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.5);
      padding: 12px 13px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-width: 0;
    }

    .panel-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }

    .panel-head h3 {
      margin: 0;
      color: var(--ink);
      font: 700 11px/1.3 var(--sans);
      letter-spacing: 0.10em;
      text-transform: uppercase;
    }

    .badge {
      display: inline-flex;
      align-items: center;
      padding: 2px 8px;
      border: 1px solid var(--line);
      border-radius: 999px;
      color: var(--muted);
      background: rgba(255, 255, 255, 0.6);
      white-space: nowrap;
      font: 700 11px/1.5 var(--sans);
    }

    .panel-hint {
      margin: 0;
      color: var(--muted);
      font: 12px/1.45 var(--sans);
    }

    .panel label.field {
      display: grid;
      gap: 5px;
      color: var(--muted);
      font: 700 10.5px/1.3 var(--sans);
      letter-spacing: 0.09em;
      text-transform: uppercase;
    }

    .panel input[type="number"],
    .panel select,
    .panel-tools input {
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 7px;
      background: rgba(255, 255, 255, 0.85);
      color: var(--ink);
      padding: 8px 10px;
      outline: none;
      font: 13.5px/1.35 var(--sans);
    }

    .panel input:focus,
    .panel select:focus {
      border-color: var(--green);
      box-shadow: 0 0 0 3px rgba(14, 138, 108, 0.13);
    }

    .panel-tools {
      display: flex;
      gap: 6px;
    }

    .panel-tools button {
      border: 1px solid var(--line);
      border-radius: 7px;
      background: rgba(255, 255, 255, 0.85);
      color: var(--green);
      padding: 0 12px;
      cursor: pointer;
      font: 700 12.5px/1 var(--sans);
      white-space: nowrap;
    }

    .panel-tools button:hover { border-color: var(--green); }

    .checkgrid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(138px, 1fr));
      gap: 1px 8px;
      max-height: 158px;
      overflow: auto;
      padding-right: 2px;
      scrollbar-width: thin;
    }

    .checkgrid.single { grid-template-columns: 1fr; max-height: 212px; }

    .check {
      display: flex;
      align-items: center;
      gap: 7px;
      padding: 3px 5px;
      border-radius: 5px;
      cursor: pointer;
      color: var(--ink);
      font: 500 12.5px/1.4 var(--sans);
      min-width: 0;
    }

    .check:hover { background: rgba(14, 138, 108, 0.07); }

    .check input {
      width: 14px;
      height: 14px;
      margin: 0;
      flex: none;
      accent-color: var(--green);
      cursor: pointer;
    }

    .check.exclude input { accent-color: var(--red); }

    .check .check-label {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .check .cnt {
      margin-left: auto;
      color: var(--muted);
      font: 600 11px/1.4 var(--sans);
    }

    .checkgrid-empty {
      margin: 4px 0;
      color: var(--muted);
      font: 12.5px/1.4 var(--sans);
    }

    .panel-actions {
      margin-top: auto;
      display: flex;
      gap: 4px;
      align-items: center;
      color: var(--line);
      font: 600 12px/1.4 var(--sans);
    }

    .panel-actions button {
      border: 0;
      background: none;
      padding: 2px 4px;
      color: var(--muted);
      cursor: pointer;
      font: 700 12px/1.4 var(--sans);
    }

    .panel-actions button:hover { color: var(--green); text-decoration: underline; }

    /* ---------- workspace ---------- */
    .workspace {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 430px;
      gap: 14px;
      align-items: start;
    }

    .stage { padding: 18px 18px 16px; }

    .stage-head {
      display: flex;
      justify-content: space-between;
      gap: 14px;
      align-items: flex-start;
      flex-wrap: wrap;
      margin-bottom: 10px;
    }

    .legend {
      display: flex;
      flex-wrap: wrap;
      gap: 5px 14px;
      align-items: center;
      padding-top: 4px;
    }

    .key {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: var(--muted);
      font: 600 12px/1.4 var(--sans);
      white-space: nowrap;
    }

    .key i {
      width: 10px;
      height: 10px;
      border-radius: 3px;
      flex: none;
    }

    .sankey-wrap {
      position: relative;
      border: 1px solid rgba(35, 40, 35, 0.08);
      border-radius: 8px;
      background: var(--chart);
      overflow-x: auto;
      overflow-y: hidden;
    }

    svg#sankey {
      display: block;
      width: 100%;
      min-width: 960px;
      height: auto;
    }

    .colhead {
      fill: var(--muted);
      font: 700 10.5px var(--sans);
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }

    .colguide { stroke: rgba(35, 40, 35, 0.06); stroke-width: 1; }

    .link {
      fill: none;
      opacity: 0.30;
      mix-blend-mode: multiply;
      cursor: pointer;
      transition: opacity 150ms ease;
    }

    .link-hit {
      fill: none;
      stroke: transparent;
      cursor: pointer;
    }

    .link.active, .link.hl { opacity: 0.58; }

    svg.hovering .link:not(.hl):not(.active) { opacity: 0.10; }

    .node rect {
      cursor: pointer;
      stroke: rgba(20, 26, 20, 0.28);
      stroke-width: 0.5;
      transition: stroke-width 150ms ease;
    }

    .node.active rect, .node:hover rect {
      stroke: var(--ink);
      stroke-width: 1.5;
    }

    .node text {
      pointer-events: none;
      paint-order: stroke;
      stroke: rgba(251, 248, 240, 0.92);
      stroke-width: 3px;
      stroke-linejoin: round;
    }

    .node .nlabel { fill: var(--ink); font: 700 12px var(--sans); }
    .node .ncount { fill: var(--muted); font: 600 10.5px var(--sans); }

    .tooltip {
      position: absolute;
      z-index: 5;
      pointer-events: none;
      background: #16211c;
      color: #f6f2e6;
      border-radius: 7px;
      padding: 8px 11px;
      max-width: 270px;
      box-shadow: 0 8px 22px rgba(18, 39, 33, 0.35);
      font: 12.5px/1.45 var(--sans);
      opacity: 0;
      transition: opacity 120ms ease;
    }

    .tooltip.show { opacity: 1; }
    .tooltip strong { display: block; font-size: 13px; }
    .tooltip span { display: block; color: #aebfb6; margin-top: 2px; }

    .reading-note {
      margin: 10px 2px 0;
      color: var(--muted);
      font: 12.5px/1.5 var(--sans);
    }

    /* ---------- drawer ---------- */
    .drawer {
      padding: 16px;
      position: sticky;
      top: 14px;
    }

    .drawer-head {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: flex-start;
      margin-bottom: 10px;
    }

    .drawer-tools {
      display: flex;
      gap: 8px;
      margin-bottom: 10px;
    }

    .drawer-tools input {
      flex: 1;
      min-width: 0;
      border: 1px solid var(--line);
      border-radius: 7px;
      background: rgba(255, 255, 255, 0.85);
      padding: 8px 11px;
      outline: none;
      font: 13.5px/1.35 var(--sans);
    }

    .drawer-tools input:focus {
      border-color: var(--green);
      box-shadow: 0 0 0 3px rgba(14, 138, 108, 0.13);
    }

    .drawer-tools button {
      border: 1px solid var(--line);
      border-radius: 7px;
      background: rgba(255, 255, 255, 0.85);
      color: var(--green);
      padding: 0 13px;
      cursor: pointer;
      white-space: nowrap;
      font: 700 12.5px/1 var(--sans);
    }

    .drawer-tools button:hover { border-color: var(--green); }

    .table-wrap {
      max-height: 560px;
      overflow: auto;
      border: 1px solid rgba(35, 40, 35, 0.10);
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.45);
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font: 13px/1.4 var(--sans);
    }

    th, td {
      padding: 9px 10px;
      border-bottom: 1px solid rgba(35, 40, 35, 0.07);
      text-align: left;
      vertical-align: top;
    }

    th {
      position: sticky;
      top: 0;
      z-index: 1;
      background: #f7f2e4;
      color: var(--muted);
      font-size: 10.5px;
      letter-spacing: 0.09em;
      text-transform: uppercase;
    }

    td:first-child { font-weight: 700; }

    .company-cell span, .detail-line { overflow-wrap: anywhere; }

    .company-sub {
      display: block;
      color: var(--muted);
      font-weight: 500;
      font-size: 12px;
      margin-top: 1px;
    }

    .reason {
      display: inline-flex;
      padding: 2px 8px;
      border-radius: 999px;
      font-size: 11.5px;
      font-weight: 700;
      white-space: nowrap;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .reason.pass { background: rgba(14, 138, 108, 0.13); color: #0b6e56; }
    .reason.warn { background: rgba(169, 116, 26, 0.15); color: #8a5e13; }
    .reason.stop { background: rgba(179, 74, 58, 0.13); color: #97382a; }
    .reason.partner { background: rgba(124, 82, 150, 0.14); color: #664379; }

    .detail-line {
      display: block;
      margin-top: 5px;
      color: var(--muted);
      font-size: 11.5px;
      font-weight: 600;
    }

    .empty {
      padding: 24px;
      color: var(--muted);
      font: 14px/1.5 var(--sans);
    }

    .trunc-note {
      margin: 8px 2px 0;
      color: var(--muted);
      font: 600 12px/1.4 var(--sans);
    }

    footer {
      margin-top: 18px;
      text-align: center;
      color: var(--muted);
      font: 12.5px/1.5 var(--sans);
    }

    @media (max-width: 1280px) {
      .masthead, .workspace { grid-template-columns: minmax(0, 1fr); }
      .rules-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .drawer { position: static; }
    }

    @media (max-width: 900px) {
      .metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }

    @media (max-width: 760px) {
      .page { width: calc(100vw - 20px); padding-top: 12px; }
      .rules-grid { grid-template-columns: minmax(0, 1fr); }
      .hero { padding: 18px; }
      .metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
  </style>
</head>
<body>
  <div class="page">
    <header class="masthead">
      <section class="hero card">
        <p class="eyebrow">Help4Access · Snitcher routing audit</p>
        <h1>Filter flow visualizer</h1>
        <p class="subtitle">Every company from the Snitcher export travels left to right through the routing pipeline. At each stage it either advances, stops for missing data, gets dropped by a filter, or is rerouted to the partner stream. Adjust the rules below — the flow rebuilds instantly.</p>
        <div class="meta-line">
          <span class="chip" id="chipExport">Export · —</span>
          <span class="chip" id="chipTotal">— companies</span>
          <span class="chip">Rules from Make.com blueprint</span>
        </div>
      </section>
      <aside class="summary">
        <small>Reach the customer stream</small>
        <strong id="customerCount">0</strong>
        <p id="summaryText">Adjust filters to rebuild the flow automatically.</p>
      </aside>
    </header>

    <section class="metrics">
      <div class="metric card"><span>Total companies</span><strong id="totalCompanies">0</strong><em>full CSV export</em><div class="bar"><i id="totalBar" style="background: var(--blue); width: 100%"></i></div></div>
      <div class="metric card"><span>Time qualified</span><strong id="timeQualified">0</strong><em id="timeQualifiedPct">0%</em><div class="bar"><i id="timeBar" style="background: var(--green)"></i></div></div>
      <div class="metric card"><span>High-intent URL</span><strong id="intentQualified">0</strong><em id="intentQualifiedPct">0%</em><div class="bar"><i id="intentBar" style="background: var(--green)"></i></div></div>
      <div class="metric card"><span>Customer stream</span><strong id="customerMetric">0</strong><em id="customerPct">0%</em><div class="bar"><i id="customerBar" style="background: var(--green)"></i></div></div>
      <div class="metric card"><span>Partner stream</span><strong id="partnerMetric">0</strong><em id="partnerPct">0%</em><div class="bar"><i id="partnerBar" style="background: var(--plum)"></i></div></div>
    </section>

    <section class="rules card">
      <div class="rules-head">
        <div>
          <h2>Routing rules</h2>
          <p class="hint">Check or uncheck values to change how companies are routed. Everything below matches the Make.com scenario logic.</p>
        </div>
        <button class="reset-btn" id="resetBtn" type="button">Reset to blueprint defaults</button>
      </div>
      <div class="rules-grid">
        <div class="panel">
          <div class="panel-head"><h3>Time on site</h3></div>
          <p class="panel-hint">Stage 1 — companies below the threshold drop out.</p>
          <label class="field">Threshold, seconds
            <input id="timeThreshold" type="number" min="0" step="1" value="30" />
          </label>
          <label class="field">Condition
            <select id="timeMode">
              <option value="gt">More than threshold</option>
              <option value="gte">At least threshold</option>
            </select>
          </label>
        </div>

        <div class="panel" data-group="url">
          <div class="panel-head"><h3>High-intent URL keywords</h3><span class="badge" data-role="badge"></span></div>
          <p class="panel-hint">Stage 5 — visited pages must contain at least one checked keyword.</p>
          <div class="panel-tools">
            <input data-role="filter" type="search" placeholder="Filter or type a new keyword…" />
            <button data-role="add" type="button">Add</button>
          </div>
          <div class="checkgrid" data-role="list"></div>
          <div class="panel-actions"><button data-role="all" type="button">Select all</button>·<button data-role="none" type="button">Clear</button></div>
        </div>

        <div class="panel" data-group="partner">
          <div class="panel-head"><h3>Partner industry keywords</h3><span class="badge" data-role="badge"></span></div>
          <p class="panel-hint">Stage 6 — a match reroutes the company to the partner stream.</p>
          <div class="panel-tools">
            <input data-role="filter" type="search" placeholder="Filter or type a new keyword…" />
            <button data-role="add" type="button">Add</button>
          </div>
          <div class="checkgrid" data-role="list"></div>
          <div class="panel-actions"><button data-role="all" type="button">Select all</button>·<button data-role="none" type="button">Clear</button></div>
        </div>

        <div class="panel" data-group="sizes">
          <div class="panel-head"><h3>Excluded company sizes</h3><span class="badge" data-role="badge"></span></div>
          <p class="panel-hint">Stage 4 — checked size ranges are dropped from the flow.</p>
          <div class="checkgrid single" data-role="list"></div>
          <div class="panel-actions"><button data-role="none" type="button">Clear all</button></div>
        </div>
      </div>
    </section>

    <main class="workspace">
      <section class="stage card">
        <div class="stage-head">
          <div>
            <h2>Routing Sankey</h2>
            <p class="hint">Flow width is proportional to the number of companies. Hover for details, click any node or flow to inspect it.</p>
          </div>
          <div class="legend">
            <span class="key"><i style="background: var(--green)"></i>Advances / customer</span>
            <span class="key"><i style="background: var(--amber)"></i>Stops — missing data</span>
            <span class="key"><i style="background: var(--red)"></i>Dropped by filter</span>
            <span class="key"><i style="background: var(--plum)"></i>Partner reroute</span>
          </div>
        </div>
        <div class="sankey-wrap">
          <svg id="sankey" viewBox="0 0 1240 640" role="img" aria-label="Routing Sankey diagram"></svg>
          <div class="tooltip" id="tooltip"></div>
        </div>
        <p class="reading-note">Selected: <strong id="selectedBadge" style="font: 700 12.5px var(--sans)">All companies</strong> — the table on the right lists the companies inside the current selection.</p>
      </section>

      <aside class="drawer card">
        <div class="drawer-head">
          <div>
            <h2 id="drawerTitle">All companies</h2>
            <p class="hint" id="drawerSubtitle">Showing all companies in the current export.</p>
          </div>
          <span class="badge" id="drawerCount">0</span>
        </div>
        <div class="drawer-tools">
          <input id="companySearch" type="search" placeholder="Search company, industry, domain…" />
          <button id="downloadCsv" type="button">Download CSV</button>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Company</th>
                <th>Route &amp; details</th>
              </tr>
            </thead>
            <tbody id="companyRows"></tbody>
          </table>
        </div>
        <p class="trunc-note" id="truncNote" hidden></p>
      </aside>
    </main>

    <footer id="pageFooter"></footer>
  </div>

  <script type="application/json" id="payload">${payloadJson}</script>
  <script>
    const payload = JSON.parse(document.getElementById("payload").textContent);
    const rows = payload.rows;
    const DEFAULTS = payload.defaults;

    const els = {};
    for (const id of ["timeThreshold", "timeMode", "sankey", "tooltip", "selectedBadge", "drawerTitle",
      "drawerSubtitle", "drawerCount", "companyRows", "companySearch", "downloadCsv", "truncNote",
      "totalCompanies", "timeQualified", "timeQualifiedPct", "intentQualified", "intentQualifiedPct",
      "customerMetric", "customerPct", "customerCount", "partnerMetric", "partnerPct", "summaryText",
      "timeBar", "intentBar", "customerBar", "partnerBar", "resetBtn", "chipExport", "chipTotal", "pageFooter"]) {
      els[id] = document.getElementById(id);
    }

    const fmt = new Intl.NumberFormat("en-US");
    const percent = (value, total) => total ? (value / total * 100).toFixed(1) + "%" : "0.0%";

    const colors = {
      all: "#2e6db4",
      pass: "#0e8a6c",
      warn: "#a9741a",
      stop: "#b34a3a",
      partner: "#7c5296",
    };

    const nodeMeta = {
      all: { label: "All companies", layer: 0, color: colors.all, kind: "all" },
      time_drop: { label: "Below time", layer: 1, color: colors.stop, kind: "stop" },
      time_pass: { label: "Time qualified", layer: 1, color: colors.pass, kind: "pass" },
      missing_domain: { label: "Missing domain", layer: 2, color: colors.warn, kind: "warn" },
      domain_known: { label: "Domain known", layer: 2, color: colors.pass, kind: "pass" },
      missing_industry: { label: "Missing industry", layer: 3, color: colors.warn, kind: "warn" },
      industry_known: { label: "Industry known", layer: 3, color: colors.pass, kind: "pass" },
      missing_employee: { label: "Missing size", layer: 4, color: colors.warn, kind: "warn" },
      employee_excluded: { label: "Size excluded", layer: 4, color: colors.stop, kind: "stop" },
      employee_accepted: { label: "Size accepted", layer: 4, color: colors.pass, kind: "pass" },
      no_url: { label: "No URL intent", layer: 5, color: colors.stop, kind: "stop" },
      high_url: { label: "URL intent", layer: 5, color: colors.pass, kind: "pass" },
      partner: { label: "Partner stream", layer: 6, color: colors.partner, kind: "partner" },
      customer: { label: "Customer stream", layer: 6, color: colors.pass, kind: "pass" },
    };

    const STAGE_HEADERS = ["Export", "Time on site", "Domain", "Industry", "Company size", "URL intent", "Outcome"];

    let current = null;
    let selected = { kind: "node", id: "all" };
    let drawerRecords = [];

    /* ---------------- checkbox groups ---------------- */
    const state = { url: new Map(), partner: new Map(), sizes: new Map() };
    const sizeCounts = new Map(payload.employeeRanges.map((item) => [item.label, item.count]));

    function resetState() {
      state.url = new Map(DEFAULTS.urlKeywords.map((k) => [k, true]));
      state.partner = new Map(DEFAULTS.partnerKeywords.map((k) => [k, true]));
      state.sizes = new Map(payload.employeeRanges.map((item) => [item.label, DEFAULTS.excludedRanges.includes(item.label)]));
      els.timeThreshold.value = DEFAULTS.timeThreshold;
      els.timeMode.value = DEFAULTS.timeMode;
    }

    function checkedKeys(map) {
      return Array.from(map.entries()).filter(([, on]) => on).map(([key]) => key);
    }

    const groups = [];

    function setupGroup(key, opts) {
      const rootEl = document.querySelector('[data-group="' + key + '"]');
      const list = rootEl.querySelector('[data-role="list"]');
      const badge = rootEl.querySelector('[data-role="badge"]');
      const filter = rootEl.querySelector('[data-role="filter"]');
      const addBtn = rootEl.querySelector('[data-role="add"]');
      const allBtn = rootEl.querySelector('[data-role="all"]');
      const noneBtn = rootEl.querySelector('[data-role="none"]');

      function updateBadge() {
        badge.textContent = checkedKeys(state[key]).length + " of " + state[key].size;
      }

      function renderList() {
        const query = filter ? filter.value.trim().toLowerCase() : "";
        const entries = Array.from(state[key].entries())
          .filter(([k]) => !query || k.toLowerCase().includes(query));
        if (!entries.length) {
          list.innerHTML = '<p class="checkgrid-empty">No matches' + (addBtn ? " — press Add to create this keyword." : ".") + "</p>";
        } else {
          list.innerHTML = entries.map(([k, on]) => {
            const cnt = opts.showCounts && sizeCounts.has(k)
              ? '<span class="cnt">' + fmt.format(sizeCounts.get(k)) + "</span>"
              : "";
            return '<label class="check' + (opts.exclude ? " exclude" : "") + '">' +
              '<input type="checkbox" data-key="' + escapeHtml(k) + '"' + (on ? " checked" : "") + " />" +
              '<span class="check-label" title="' + escapeHtml(k) + '">' + escapeHtml(k) + "</span>" + cnt +
              "</label>";
          }).join("");
        }
        updateBadge();
      }

      list.addEventListener("change", (event) => {
        const k = event.target.getAttribute("data-key");
        if (k === null) return;
        state[key].set(k, event.target.checked);
        updateBadge();
        onRulesChange();
      });

      if (filter) {
        filter.addEventListener("input", renderList);
      }
      if (addBtn) {
        const addKeyword = () => {
          const value = filter.value.trim().toLowerCase();
          if (!value) return;
          state[key].set(value, true);
          filter.value = "";
          renderList();
          onRulesChange();
        };
        addBtn.addEventListener("click", addKeyword);
        filter.addEventListener("keydown", (event) => {
          if (event.key === "Enter") { event.preventDefault(); addKeyword(); }
        });
      }
      if (allBtn) {
        allBtn.addEventListener("click", () => {
          for (const k of state[key].keys()) state[key].set(k, true);
          renderList();
          onRulesChange();
        });
      }
      if (noneBtn) {
        noneBtn.addEventListener("click", () => {
          for (const k of state[key].keys()) state[key].set(k, false);
          renderList();
          onRulesChange();
        });
      }

      groups.push({ renderList });
      renderList();
    }

    function renderAllGroups() {
      for (const group of groups) group.renderList();
    }

    /* ---------------- routing logic (mirrors the Make.com scenario) ---------------- */
    function matches(text, keywords) {
      const lower = String(text || "").toLowerCase();
      return keywords.filter((keyword) => lower.includes(keyword.toLowerCase()));
    }

    function routeRow(row, settings) {
      const route = ["all"];
      const timePass = settings.timeMode === "gte"
        ? row.timeSeconds >= settings.timeThreshold
        : row.timeSeconds > settings.timeThreshold;

      if (!timePass) {
        route.push("time_drop");
        return { route, terminal: "time_drop", urlMatches: [], partnerMatches: [] };
      }
      route.push("time_pass");

      if (!row.domain) {
        route.push("missing_domain");
        return { route, terminal: "missing_domain", urlMatches: [], partnerMatches: [] };
      }
      route.push("domain_known");

      if (!row.industry) {
        route.push("missing_industry");
        return { route, terminal: "missing_industry", urlMatches: [], partnerMatches: [] };
      }
      route.push("industry_known");

      if (!row.employeeRange) {
        route.push("missing_employee");
        return { route, terminal: "missing_employee", urlMatches: [], partnerMatches: [] };
      }

      if (settings.excludedRanges.includes(row.employeeRange)) {
        route.push("employee_excluded");
        return { route, terminal: "employee_excluded", urlMatches: [], partnerMatches: [] };
      }
      route.push("employee_accepted");

      const urlMatches = matches(row.pagePaths, settings.urlKeywords);
      if (!urlMatches.length) {
        route.push("no_url");
        return { route, terminal: "no_url", urlMatches, partnerMatches: [] };
      }
      route.push("high_url");

      const partnerMatches = matches(row.industry, settings.partnerKeywords);
      route.push(partnerMatches.length ? "partner" : "customer");
      return {
        route,
        terminal: partnerMatches.length ? "partner" : "customer",
        urlMatches,
        partnerMatches,
      };
    }

    function buildFlow() {
      const settings = {
        timeThreshold: Number(els.timeThreshold.value || 0),
        timeMode: els.timeMode.value,
        urlKeywords: checkedKeys(state.url),
        partnerKeywords: checkedKeys(state.partner),
        excludedRanges: checkedKeys(state.sizes),
      };

      const nodeRecords = new Map(Object.keys(nodeMeta).map((id) => [id, []]));
      const linkMap = new Map();
      const routed = rows.map((row, index) => {
        const result = routeRow(row, settings);
        const enriched = { ...row, index, route: result.route, terminal: result.terminal, urlMatches: result.urlMatches, partnerMatches: result.partnerMatches };
        for (const nodeId of result.route) {
          nodeRecords.get(nodeId).push(enriched);
        }
        for (let i = 0; i < result.route.length - 1; i += 1) {
          const source = result.route[i];
          const target = result.route[i + 1];
          const key = source + "=>" + target;
          if (!linkMap.has(key)) {
            linkMap.set(key, { id: key, source, target, records: [] });
          }
          linkMap.get(key).records.push(enriched);
        }
        return enriched;
      });

      const nodes = Object.entries(nodeMeta)
        .map(([id, meta]) => ({ id, ...meta, records: nodeRecords.get(id), value: nodeRecords.get(id).length }))
        .filter((node) => node.value > 0 || node.id === "all");
      const links = Array.from(linkMap.values()).map((link) => ({ ...link, value: link.records.length }));
      current = { settings, routed, nodes, links };
      return current;
    }

    /* ---------------- sankey layout (proportional) ---------------- */
    const GEO = { W: 1240, H: 640, top: 48, right: 190, bottom: 16, left: 14, nodeW: 14, nodeGap: 22, minH: 8, maxLayer: 6 };

    function layout(nodes, links) {
      const colSpan = (GEO.W - GEO.left - GEO.right - GEO.nodeW) / GEO.maxLayer;
      const avail = GEO.H - GEO.top - GEO.bottom;
      const byLayer = new Map();
      for (const node of nodes) {
        if (!byLayer.has(node.layer)) byLayer.set(node.layer, []);
        byLayer.get(node.layer).push(node);
      }

      let scale = Infinity;
      for (const [, list] of byLayer) {
        const total = list.reduce((sum, node) => sum + node.value, 0);
        if (total > 0) {
          scale = Math.min(scale, (avail - GEO.nodeGap * (list.length - 1)) / total);
        }
      }
      if (!Number.isFinite(scale)) scale = 1;

      for (const [layer, list] of byLayer) {
        const heights = list.map((node) => Math.max(GEO.minH, node.value * scale));
        const columnH = heights.reduce((a, b) => a + b, 0) + GEO.nodeGap * (list.length - 1);
        let y = GEO.top + Math.max(0, (avail - columnH) / 2);
        list.forEach((node, i) => {
          node.x = GEO.left + layer * colSpan;
          node.w = GEO.nodeW;
          node.h = heights[i];
          node.y = y;
          y += heights[i] + GEO.nodeGap;
        });
      }

      const nodeById = new Map(nodes.map((node) => [node.id, node]));
      for (const link of links) {
        link.s = nodeById.get(link.source);
        link.t = nodeById.get(link.target);
        link.w = Math.max(1.4, link.value * scale);
      }

      const stack = (node, list, prop) => {
        const total = list.reduce((sum, l) => sum + l.w, 0);
        const gap = list.length > 1 ? Math.max(0, Math.min(2, (node.h - total) / (list.length - 1))) : 0;
        let cursor = node.y + Math.max(0, (node.h - total - gap * (list.length - 1)) / 2);
        for (const l of list) {
          l[prop] = cursor + l.w / 2;
          cursor += l.w + gap;
        }
      };
      for (const node of nodes) {
        stack(node, links.filter((l) => l.s === node).sort((a, b) => a.t.y - b.t.y), "sy");
        stack(node, links.filter((l) => l.t === node).sort((a, b) => a.s.y - b.s.y), "ty");
      }
      return { nodes, links, colSpan };
    }

    function pathD(link) {
      const x0 = link.s.x + link.s.w;
      const x1 = link.t.x;
      const mid = (x0 + x1) / 2;
      return "M" + x0 + "," + link.sy + " C" + mid + "," + link.sy + " " + mid + "," + link.ty + " " + x1 + "," + link.ty;
    }

    /* ---------------- tooltip ---------------- */
    const wrap = els.tooltip.parentElement;
    function showTip(html, event) {
      els.tooltip.innerHTML = html;
      els.tooltip.classList.add("show");
      moveTip(event);
    }
    function moveTip(event) {
      const rect = wrap.getBoundingClientRect();
      const x = event.clientX - rect.left + wrap.scrollLeft;
      const y = event.clientY - rect.top;
      const flip = event.clientX - rect.left > rect.width * 0.58;
      els.tooltip.style.left = (flip ? x - 14 : x + 14) + "px";
      els.tooltip.style.top = Math.max(6, y - 14) + "px";
      els.tooltip.style.transform = flip ? "translateX(-100%)" : "none";
    }
    function hideTip() {
      els.tooltip.classList.remove("show");
    }

    /* ---------------- render ---------------- */
    const svgNS = "http://www.w3.org/2000/svg";
    function svgEl(tag, attrs) {
      const el = document.createElementNS(svgNS, tag);
      for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v);
      return el;
    }

    function renderSankey(flow) {
      const { nodes, links, colSpan } = layout(flow.nodes, flow.links);
      const svg = els.sankey;
      svg.innerHTML = "";
      const guideGroup = svgEl("g");
      const linkGroup = svgEl("g");
      const nodeGroup = svgEl("g");
      const headGroup = svgEl("g");
      svg.append(guideGroup, linkGroup, nodeGroup, headGroup);

      for (let layer = 0; layer <= GEO.maxLayer; layer += 1) {
        const cx = GEO.left + layer * colSpan + GEO.nodeW / 2;
        guideGroup.append(svgEl("line", { class: "colguide", x1: cx, x2: cx, y1: 34, y2: GEO.H - 10 }));
        const text = svgEl("text", {
          class: "colhead",
          x: layer === 0 ? GEO.left : cx,
          y: 20,
          "text-anchor": layer === 0 ? "start" : "middle",
        });
        text.textContent = STAGE_HEADERS[layer];
        headGroup.append(text);
      }

      const linkEls = [];
      for (const link of links) {
        const isActive = selected.kind === "link" && selected.id === link.id;
        const path = svgEl("path", {
          class: "link" + (isActive ? " active" : ""),
          d: pathD(link),
          stroke: link.t.color,
          "stroke-width": link.w,
        });
        const tipHtml = "<strong>" + escapeHtml(nodeMeta[link.source]?.label || link.source) + " → " + escapeHtml(nodeMeta[link.target]?.label || link.target) + "</strong>" +
          "<span>" + fmt.format(link.value) + " companies · " + percent(link.value, rows.length) + " of export</span>" +
          "<span>Click to inspect the list</span>";
        const bind = (el) => {
          el.addEventListener("click", () => { selected = { kind: "link", id: link.id }; render(); });
          el.addEventListener("mouseenter", (event) => {
            svg.classList.add("hovering");
            path.classList.add("hl");
            showTip(tipHtml, event);
          });
          el.addEventListener("mousemove", moveTip);
          el.addEventListener("mouseleave", () => {
            svg.classList.remove("hovering");
            path.classList.remove("hl");
            hideTip();
          });
        };
        bind(path);
        linkGroup.append(path);
        if (link.w < 14) {
          const hit = svgEl("path", { class: "link-hit", d: pathD(link), "stroke-width": 14 });
          bind(hit);
          linkGroup.append(hit);
        }
        linkEls.push({ link, path });
      }

      for (const node of nodes) {
        const g = svgEl("g", {
          class: "node" + (selected.kind === "node" && selected.id === node.id ? " active" : ""),
          transform: "translate(" + node.x + "," + node.y + ")",
        });

        const rect = svgEl("rect", { width: node.w, height: node.h, rx: 3, fill: node.color });
        const cy = node.h / 2;
        const label = svgEl("text", { class: "nlabel", x: node.w + 9, y: cy - 2.5 });
        label.textContent = node.label;
        const count = svgEl("text", { class: "ncount", x: node.w + 9, y: cy + 11.5 });
        count.textContent = fmt.format(node.value) + " · " + percent(node.value, rows.length);
        g.append(rect, label, count);

        const tipHtml = "<strong>" + escapeHtml(node.label) + "</strong>" +
          "<span>" + fmt.format(node.value) + " companies · " + percent(node.value, rows.length) + " of export</span>" +
          "<span>Click to inspect the list</span>";
        g.addEventListener("click", () => { selected = { kind: "node", id: node.id }; render(); });
        g.addEventListener("mouseenter", (event) => {
          svg.classList.add("hovering");
          for (const { link, path } of linkEls) {
            if (link.source === node.id || link.target === node.id) path.classList.add("hl");
          }
          showTip(tipHtml, event);
        });
        g.addEventListener("mousemove", moveTip);
        g.addEventListener("mouseleave", () => {
          svg.classList.remove("hovering");
          for (const { path } of linkEls) path.classList.remove("hl");
          hideTip();
        });
        nodeGroup.append(g);
      }
    }

    function updateMetrics(flow) {
      const total = rows.length;
      const value = (id) => flow.nodes.find((node) => node.id === id)?.value || 0;
      const timeQualified = value("time_pass");
      const intentQualified = value("high_url");
      const customer = value("customer");
      const partner = value("partner");

      els.totalCompanies.textContent = fmt.format(total);
      els.timeQualified.textContent = fmt.format(timeQualified);
      els.timeQualifiedPct.textContent = percent(timeQualified, total) + " of total";
      els.intentQualified.textContent = fmt.format(intentQualified);
      els.intentQualifiedPct.textContent = percent(intentQualified, total) + " of total";
      els.customerMetric.textContent = fmt.format(customer);
      els.customerPct.textContent = percent(customer, total) + " of total";
      els.customerCount.textContent = fmt.format(customer);
      els.partnerMetric.textContent = fmt.format(partner);
      els.partnerPct.textContent = percent(partner, total) + " of total";

      els.timeBar.style.width = percent(timeQualified, total);
      els.intentBar.style.width = percent(intentQualified, total);
      els.customerBar.style.width = percent(customer, total);
      els.partnerBar.style.width = percent(partner, total);

      els.summaryText.textContent = fmt.format(customer) + " of " + fmt.format(total) +
        " companies reach the customer stream under the current rules; " + fmt.format(partner) +
        " more are rerouted to partners instead of being dropped.";
    }

    function selectedRecords() {
      if (!current) {
        return rows;
      }
      if (selected.kind === "link") {
        const link = current.links.find((item) => item.id === selected.id);
        return link ? link.records : current.routed;
      }
      const node = current.nodes.find((item) => item.id === selected.id);
      return node ? node.records : current.routed;
    }

    function routeLabel(row) {
      const terminal = nodeMeta[row.terminal]?.label || "Unknown";
      if (row.terminal === "partner" && row.partnerMatches.length) {
        return terminal + ": " + row.partnerMatches.slice(0, 3).join(", ");
      }
      if (row.terminal === "customer" && row.urlMatches.length) {
        return terminal + ": " + row.urlMatches.slice(0, 3).join(", ");
      }
      return terminal;
    }

    function renderDrawer() {
      let records = selectedRecords();
      const query = els.companySearch.value.trim().toLowerCase();
      if (query) {
        records = records.filter((row) =>
          [row.name, row.domain, row.industry, row.employeeRange, row.country, row.city]
            .some((value) => String(value || "").toLowerCase().includes(query)),
        );
      }
      drawerRecords = records;

      const selectedLabel = selected.kind === "link"
        ? selected.id.split("=>").map((id) => nodeMeta[id]?.label || id).join(" → ")
        : nodeMeta[selected.id]?.label || "All companies";
      els.selectedBadge.textContent = selectedLabel;
      els.drawerTitle.textContent = selectedLabel;
      els.drawerSubtitle.textContent = selected.kind === "link" ? "Companies moving through this flow." : "Companies currently inside this node.";
      els.drawerCount.textContent = fmt.format(records.length);

      const cap = 500;
      els.truncNote.hidden = records.length <= cap;
      if (records.length > cap) {
        els.truncNote.textContent = "Showing the first " + fmt.format(cap) + " of " + fmt.format(records.length) + " companies — use search to narrow down, or download the full CSV.";
      }

      if (!records.length) {
        els.companyRows.innerHTML = '<tr><td colspan="2"><div class="empty">No companies match the current selection.</div></td></tr>';
        return;
      }

      els.companyRows.innerHTML = records.slice(0, cap).map((row) => {
        const location = [row.city, row.state, row.country].filter(Boolean).join(", ");
        const company = row.name || "(unknown company)";
        const domain = row.domain ? '<span class="company-sub">' + escapeHtml(row.domain) + "</span>" : "";
        const place = location ? '<span class="company-sub">' + escapeHtml(location) + "</span>" : "";
        const kind = nodeMeta[row.terminal]?.kind || "pass";
        const details = [
          "Time " + (row.timeText || "00:00:00"),
          row.industry || "missing industry",
          row.employeeRange || "missing size",
        ].join(" · ");
        return "<tr>" +
          '<td class="company-cell">' + escapeHtml(company) + domain + place + "</td>" +
          '<td><span class="reason ' + kind + '">' + escapeHtml(routeLabel(row)) + '</span><span class="detail-line">' + escapeHtml(details) + "</span></td>" +
        "</tr>";
      }).join("");
    }

    function downloadCsv() {
      const q = (value) => '"' + String(value ?? "").replaceAll('"', '""') + '"';
      const header = ["Company", "Domain", "Industry", "Company size", "Country", "State", "City", "Time on site", "Total visits", "Outcome"];
      const lines = [header.map(q).join(",")];
      for (const row of drawerRecords) {
        lines.push([
          row.name, row.domain, row.industry, row.employeeRange, row.country, row.state, row.city,
          row.timeText, row.totalVisits, nodeMeta[row.terminal]?.label || row.terminal,
        ].map(q).join(","));
      }
      const slug = (selected.kind === "link" ? selected.id.replace("=>", "-to-") : selected.id).replaceAll("_", "-");
      const blob = new Blob([lines.join("\\n")], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "h4a-routing-" + slug + ".csv";
      a.click();
      URL.revokeObjectURL(a.href);
    }

    function escapeHtml(value) {
      return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
    }

    function render() {
      const flow = buildFlow();
      renderSankey(flow);
      updateMetrics(flow);
      renderDrawer();
    }

    function onRulesChange() {
      selected = { kind: "node", id: "all" };
      render();
    }

    /* ---------------- boot ---------------- */
    resetState();
    setupGroup("url", { addable: true });
    setupGroup("partner", { addable: true });
    setupGroup("sizes", { showCounts: true, exclude: true });

    for (const element of [els.timeThreshold, els.timeMode]) {
      element.addEventListener("input", onRulesChange);
    }
    els.companySearch.addEventListener("input", renderDrawer);
    els.downloadCsv.addEventListener("click", downloadCsv);
    els.resetBtn.addEventListener("click", () => {
      resetState();
      renderAllGroups();
      onRulesChange();
    });

    const generated = new Date(payload.generatedAt);
    const dateText = generated.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
    els.chipExport.textContent = "Export · " + dateText;
    els.chipTotal.textContent = fmt.format(rows.length) + " companies";
    els.pageFooter.textContent = "Generated " + dateText + " from " + payload.sourceFile + " · Routing rules mirror the Make.com \\u201cVisit-Parse Domain Info\\u201d scenario.";

    render();
  </script>
</body>
</html>`;
}

const csvText = await fs.readFile(path.join(root, sourceCsv), "utf8");
const blueprint = JSON.parse(await fs.readFile(path.join(root, blueprintJson), "utf8"));
const rules = loadRules(blueprint);
const rows = parseCsv(csvText).map((row, index) => ({
  id: clean(row.ID) || String(index + 1),
  name: clean(row.Name),
  country: clean(row.Country),
  state: clean(row.State),
  city: clean(row.City),
  industry: clean(row.Industry),
  employeeRange: clean(row["Company Size"]),
  website: clean(row.Website),
  domain: normalizeDomain(row.Website),
  timeText: clean(row["Total time on Site"]) || "00:00:00",
  timeSeconds: secondsFromTime(row["Total time on Site"]),
  totalVisits: clean(row["Total Visits"]),
  totalPageviews: clean(row["Total Pageviews"]),
  uniquePagesVisited: clean(row["Unique pages Visited"]),
  pagePaths: extractPagePaths(row["Unique pages Visited"]),
  linkedin: clean(row.linkedin_handle),
}));

const sizeCounts = new Map();
for (const row of rows) {
  if (row.employeeRange) {
    sizeCounts.set(row.employeeRange, (sizeCounts.get(row.employeeRange) || 0) + 1);
  }
}
const employeeRanges = Array.from(sizeCounts.entries())
  .map(([label, count]) => ({ label, count }))
  .sort((a, b) => {
    const num = (label) => Number((label.replaceAll(",", "").match(/^\d+/) || [Infinity])[0]);
    return num(a.label) - num(b.label);
  });

const html = buildHtml({
  generatedAt: new Date().toISOString(),
  sourceFile: sourceCsv,
  rows,
  rules,
  employeeRanges,
  defaults: {
    timeThreshold: 30,
    timeMode: "gt",
    urlKeywords: rules.urlKeywords,
    partnerKeywords: rules.partnerKeywords,
    excludedRanges: ["1-10 employees"],
  },
});

await fs.mkdir(outputDir, { recursive: true });
await fs.mkdir(docsDir, { recursive: true });
await fs.writeFile(outputPath, html, "utf8");
await fs.writeFile(docsPath, html, "utf8");
console.log(outputPath);
console.log(docsPath);
