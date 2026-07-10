import path from "node:path";
import { chromium } from "playwright";

const root = process.cwd();
const filePath = path.join(root, "outputs", "h4a_v7_sankey_filter_visualizer.html");
const browser = await chromium.launch({
  headless: true,
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });

await page.goto(`file://${filePath}`, { waitUntil: "networkidle" });
await page.locator(".node").first().waitFor();

const result = await page.evaluate(() => {
  const overflowNodes = Array.from(document.querySelectorAll("body *"))
    .filter((el) => {
      const rect = el.getBoundingClientRect();
      return rect.width > window.innerWidth + 1;
    })
    .slice(0, 10)
    .map((el) => ({
      tag: el.tagName,
      className: el.className,
      text: el.textContent.trim().slice(0, 80),
      width: Math.round(el.getBoundingClientRect().width),
    }));

  return {
    title: document.title,
    h1: document.querySelector("h1")?.textContent,
    nodes: document.querySelectorAll(".node").length,
    links: document.querySelectorAll(".link").length,
    rows: document.querySelectorAll("#companyRows tr").length,
    customerCount: document.querySelector("#customerCount")?.textContent,
    overflowCount: overflowNodes.length,
    overflowNodes,
  };
});

await page.click(".link");
const afterClick = await page.evaluate(() => ({
  drawerTitle: document.querySelector("#drawerTitle")?.textContent,
  drawerCount: document.querySelector("#drawerCount")?.textContent,
}));

await page.fill("#timeThreshold", "60");
await page.waitForTimeout(100);
const afterChange = await page.evaluate(() => ({
  timeQualified: document.querySelector("#timeQualified")?.textContent,
  nodes: document.querySelectorAll(".node").length,
  links: document.querySelectorAll(".link").length,
}));

await page.screenshot({ path: path.join(root, "outputs", "h4a_v7_sankey_filter_visualizer_screenshot.png"), fullPage: true });
await browser.close();

console.log(JSON.stringify({ initial: result, afterClick, afterChange }, null, 2));
