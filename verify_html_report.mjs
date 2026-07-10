import path from "node:path";
import { chromium } from "playwright";

const root = process.cwd();
const reportPath = path.join(root, "outputs", "h4a_v7_audit_report.html");
const screenshotPath = path.join(root, "outputs", "h4a_v7_audit_report_screenshot.png");

const browser = await chromium.launch({
  headless: true,
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});

async function checkViewport(name, viewport, outPath) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  await page.goto(`file://${reportPath}`, { waitUntil: "networkidle" });
  const result = await page.evaluate(() => {
    const overflowNodes = [...document.querySelectorAll("body *")].filter((el) => {
      const style = getComputedStyle(el);
      return el.scrollWidth > el.clientWidth + 2 && style.overflowX === "visible";
    });

    return {
      title: document.title,
      h1: document.querySelector("h1")?.textContent?.trim(),
      metricText: document.querySelector(".metrics")?.textContent?.replace(/\s+/g, " ").trim(),
      panelCount: document.querySelectorAll(".panel").length,
      overflowCount: overflowNodes.length,
      overflowNodes: overflowNodes.slice(0, 8).map((el) => ({
        tag: el.tagName,
        className: el.className,
        text: el.textContent?.replace(/\s+/g, " ").trim().slice(0, 80),
        clientWidth: el.clientWidth,
        scrollWidth: el.scrollWidth,
      })),
    };
  });
  await page.screenshot({ path: outPath, fullPage: true });
  await page.close();
  return { name, ...result, screenshotPath: outPath };
}

const result = {
  desktop: await checkViewport("desktop", { width: 1440, height: 1400 }, screenshotPath),
  mobile: await checkViewport(
    "mobile",
    { width: 390, height: 1100 },
    path.join(root, "outputs", "h4a_v7_audit_report_mobile.png"),
  ),
};

await browser.close();

console.log(JSON.stringify(result, null, 2));
