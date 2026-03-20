import crypto from "crypto";
import { extractColors } from "./colors.service.js";
import { extractFonts } from "./fonts.service.js";
import { extractWebsiteIntelligence } from "./websiteIntelligence.service.js";


export async function analyzeSingleWebsite(browser, url) {
  const id = crypto.randomUUID();
  const desktopFile = `desktop-${id}.webp`;
  const mobileFile = `mobile-${id}.webp`;

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(3000);

  const websiteName = await page.title();
  const intelligence = await extractWebsiteIntelligence(page);
  const colors = await extractColors(page);
  const fonts = await extractFonts(page);

  await page.screenshot({
    path: `screenshots/${desktopFile}`,
    type: "webp",
    fullPage: true,
  });

  await page.setViewport({ width: 450, height: 844 });
  await page.screenshot({
    path: `screenshots/${mobileFile}`,
    type: "webp",
    fullPage: true,
  });

  await page.close();

  return {
    url,
    websiteName,
    websiteType: intelligence.websiteType,
    categories: intelligence.categories,
    tags: intelligence.websiteTags,
    relatedPhrases: intelligence.relatedPhrases,
    colors,
    fonts,
    desktopScreenshot: desktopFile,
    mobileScreenshot: mobileFile,
  };
}