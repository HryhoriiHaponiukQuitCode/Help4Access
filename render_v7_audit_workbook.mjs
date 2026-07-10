import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const root = process.cwd();
const outputDir = path.join(root, "outputs", "previews");
const workbookPath = path.join(root, "outputs", "h4a_v7_snitcher_audit.xlsx");

await fs.mkdir(outputDir, { recursive: true });
const input = await FileBlob.load(workbookPath);
const workbook = await SpreadsheetFile.importXlsx(input);

for (const sheetName of ["Summary", "Audit", "Rules", "Industry Drops", "Keyword Drops"]) {
  const preview = await workbook.render({
    sheetName,
    autoCrop: "all",
    scale: 1,
    format: "png",
  });
  const bytes = new Uint8Array(await preview.arrayBuffer());
  const outPath = path.join(outputDir, `${sheetName.toLowerCase()}.png`);
  await fs.writeFile(outPath, bytes);
  console.log(outPath);
}
