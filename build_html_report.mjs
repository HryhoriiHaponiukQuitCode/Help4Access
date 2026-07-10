import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const dataPath = path.join(root, "outputs", "h4a_v7_audit_data.json");
const outputPath = path.join(root, "outputs", "h4a_v7_audit_report.html");
const data = JSON.parse(await fs.readFile(dataPath, "utf8"));

const { summary } = data;
const pct = (value, digits = 1) => `${(value * 100).toFixed(digits)}%`;
const fmt = new Intl.NumberFormat("en-US");

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function barRows(rows, options) {
  const max = Math.max(...rows.map((row) => Number(row[options.valueKey] || 0)), 1);
  return rows
    .map((row, index) => {
      const value = Number(row[options.valueKey] || 0);
      const width = Math.max((value / max) * 100, value ? 3 : 0);
      const percentText = options.percentKey ? pct(Number(row[options.percentKey] || 0)) : "";
      return `
        <div class="bar-row" style="--delay:${index * 28}ms">
          <div class="bar-label">
            <span>${escapeHtml(row[options.labelKey])}</span>
            <strong>${fmt.format(value)}${percentText ? ` <em>${percentText}</em>` : ""}</strong>
          </div>
          <div class="bar-track"><span style="width:${width.toFixed(2)}%"></span></div>
          ${options.metaKey ? `<p>${escapeHtml(row[options.metaKey])}</p>` : ""}
        </div>`;
    })
    .join("");
}

function reasonRows() {
  const entries = Object.entries(summary.drop_reason_counts).map(([reason, count]) => ({
    reason: reason.replaceAll("_", " "),
    count,
    percent: count / summary.drop_count,
  }));
  return barRows(entries, {
    labelKey: "reason",
    valueKey: "count",
    percentKey: "percent",
  });
}

const keywordRows = data.keyword_drops.slice(0, 12);
const industryRows = data.industry_drops.slice(0, 14);
const urlRows = Object.entries(summary.matched_url_keyword_counts)
  .map(([keyword, count]) => ({ keyword, count, percent: count / summary.row_count }))
  .sort((a, b) => b.count - a.count);
const employeeRows = Object.entries(summary.pass_by_employee_range).map(([range, count]) => ({
  range,
  count,
  percent: count / summary.pass_count,
}));

