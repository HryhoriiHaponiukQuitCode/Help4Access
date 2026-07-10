import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const root = process.cwd();
const outputDir = path.join(root, "outputs");
const data = JSON.parse(await fs.readFile(path.join(outputDir, "h4a_v7_audit_data.json"), "utf8"));
const outputPath = path.join(outputDir, "h4a_v7_snitcher_audit.xlsx");

const workbook = Workbook.create();
const summarySheet = workbook.worksheets.add("Summary");
const auditSheet = workbook.worksheets.add("Audit");
const rulesSheet = workbook.worksheets.add("Rules");
const industryDropsSheet = workbook.worksheets.add("Industry Drops");
const keywordDropsSheet = workbook.worksheets.add("Keyword Drops");

function writeTable(sheet, startCell, headers, rows) {
  const matrix = [headers, ...rows.map((row) => headers.map((header) => row[header] ?? ""))];
  sheet.getRange(startCell).write(matrix);
}

function styleHeader(range) {
  range.format.fill.color = "#17324D";
  range.format.font.color = "#FFFFFF";
  range.format.font.bold = true;
  range.format.wrapText = true;
}

function styleTitle(range) {
  range.format.font.bold = true;
  range.format.font.size = 16;
  range.format.font.color = "#17324D";
}

const s = data.summary;

summarySheet.showGridLines = false;
summarySheet.getRange("A1").values = [["H4A V7 Snitcher Audit"]];
styleTitle(summarySheet.getRange("A1"));
summarySheet.getRange("A3:B11").values = [
  ["Source file", s.source_file],
  ["Blueprint file", s.blueprint_file],
  ["Rows audited", s.row_count],
  ["PASS", s.pass_count],
  ["DROP", s.drop_count],
  ["PASS rate", s.pass_rate],
  ["Industry-excluded rows", s.industry_excluded_rows],
  ["Rule set", "PDF V7 + Make blueprint gates"],
  ["Time rule", "Not applied"],
];
summarySheet.getRange("A3:A11").format.font.bold = true;
summarySheet.getRange("B9").format.wrapText = true;
summarySheet.getRange("B8").setNumberFormat("0.0%");

const dropRows = Object.entries(s.drop_reason_counts).map(([reason, count]) => ({ reason, count }));
writeTable(summarySheet, "D3", ["reason", "count"], dropRows);
styleHeader(summarySheet.getRange("D3:E3"));

const passRangeRows = Object.entries(s.pass_by_employee_range).map(([employee_range, count]) => ({
  employee_range,
  count,
}));
writeTable(summarySheet, "G3", ["employee_range", "count"], passRangeRows);
styleHeader(summarySheet.getRange("G3:H3"));

const auditHeaders = [
  "source_row",
  "status",
  "primary_drop_reason",
  "all_drop_reasons",
  "matched_url_keywords",
  "matched_industry_keywords",
  "name",
  "domain",
  "website",
  "industry",
  "employee_range",
  "it_target",
  "biz_target",
  "total_time_on_site",
  "total_time_seconds",
  "total_visits",
  "total_pageviews",
  "unique_pages_visited",
  "page_paths_used_for_url_match",
  "country",
  "state",
  "city",
];
writeTable(auditSheet, "A1", auditHeaders, data.rows);
styleHeader(auditSheet.getRange("A1:V1"));
auditSheet.freezePanes.freezeRows(1);
auditSheet.getRange("A:V").format.wrapText = false;
auditSheet.getRange("D:D").format.wrapText = true;
auditSheet.getRange("R:R").format.wrapText = true;
auditSheet.getRange("S:S").format.wrapText = true;

