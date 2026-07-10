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
  <title>H4A Routing Sankey Visualizer</title>
  <style>
    :root {
      --paper: #f3efe5;
      --ink: #18221e;
      --muted: #68736e;
      --line: #d6cdbd;
      --panel: rgba(255, 252, 244, 0.88);
      --deep: #10221e;
      --blue: #234967;
      --green: #147765;
      --gold: #c58c28;
      --red: #b34a3a;
      --clay: #b86542;
      --wash: rgba(255, 255, 255, 0.55);
      --shadow: 0 18px 50px rgba(36, 28, 15, 0.12);
      --radius: 8px;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      color: var(--ink);
      background:
        radial-gradient(circle at 18% -4%, rgba(20, 119, 101, 0.18), transparent 30rem),
        radial-gradient(circle at 92% 14%, rgba(197, 140, 40, 0.22), transparent 26rem),
        linear-gradient(180deg, #fbf8ef 0%, var(--paper) 100%);
      font-family: Georgia, "Times New Roman", serif;
    }

    button,
    input,
    textarea,
    select {
      font: inherit;
    }

    .page {
      width: min(1480px, calc(100vw - 32px));
      margin: 0 auto;
      padding: 28px 0 36px;
    }

    header {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 360px;
      gap: 16px;
      align-items: stretch;
      margin-bottom: 16px;
    }

    .hero,
    .controls,
    .stage,
    .drawer,
    .metric {
      background: var(--panel);
      border: 1px solid rgba(24, 34, 30, 0.11);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
    }

    .hero {
      padding: 28px;
      position: relative;
      overflow: hidden;
    }

    .hero::before {
      content: "";
      position: absolute;
      inset: 0 0 auto 0;
      height: 5px;
      background: linear-gradient(90deg, var(--green), var(--gold), var(--clay), var(--blue));
    }

    .eyebrow {
      margin: 0 0 12px;
      color: var(--green);
      font: 700 12px/1.2 "Avenir Next", "Helvetica Neue", sans-serif;
      letter-spacing: 0.14em;
      text-transform: uppercase;
    }

    h1 {
      margin: 0;
      max-width: 820px;
      font-size: clamp(38px, 5vw, 70px);
      line-height: 0.96;
      font-weight: 560;
    }

    .subtitle {
      margin: 18px 0 0;
      max-width: 800px;
      color: var(--muted);
      font: 16px/1.5 "Avenir Next", "Helvetica Neue", sans-serif;
    }

    .summary {
      background: var(--deep);
      color: #fffaf0;
      border-radius: var(--radius);
      padding: 20px;
      display: grid;
      align-content: space-between;
      min-height: 100%;
      box-shadow: var(--shadow);
    }

    .summary small {
      color: #b8c8c2;
      font: 700 12px/1.2 "Avenir Next", "Helvetica Neue", sans-serif;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }

    .summary strong {
      display: block;
      margin-top: 14px;
      font-size: 58px;
      line-height: 0.9;
      font-weight: 650;
    }

    .summary p {
      margin: 14px 0 0;
      color: #d8e0dc;
      font: 15px/1.45 "Avenir Next", "Helvetica Neue", sans-serif;
    }

    .toolbar {
      display: grid;
      grid-template-columns: 280px minmax(0, 1fr) minmax(0, 1fr) 260px;
      gap: 12px;
      margin-bottom: 16px;
    }

    .controls {
      padding: 14px;
      display: grid;
      gap: 10px;
      align-content: start;
    }

    .controls label {
      display: grid;
      gap: 7px;
      color: var(--muted);
      font: 700 11px/1.2 "Avenir Next", "Helvetica Neue", sans-serif;
      letter-spacing: 0.10em;
      text-transform: uppercase;
    }

    .controls input,
    .controls textarea,
    .controls select {
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 7px;
      background: rgba(255, 255, 255, 0.72);
      color: var(--ink);
      padding: 10px 11px;
      outline: none;
      font: 14px/1.35 "Avenir Next", "Helvetica Neue", sans-serif;
    }

    .controls textarea {
      min-height: 86px;
      resize: vertical;
    }

    .controls input:focus,
    .controls textarea:focus,
    .controls select:focus {
      border-color: var(--green);
      box-shadow: 0 0 0 3px rgba(20, 119, 101, 0.13);
    }

    .metrics {
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 12px;
      margin-bottom: 16px;
    }

    .metric {
      padding: 15px 16px;
    }

    .metric span {
      display: block;
      color: var(--muted);
      font: 700 11px/1.2 "Avenir Next", "Helvetica Neue", sans-serif;
      letter-spacing: 0.10em;
      text-transform: uppercase;
    }

    .metric strong {
      display: block;
      margin-top: 8px;
      color: var(--blue);
      font: 700 32px/1 "Avenir Next", "Helvetica Neue", sans-serif;
    }

    .metric em {
      display: block;
      margin-top: 6px;
      color: var(--muted);
      font: 700 12px/1 "Avenir Next", "Helvetica Neue", sans-serif;
      font-style: normal;
    }

    .workspace {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 420px;
      gap: 16px;
      align-items: start;
    }

    .stage {
      min-height: 650px;
      padding: 16px;
      overflow: hidden;
    }

    .stage-head,
    .drawer-head {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: flex-start;
      margin-bottom: 12px;
    }

    h2 {
      margin: 0;
      font-size: 20px;
      line-height: 1.15;
      font-weight: 560;
    }

    .hint {
      margin: 4px 0 0;
      color: var(--muted);
      font: 13px/1.4 "Avenir Next", "Helvetica Neue", sans-serif;
    }

    .badge {
      display: inline-flex;
      align-items: center;
      min-height: 28px;
      padding: 0 10px;
      border: 1px solid var(--line);
      border-radius: 999px;
      color: var(--muted);
      background: var(--wash);
      white-space: nowrap;
      font: 700 12px/1 "Avenir Next", "Helvetica Neue", sans-serif;
    }

    .sankey-wrap {
      width: 100%;
      height: 560px;
      border: 1px solid rgba(24, 34, 30, 0.08);
      border-radius: var(--radius);
      background:
        linear-gradient(90deg, rgba(16, 34, 30, 0.045) 1px, transparent 1px),
        linear-gradient(180deg, rgba(16, 34, 30, 0.035) 1px, transparent 1px),
        rgba(255, 255, 255, 0.32);
      background-size: 88px 88px;
      overflow: hidden;
    }

    svg {
      display: block;
      width: 100%;
      height: 100%;
    }

    .link {
      fill: none;
      stroke-linecap: round;
      opacity: 0.34;
      cursor: pointer;
      transition: opacity 160ms ease, stroke 160ms ease;
    }

    .link:hover,
    .link.active {
      opacity: 0.72;
    }

    .node rect {
      rx: 7px;
      stroke: rgba(24, 34, 30, 0.18);
      stroke-width: 1;
      cursor: pointer;
      transition: filter 160ms ease, stroke-width 160ms ease;
    }

    .node:hover rect,
    .node.active rect {
      filter: drop-shadow(0 10px 18px rgba(24, 34, 30, 0.18));
      stroke-width: 2;
    }

    .node text {
      pointer-events: none;
      fill: var(--ink);
      font-family: "Avenir Next", "Helvetica Neue", sans-serif;
    }

    .node .label {
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.02em;
    }

    .node .count {
      fill: var(--muted);
      font-size: 11px;
      font-weight: 700;
    }

    .drawer {
      padding: 16px;
      min-height: 650px;
    }

    .drawer input {
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 7px;
      background: rgba(255, 255, 255, 0.72);
      padding: 10px 11px;
      margin-bottom: 12px;
      outline: none;
      font: 14px/1.35 "Avenir Next", "Helvetica Neue", sans-serif;
    }

    .table-wrap {
      max-height: 530px;
      overflow: auto;
      border: 1px solid rgba(24, 34, 30, 0.10);
      border-radius: var(--radius);
      background: rgba(255, 255, 255, 0.42);
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font: 13px/1.35 "Avenir Next", "Helvetica Neue", sans-serif;
    }

    th,
    td {
      padding: 10px;
      border-bottom: 1px solid rgba(24, 34, 30, 0.08);
      text-align: left;
      vertical-align: top;
    }

    th {
      position: sticky;
      top: 0;
      z-index: 1;
      background: #f8f3e8;
      color: var(--muted);
      font-size: 11px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    td:first-child {
      font-weight: 800;
      color: var(--ink);
    }

    .company-cell span,
    .detail-line {
      overflow-wrap: anywhere;
    }

    .reason {
      display: inline-flex;
      padding: 3px 7px;
      border-radius: 999px;
      background: rgba(35, 73, 103, 0.10);
      color: var(--blue);
      font-size: 12px;
      font-weight: 800;
    }

    .detail-line {
      display: block;
      margin-top: 7px;
      color: var(--muted);
      font-size: 12px;
      font-weight: 700;
    }

    .empty {
      padding: 26px;
      color: var(--muted);
      font: 14px/1.45 "Avenir Next", "Helvetica Neue", sans-serif;
    }

    @media (max-width: 1180px) {
      header,
      .workspace,
      .toolbar {
        grid-template-columns: 1fr;
      }

      .metrics {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }

    @media (max-width: 640px) {
      .page {
        width: min(100vw - 20px, 1480px);
        padding-top: 10px;
      }

      .hero,
      .summary,
      .controls,
      .stage,
      .drawer {
        padding: 14px;
      }

      h1 {
        font-size: 38px;
      }

      .metrics {
        grid-template-columns: 1fr;
      }

      .sankey-wrap {
        height: 620px;
      }
    }
  </style>
</head>
<body>
  <div class="page">
    <header>
      <section class="hero">
        <p class="eyebrow">H4A routing lab</p>
        <h1>Filter flow visualizer</h1>
        <p class="subtitle">Interactive Sankey view for the full Snitcher export. Adjust the routing thresholds and keywords to see how companies move through time, data quality, URL intent, and partner/customer streams.</p>
      </section>
      <aside class="summary">
        <div>
          <small>Current customer stream</small>
          <strong id="customerCount">0</strong>
          <p id="summaryText">Adjust filters to rebuild the flow automatically.</p>
        </div>
      </aside>
    </header>

    <section class="toolbar">
      <div class="controls">
        <label>
          Minimum time to continue
          <input id="timeThreshold" type="number" min="0" step="1" value="30" />
        </label>
        <label>
          Time condition
          <select id="timeMode">
            <option value="gt">More than threshold</option>
            <option value="gte">At least threshold</option>
          </select>
        </label>
      </div>
      <div class="controls">
        <label>
          High-intent URL keywords
          <textarea id="urlKeywords"></textarea>
        </label>
      </div>
      <div class="controls">
        <label>
          Partner industry keywords
          <textarea id="partnerKeywords"></textarea>
        </label>
      </div>
      <div class="controls">
        <label>
          Excluded employee ranges
          <textarea id="excludedRanges">1-10 employees
Unknown</textarea>
        </label>
      </div>
    </section>

    <section class="metrics">
      <div class="metric"><span>Total companies</span><strong id="totalCompanies">0</strong><em>full CSV export</em></div>
      <div class="metric"><span>Time qualified</span><strong id="timeQualified">0</strong><em id="timeQualifiedPct">0%</em></div>
      <div class="metric"><span>High-intent URL</span><strong id="intentQualified">0</strong><em id="intentQualifiedPct">0%</em></div>
      <div class="metric"><span>Customer stream</span><strong id="customerMetric">0</strong><em id="customerPct">0%</em></div>
      <div class="metric"><span>Partner stream</span><strong id="partnerMetric">0</strong><em id="partnerPct">0%</em></div>
    </section>

    <main class="workspace">
      <section class="stage">
        <div class="stage-head">
          <div>
            <h2>Routing Sankey</h2>
            <p class="hint">Click any node or flow to inspect the companies inside it.</p>
          </div>
          <span class="badge" id="selectedBadge">All companies</span>
        </div>
        <div class="sankey-wrap">
          <svg id="sankey" viewBox="0 0 1160 560" role="img" aria-label="Routing Sankey diagram"></svg>
        </div>
      </section>

      <aside class="drawer">
        <div class="drawer-head">
          <div>
            <h2 id="drawerTitle">All companies</h2>
            <p class="hint" id="drawerSubtitle">Showing all companies in the current export.</p>
          </div>
          <span class="badge" id="drawerCount">0</span>
        </div>
        <input id="companySearch" type="search" placeholder="Search company, industry, domain..." />
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Company</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody id="companyRows"></tbody>
          </table>
        </div>
      </aside>
    </main>
  </div>

  <script type="application/json" id="payload">${payloadJson}</script>
  <script>
    const payload = JSON.parse(document.getElementById("payload").textContent);
    const rows = payload.rows;
    const els = {
      timeThreshold: document.getElementById("timeThreshold"),
      timeMode: document.getElementById("timeMode"),
      urlKeywords: document.getElementById("urlKeywords"),
      partnerKeywords: document.getElementById("partnerKeywords"),
      excludedRanges: document.getElementById("excludedRanges"),
      sankey: document.getElementById("sankey"),
      selectedBadge: document.getElementById("selectedBadge"),
      drawerTitle: document.getElementById("drawerTitle"),
      drawerSubtitle: document.getElementById("drawerSubtitle"),
      drawerCount: document.getElementById("drawerCount"),
      companyRows: document.getElementById("companyRows"),
      companySearch: document.getElementById("companySearch"),
      totalCompanies: document.getElementById("totalCompanies"),
      timeQualified: document.getElementById("timeQualified"),
      timeQualifiedPct: document.getElementById("timeQualifiedPct"),
      intentQualified: document.getElementById("intentQualified"),
      intentQualifiedPct: document.getElementById("intentQualifiedPct"),
      customerMetric: document.getElementById("customerMetric"),
      customerPct: document.getElementById("customerPct"),
      customerCount: document.getElementById("customerCount"),
      partnerMetric: document.getElementById("partnerMetric"),
      partnerPct: document.getElementById("partnerPct"),
      summaryText: document.getElementById("summaryText"),
    };

    els.urlKeywords.value = payload.rules.urlKeywords.join("\\n");
    els.partnerKeywords.value = payload.rules.partnerKeywords.join("\\n");

    const fmt = new Intl.NumberFormat("en-US");
    const percent = (value, total) => total ? (value / total * 100).toFixed(1) + "%" : "0.0%";
    const colors = {
      all: "#234967",
      pass: "#147765",
      warn: "#c58c28",
      stop: "#b34a3a",
      partner: "#b86542",
      muted: "#87918b",
    };

    const nodeMeta = {
      all: { label: "All companies", layer: 0, color: colors.all },
      time_drop: { label: "Below time", layer: 1, color: colors.stop },
      time_pass: { label: "Time qualified", layer: 1, color: colors.pass },
      missing_domain: { label: "Missing domain", layer: 2, color: colors.stop },
      domain_known: { label: "Domain known", layer: 2, color: colors.pass },
      missing_industry: { label: "Missing industry", layer: 3, color: colors.warn },
      industry_known: { label: "Industry known", layer: 3, color: colors.pass },
      missing_employee: { label: "Missing size", layer: 4, color: colors.warn },
      employee_excluded: { label: "Size excluded", layer: 4, color: colors.stop },
      employee_accepted: { label: "Size accepted", layer: 4, color: colors.pass },
      no_url: { label: "No URL intent", layer: 5, color: colors.stop },
      high_url: { label: "URL intent", layer: 5, color: colors.pass },
      partner: { label: "Partner stream", layer: 6, color: colors.partner },
      customer: { label: "Customer stream", layer: 6, color: colors.pass },
    };

    let current = null;
    let selected = { kind: "node", id: "all" };

    function listFromTextarea(value) {
      return value
        .split(/[\\n,]/)
        .map((item) => item.trim())
        .filter(Boolean);
    }

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
        urlKeywords: listFromTextarea(els.urlKeywords.value),
        partnerKeywords: listFromTextarea(els.partnerKeywords.value),
        excludedRanges: listFromTextarea(els.excludedRanges.value),
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

    function pathD(source, target, width) {
      const x0 = source.x + source.w;
      const x1 = target.x;
      const y0 = source.outY;
      const y1 = target.inY;
      const mid = (x1 - x0) * 0.52;
      return "M" + x0 + "," + y0 + " C" + (x0 + mid) + "," + y0 + " " + (x1 - mid) + "," + y1 + " " + x1 + "," + y1;
    }

    function layout(nodes, links) {
      const width = 1160;
      const height = 560;
      const margin = { top: 20, right: 24, bottom: 20, left: 24 };
      const nodeW = 18;
      const layerCount = Math.max(...nodes.map((node) => node.layer)) + 1;
      const layerGap = (width - margin.left - margin.right - nodeW) / Math.max(layerCount - 1, 1);
      const byLayer = new Map();
      for (const node of nodes) {
        if (!byLayer.has(node.layer)) {
          byLayer.set(node.layer, []);
        }
        byLayer.get(node.layer).push(node);
      }

      for (const [layer, layerNodes] of byLayer.entries()) {
        const total = layerNodes.reduce((sum, node) => sum + node.value, 0) || 1;
        const gap = 14;
        const available = height - margin.top - margin.bottom - gap * (layerNodes.length - 1);
        let y = margin.top;
        for (const node of layerNodes) {
          node.x = margin.left + layer * layerGap;
          node.w = nodeW;
          node.h = Math.max(16, available * node.value / total);
          node.y = y;
          node.inOffset = 0;
          node.outOffset = 0;
          y += node.h + gap;
        }
      }

      const nodeById = new Map(nodes.map((node) => [node.id, node]));
      const maxTotal = rows.length || 1;
      for (const link of links) {
        const source = nodeById.get(link.source);
        const target = nodeById.get(link.target);
        const sourceScale = source.h / Math.max(source.value, 1);
        const targetScale = target.h / Math.max(target.value, 1);
        link.width = Math.max(2, Math.min(38, link.value / maxTotal * 190));
        link.source = source;
        link.target = target;
        source.outOffset += link.value * sourceScale / 2;
        target.inOffset += link.value * targetScale / 2;
        source.outY = source.y + source.outOffset;
        target.inY = target.y + target.inOffset;
        source.outOffset += link.value * sourceScale / 2;
        target.inOffset += link.value * targetScale / 2;
      }

      return { nodes, links };
    }

    function renderSankey(flow) {
      const { nodes, links } = layout(flow.nodes, flow.links);
      els.sankey.innerHTML = "";

      const linkGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
      const nodeGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
      els.sankey.append(linkGroup, nodeGroup);

      for (const link of links) {
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("class", "link" + (selected.kind === "link" && selected.id === link.id ? " active" : ""));
        path.setAttribute("d", pathD(link.source, link.target, link.width));
        path.setAttribute("stroke", link.target.color);
        path.setAttribute("stroke-width", String(link.width));
        path.addEventListener("click", () => {
          selected = { kind: "link", id: link.id };
          render();
        });
        linkGroup.append(path);
      }

      for (const node of nodes) {
        const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
        g.setAttribute("class", "node" + (selected.kind === "node" && selected.id === node.id ? " active" : ""));
        g.setAttribute("transform", "translate(" + node.x + "," + node.y + ")");
        g.addEventListener("click", () => {
          selected = { kind: "node", id: node.id };
          render();
        });

        const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        rect.setAttribute("width", String(node.w));
        rect.setAttribute("height", String(node.h));
        rect.setAttribute("fill", node.color);

        const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
        label.setAttribute("class", "label");
        label.setAttribute("x", node.layer >= 4 ? "-8" : "28");
        label.setAttribute("y", "14");
        label.setAttribute("text-anchor", node.layer >= 4 ? "end" : "start");
        label.textContent = node.label;

        const count = document.createElementNS("http://www.w3.org/2000/svg", "text");
        count.setAttribute("class", "count");
        count.setAttribute("x", node.layer >= 4 ? "-8" : "28");
        count.setAttribute("y", "31");
        count.setAttribute("text-anchor", node.layer >= 4 ? "end" : "start");
        count.textContent = fmt.format(node.value) + " · " + percent(node.value, rows.length);

        g.append(rect, label, count);
        nodeGroup.append(g);
      }
    }

    function updateMetrics(flow) {
      const total = rows.length;
      const timeQualified = flow.nodes.find((node) => node.id === "time_pass")?.value || 0;
      const intentQualified = flow.nodes.find((node) => node.id === "high_url")?.value || 0;
      const customer = flow.nodes.find((node) => node.id === "customer")?.value || 0;
      const partner = flow.nodes.find((node) => node.id === "partner")?.value || 0;
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
      els.summaryText.textContent = fmt.format(partner) + " companies are routed to the partner stream instead of being dropped.";
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

      const selectedLabel = selected.kind === "link"
        ? selected.id.split("=>").map((id) => nodeMeta[id]?.label || id).join(" → ")
        : nodeMeta[selected.id]?.label || "All companies";
      els.selectedBadge.textContent = selectedLabel;
      els.drawerTitle.textContent = selectedLabel;
      els.drawerSubtitle.textContent = selected.kind === "link" ? "Companies moving through this flow." : "Companies currently inside this node.";
      els.drawerCount.textContent = fmt.format(records.length);

      if (!records.length) {
        els.companyRows.innerHTML = '<tr><td colspan="5"><div class="empty">No companies match the current selection.</div></td></tr>';
        return;
      }

      els.companyRows.innerHTML = records.slice(0, 500).map((row) => {
        const location = [row.city, row.state, row.country].filter(Boolean).join(", ");
        const company = row.name || "(unknown company)";
        const domain = row.domain ? '<br><span style="color:#68736e">' + escapeHtml(row.domain) + '</span>' : "";
        const place = location ? '<br><span style="color:#68736e">' + escapeHtml(location) + '</span>' : "";
        const details = [
          'Time ' + (row.timeText || "00:00:00"),
          row.industry || "missing industry",
          row.employeeRange || "missing size",
        ].join(" · ");
        return '<tr>' +
          '<td class="company-cell">' + escapeHtml(company) + domain + place + '</td>' +
          '<td><span class="reason">' + escapeHtml(routeLabel(row)) + '</span><span class="detail-line">' + escapeHtml(details) + '</span></td>' +
        '</tr>';
      }).join("");
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

    for (const element of [els.timeThreshold, els.timeMode, els.urlKeywords, els.partnerKeywords, els.excludedRanges]) {
      element.addEventListener("input", () => {
        selected = { kind: "node", id: "all" };
        render();
      });
    }
    els.companySearch.addEventListener("input", renderDrawer);

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

const html = buildHtml({
  generatedAt: new Date().toISOString(),
  sourceFile: sourceCsv,
  rows,
  rules,
});

await fs.mkdir(outputDir, { recursive: true });
await fs.mkdir(docsDir, { recursive: true });
await fs.writeFile(outputPath, html, "utf8");
await fs.writeFile(docsPath, html, "utf8");
console.log(outputPath);
console.log(docsPath);