const topKeyword = keywordRows[0];
const broadKeywordNote = keywordRows
  .filter((row) => ["services", "it", "and"].includes(row.industry_keyword))
  .map((row) => `${row.industry_keyword} (${fmt.format(row.excluded_row_count)})`)
  .join(", ");

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>H4A V7 Snitcher Audit Report</title>
  <style>
    :root {
      --paper: #f7f3ec;
      --surface: #fffdf8;
      --ink: #17201c;
      --muted: #68736e;
      --line: #d9d0c2;
      --navy: #15334a;
      --teal: #12756b;
      --teal-soft: #dbece8;
      --copper: #b45f3d;
      --gold: #c7902f;
      --red: #b94635;
      --shadow: 0 18px 50px rgba(45, 34, 20, 0.10);
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      color: var(--ink);
      background:
        linear-gradient(135deg, rgba(18, 117, 107, 0.09), transparent 26rem),
        linear-gradient(315deg, rgba(180, 95, 61, 0.08), transparent 24rem),
        var(--paper);
      font-family: ui-serif, Georgia, Cambria, "Times New Roman", serif;
      letter-spacing: 0;
    }

    .page {
      width: min(1180px, calc(100vw - 32px));
      margin: 0 auto;
      padding: 28px 0 44px;
    }

    header {
      display: grid;
      grid-template-columns: 1.35fr 0.65fr;
      gap: 22px;
      align-items: stretch;
      margin-bottom: 18px;
    }

    .hero,
    .panel,
    .metric {
      background: color-mix(in srgb, var(--surface) 92%, white);
      border: 1px solid rgba(23, 32, 28, 0.10);
      box-shadow: var(--shadow);
    }

    .hero {
      padding: 28px;
      border-radius: 8px;
      position: relative;
      overflow: hidden;
    }

    .hero::before {
      content: "";
      position: absolute;
      inset: 0 0 auto 0;
      height: 5px;
      background: linear-gradient(90deg, var(--teal), var(--gold), var(--copper), var(--navy));
    }

    .eyebrow {
      color: var(--teal);
      font: 700 12px/1.2 ui-sans-serif, system-ui, sans-serif;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      margin: 0 0 12px;
    }

    h1 {
      margin: 0;
      max-width: 760px;
      font-size: clamp(34px, 5vw, 66px);
      line-height: 0.96;
      font-weight: 680;
    }

    .subtitle {
      margin: 18px 0 0;
      max-width: 760px;
      color: var(--muted);
      font: 17px/1.45 ui-sans-serif, system-ui, sans-serif;
    }

    .hero-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 24px;
      font: 12px/1 ui-sans-serif, system-ui, sans-serif;
      color: var(--muted);
    }

    .hero-meta span {
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 8px 10px;
      background: rgba(255, 255, 255, 0.55);
    }

    .verdict {
      border-radius: 8px;
      padding: 20px;
      background: #17201c;
      color: #fffaf0;
      box-shadow: var(--shadow);
      min-height: 100%;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }

    .verdict small {
      color: #b7c7c2;
      font: 700 12px/1.2 ui-sans-serif, system-ui, sans-serif;
      letter-spacing: 0.11em;
      text-transform: uppercase;
    }

    .verdict strong {
      display: block;
      margin-top: 16px;
      font-size: 62px;
      line-height: 0.9;
      font-weight: 720;
    }

    .verdict p {
      color: #d8ded9;
      margin: 14px 0 0;
      font: 15px/1.42 ui-sans-serif, system-ui, sans-serif;
    }

    .metrics {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
      margin-bottom: 18px;
    }

    .metric {
      border-radius: 8px;
      padding: 16px 18px;
    }

    .metric span {
      color: var(--muted);
      display: block;
      font: 700 11px/1.1 ui-sans-serif, system-ui, sans-serif;
      letter-spacing: 0.09em;
      text-transform: uppercase;
    }

    .metric strong {
      display: block;
      margin-top: 8px;
      font: 700 34px/1 ui-sans-serif, system-ui, sans-serif;
      color: var(--navy);
    }

    .metric.pass strong { color: var(--teal); }
    .metric.drop strong { color: var(--red); }
    .metric.warn strong { color: var(--copper); }

    main {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 360px;
      gap: 18px;
      align-items: start;
    }

    .stack {
      display: grid;
      gap: 18px;
    }

    .panel {
      border-radius: 8px;
      padding: 20px;
    }

    .section-head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--line);
      margin-bottom: 14px;
    }

    h2 {
      margin: 0;
      font-size: 24px;
      line-height: 1.1;
      font-weight: 700;
    }

    .section-head p,
    .note {
      margin: 0;
      color: var(--muted);
      font: 13px/1.45 ui-sans-serif, system-ui, sans-serif;
    }

    .bar-list {
      display: grid;
      gap: 10px;
    }

    .bar-row {
      animation: rise 520ms ease both;
      animation-delay: var(--delay);
    }

    .bar-label {
      display: flex;
      justify-content: space-between;
      gap: 14px;
      font: 13px/1.2 ui-sans-serif, system-ui, sans-serif;
    }

    .bar-label span {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: #26322e;
      font-weight: 650;
    }

    .bar-label strong {
      white-space: nowrap;
      color: var(--ink);
    }

    .bar-label em {
      color: var(--muted);
      font-style: normal;
      font-weight: 600;
      margin-left: 5px;
    }

    .bar-track {
      height: 8px;
      border-radius: 999px;
      background: #eee6da;
      overflow: hidden;
      margin-top: 6px;
    }

    .bar-track span {
      display: block;
      height: 100%;
      border-radius: inherit;
      background: linear-gradient(90deg, var(--teal), var(--gold));
    }

    .bar-row p {
      margin: 5px 0 0;
      color: var(--muted);
      font: 12px/1.35 ui-sans-serif, system-ui, sans-serif;
    }

    .split {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 18px;
    }

    .table-wrap {
      overflow-x: auto;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font: 13px/1.35 ui-sans-serif, system-ui, sans-serif;
    }

    th {
      text-align: left;
      padding: 9px 8px;
      background: #17324d;
      color: white;
      font-size: 11px;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      white-space: nowrap;
    }

    td {
      padding: 9px 8px;
      border-bottom: 1px solid #e7dfd3;
      vertical-align: top;
    }

    td.num {
      text-align: right;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }

    td.samples {
      color: var(--muted);
      max-width: 560px;
    }

    .insights {
      display: grid;
      gap: 10px;
    }

    .insight {
      border-left: 4px solid var(--teal);
      background: var(--teal-soft);
      padding: 12px 13px;
      border-radius: 0 8px 8px 0;
      font: 13px/1.42 ui-sans-serif, system-ui, sans-serif;
    }

    .insight strong {
      display: block;
      color: var(--navy);
      margin-bottom: 4px;
    }

    .insight.warn {
      border-color: var(--copper);
      background: #f4e6dc;
    }

    .legend {
      display: grid;
      gap: 8px;
      margin-top: 14px;
      font: 12px/1.35 ui-sans-serif, system-ui, sans-serif;
      color: var(--muted);
    }

    .pill {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      width: fit-content;
      border-radius: 999px;
      border: 1px solid var(--line);
      padding: 7px 10px;
      color: var(--navy);
      background: rgba(255, 255, 255, 0.72);
      font-weight: 700;
    }

    footer {
      margin-top: 18px;
      color: var(--muted);
      font: 12px/1.4 ui-sans-serif, system-ui, sans-serif;
      text-align: center;
    }

    @keyframes rise {
      from { opacity: 0; transform: translateY(6px); }
      to { opacity: 1; transform: translateY(0); }
    }

    @media (max-width: 980px) {
      header,
      main,
      .split {
        grid-template-columns: 1fr;
      }

      .metrics {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }

    @media (max-width: 620px) {
      .page { width: min(100vw - 20px, 1180px); padding-top: 10px; }
      .hero { padding: 22px; }
      .hero-meta span { overflow-wrap: anywhere; }
      .metrics { grid-template-columns: 1fr; }
      .section-head { display: block; }
      .section-head p { margin-top: 8px; }
      .verdict strong { font-size: 50px; }
      table { table-layout: fixed; }
      th, td { overflow-wrap: anywhere; white-space: normal; }
    }

    @media print {
      body { background: white; }
      .page { width: 100%; padding: 0; }
      .hero, .panel, .metric, .verdict { box-shadow: none; }
      main, header { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="page">
    <header>
      <section class="hero">
        <p class="eyebrow">H4A ABM Visit V7 audit</p>
        <h1>Snitcher lead quality report</h1>
        <p class="subtitle">Compact readout of the V7 routing rules against ${fmt.format(summary.row_count)} exported Snitcher accounts. Time on site is intentionally not used as a gate.</p>
        <div class="hero-meta">
          <span>Source: ${escapeHtml(summary.source_file)}</span>
          <span>Rules: ${escapeHtml(summary.blueprint_file)}</span>
          <span>Generated locally</span>
        </div>
      </section>
      <aside class="verdict">
        <div>
          <small>Current pass rate</small>
          <strong>${pct(summary.pass_rate)}</strong>
          <p>${fmt.format(summary.pass_count)} accounts pass the V7 gates. ${fmt.format(summary.drop_count)} are held back by missing data, URL intent, employee size, or partner-industry exclusion.</p>
        </div>
        <span class="pill">Time gate: off</span>
      </aside>
    </header>

    <section class="metrics">
      <div class="metric"><span>Audited rows</span><strong>${fmt.format(summary.row_count)}</strong></div>
      <div class="metric pass"><span>Pass</span><strong>${fmt.format(summary.pass_count)}</strong></div>
      <div class="metric drop"><span>Drop</span><strong>${fmt.format(summary.drop_count)}</strong></div>
      <div class="metric warn"><span>Industry excluded</span><strong>${fmt.format(summary.industry_excluded_rows)}</strong></div>
    </section>

    <main>
      <div class="stack">
        <section class="panel">
          <div class="section-head">
            <h2>Why accounts drop</h2>
            <p>Primary reason per dropped row</p>
          </div>
          <div class="bar-list">
            ${reasonRows()}
          </div>
        </section>

        <section class="panel">
          <div class="section-head">
            <h2>Partner keyword pressure</h2>
            <p>Percent of ${fmt.format(summary.industry_excluded_rows)} industry-excluded rows. One row can match multiple keywords.</p>
          </div>
          <div class="bar-list">
            ${barRows(keywordRows, {
              labelKey: "industry_keyword",
              valueKey: "excluded_row_count",
              percentKey: "percent_of_industry_excluded_rows",
              metaKey: "sample_industries",
            })}
          </div>
        </section>

        <section class="panel">
          <div class="section-head">
            <h2>Dropped industries</h2>
            <p>Largest industries among all dropped rows</p>
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Industry</th>
                  <th>Rows</th>
                  <th>% of drops</th>
                  <th>Sample companies</th>
                </tr>
              </thead>
              <tbody>
                ${industryRows
                  .map(
                    (row) => `
                    <tr>
                      <td>${escapeHtml(row.industry)}</td>
                      <td class="num">${fmt.format(row.drop_count)}</td>
                      <td class="num">${pct(row.percent_of_drops)}</td>
                      <td class="samples">${escapeHtml(row.sample_companies)}</td>
                    </tr>`,
                  )
                  .join("")}
              </tbody>
            </table>
          </div>
        </section>

        <section class="panel split">
          <div>
            <div class="section-head">
              <h2>Intent URL signals</h2>
              <p>Keyword matches across all rows</p>
            </div>
            <div class="bar-list">
              ${barRows(urlRows, {
                labelKey: "keyword",
                valueKey: "count",
                percentKey: "percent",
              })}
            </div>
          </div>
          <div>
            <div class="section-head">
              <h2>Passed by size</h2>
              <p>Employee range among PASS rows</p>
            </div>
            <div class="bar-list">
              ${barRows(employeeRows, {
                labelKey: "range",
                valueKey: "count",
                percentKey: "percent",
              })}
            </div>
          </div>
        </section>
      </div>

      <aside class="stack">
        <section class="panel">
          <div class="section-head">
            <h2>Read this first</h2>
          </div>
          <div class="insights">
            <div class="insight">
              <strong>The flow is selective.</strong>
              Only ${fmt.format(summary.pass_count)} of ${fmt.format(summary.row_count)} accounts pass after removing the time-on-site gate.
            </div>
            <div class="insight warn">
              <strong>Industry keywords are the main lever.</strong>
              ${fmt.format(summary.industry_excluded_rows)} rows match at least one partner keyword. The top keyword is "${escapeHtml(topKeyword.industry_keyword)}" at ${fmt.format(topKeyword.excluded_row_count)} rows.
            </div>
            <div class="insight warn">
              <strong>Broad keywords need review.</strong>
              ${escapeHtml(broadKeywordNote)} are high-impact and likely deserve manual validation before production.
            </div>
            <div class="insight">
              <strong>URL intent is still meaningful.</strong>
              ${fmt.format(summary.drop_reason_counts.no_high_intent_url || 0)} rows fail because no high-intent URL keyword is found in the visited paths.
            </div>
          </div>
        </section>

        <section class="panel">
          <div class="section-head">
            <h2>Rule notes</h2>
          </div>
          <div class="legend">
            <span><strong>Time on site:</strong> not applied.</span>
            <span><strong>URL matching:</strong> path/query only, not full URL, so <code>lp</code> does not accidentally match <code>help4access.com</code>.</span>
            <span><strong>Keyword matching:</strong> case-insensitive substring behavior to mirror Make.</span>
            <span><strong>Excel source:</strong> full row-level detail remains in <code>h4a_v7_snitcher_audit.xlsx</code>.</span>
          </div>
        </section>
      </aside>
    </main>

    <footer>
      H4A V7 Snitcher Audit Report · ${new Date().toISOString().slice(0, 10)}
    </footer>
  </div>
</body>
</html>`;

await fs.writeFile(outputPath, html, "utf8");
console.log(outputPath);