rulesSheet.showGridLines = false;
rulesSheet.getRange("A1").values = [["Rules Applied"]];
styleTitle(rulesSheet.getRange("A1"));
rulesSheet.getRange("A3:B10").values = [
  ["PASS condition", "No drop reasons triggered"],
  ["Required fields", "domain, industry, employee range, company name"],
  ["Time gate", "Not applied"],
  ["URL gate", "Unique pages visited contains at least one URL keyword"],
  ["Industry gate", "Industry must not contain any partner keyword"],
  ["Employee gate", "Drop Unknown and 1-10 employees"],
  ["Targets", "Computed only for PASS rows"],
  ["Matching style", "Case-insensitive substring match to mirror Make contains/pattern behavior"],
];
rulesSheet.getRange("A3:A10").format.font.bold = true;
rulesSheet.getRange("B3:B10").format.wrapText = true;

writeTable(
  rulesSheet,
  "D3",
  ["url_keywords"],
  s.url_keywords.map((url_keywords) => ({ url_keywords })),
);
styleHeader(rulesSheet.getRange("D3:D3"));

writeTable(
  rulesSheet,
  "F3",
  ["industry_keywords"],
  s.industry_keywords.map((industry_keywords) => ({ industry_keywords })),
);
styleHeader(rulesSheet.getRange("F3:F3"));

industryDropsSheet.showGridLines = false;
industryDropsSheet.getRange("A1").values = [["Dropped Rows by Industry"]];
styleTitle(industryDropsSheet.getRange("A1"));
const industryDropHeaders = ["industry", "drop_count", "percent_of_drops", "sample_companies"];
writeTable(industryDropsSheet, "A3", industryDropHeaders, data.industry_drops);
styleHeader(industryDropsSheet.getRange("A3:D3"));
industryDropsSheet.freezePanes.freezeRows(3);
industryDropsSheet.getRange(`C4:C${data.industry_drops.length + 3}`).setNumberFormat("0.0%");
industryDropsSheet.getRange("D:D").format.wrapText = true;

keywordDropsSheet.showGridLines = false;
keywordDropsSheet.getRange("A1").values = [["Partner Keyword Exclusion Breakdown"]];
styleTitle(keywordDropsSheet.getRange("A1"));
keywordDropsSheet.getRange("A2").values = [
  [
    "Percent is calculated against rows dropped by partner_industry_exclusion. Rows can match multiple keywords, so percentages can add above 100%.",
  ],
];
keywordDropsSheet.getRange("A2:E2").merge();
keywordDropsSheet.getRange("A2").format.wrapText = true;
const keywordDropHeaders = [
  "industry_keyword",
  "excluded_row_count",
  "percent_of_industry_excluded_rows",
  "sample_industries",
  "sample_companies",
];
writeTable(keywordDropsSheet, "A4", keywordDropHeaders, data.keyword_drops);
styleHeader(keywordDropsSheet.getRange("A4:E4"));
keywordDropsSheet.freezePanes.freezeRows(4);
keywordDropsSheet.getRange(`C5:C${data.keyword_drops.length + 4}`).setNumberFormat("0.0%");
keywordDropsSheet.getRange("D:E").format.wrapText = true;

for (const sheet of [summarySheet, auditSheet, rulesSheet, industryDropsSheet, keywordDropsSheet]) {
  const used = sheet.getUsedRange();
  used.format.autofitColumns();
  used.format.autofitRows();
}

auditSheet.getRange("D:D").format.columnWidth = 34;
auditSheet.getRange("R:R").format.columnWidth = 80;
auditSheet.getRange("S:S").format.columnWidth = 80;
rulesSheet.getRange("B:B").format.columnWidth = 62;
rulesSheet.getRange("F:F").format.columnWidth = 26;
summarySheet.getRange("B:B").format.columnWidth = 42;
industryDropsSheet.getRange("D:D").format.columnWidth = 70;
keywordDropsSheet.getRange("D:E").format.columnWidth = 54;

await fs.mkdir(outputDir, { recursive: true });
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);

const inspect = await workbook.inspect({
  kind: "sheet,table",
  maxChars: 6000,
  tableMaxRows: 8,
  tableMaxCols: 8,
});
console.log(inspect.ndjson);
console.log(outputPath);
