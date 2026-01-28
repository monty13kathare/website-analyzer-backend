import express from "express";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import cors from "cors";
import path from "path";
import fs from "fs";
import crypto from "crypto";

puppeteer.use(StealthPlugin());

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use(express.static("screenshots"));

/* ---------------- HELPERS ---------------- */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function isValidUrl(value) {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function rgbToHex(rgb) {
  const match = rgb.match(/\d+/g);
  if (!match) return null;

  const [r, g, b] = match.map(Number);
  return "#" + [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

/* ---------------- PAGE HARDENING ---------------- */

async function hardenPage(page) {
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
    Object.defineProperty(navigator, "languages", {
      get: () => ["en-US", "en"],
    });
    Object.defineProperty(navigator, "plugins", {
      get: () => [1, 2, 3, 4, 5],
    });
    window.chrome = { runtime: {} };
  });
}

/* ---------------- RENDERING ---------------- */

async function stabilizePage(page) {
  try {
    await page.waitForNetworkIdle({ idleTime: 1000, timeout: 20000 });
  } catch {}
  await sleep(4000);
}

async function aggressiveScroll(page) {
  try {
    await page.evaluate(async () => {
      for (let i = 0; i < 12; i++) {
        window.scrollBy(0, window.innerHeight);
        await new Promise((r) => setTimeout(r, 600));
      }
      window.scrollTo(0, 0);
    });
  } catch {}
}

async function forceLoadImages(page) {
  try {
    await page.evaluate(() => {
      document.querySelectorAll("img").forEach((img) => {
        img.loading = "eager";
        if (img.dataset?.src) img.src = img.dataset.src;
        if (img.dataset?.lazy) img.src = img.dataset.lazy;
      });
    });
  } catch {}
}

/* ---------------- EXTRACTION (SAFE) ---------------- */

async function extractCSSColors(page) {
  try {
    return await page.evaluate(() => {
      const colors = new Set();
      const els = Array.from(document.querySelectorAll("*")).slice(0, 1200);

      for (const el of els) {
        const s = getComputedStyle(el);
        [s.color, s.backgroundColor].forEach((c) => {
          if (c && c !== "rgba(0, 0, 0, 0)" && c.startsWith("rgb")) {
            colors.add(c);
          }
        });
      }
      return Array.from(colors);
    });
  } catch {
    return [];
  }
}

async function extractFonts(page) {
  try {
    return await page.evaluate(() => {
      const fonts = new Set();
      const els = Array.from(document.querySelectorAll("*")).slice(0, 1200);

      for (const el of els) {
        const family = getComputedStyle(el).fontFamily;
        if (family) {
          family
            .split(",")
            .forEach((f) => fonts.add(f.replace(/["']/g, "").trim()));
        }
      }
      return Array.from(fonts).slice(0, 10);
    });
  } catch {
    return [];
  }
}

function classifyFontTypes(fonts) {
  const types = new Set();
  fonts.forEach((f) => {
    const name = f.toLowerCase();
    if (name.includes("mono")) types.add("monospace");
    else if (name.includes("serif") && !name.includes("sans"))
      types.add("serif");
    else types.add("sans-serif");
  });
  return Array.from(types);
}

async function extractTags(page) {
  try {
    return await page.evaluate(() => {
      const tags = new Set();

      document
        .querySelectorAll("meta[name='keywords']")
        .forEach((m) =>
          m.content?.split(",").forEach((t) => tags.add(t.trim())),
        );

      document.querySelectorAll("h1,h2").forEach((h) => {
        if (h.innerText.length < 60) tags.add(h.innerText.toLowerCase());
      });

      return Array.from(tags).slice(0, 12);
    });
  } catch {
    return [];
  }
}

async function extractCategory(page) {
  try {
    return await page.evaluate(() => {
      const text = (
        document.title +
        " " +
        document.body.innerText.slice(0, 3000)
      ).toLowerCase();

      const rules = [
        [
          "E-commerce",
          [
            "shop",
            "store",
            "cart",
            "checkout",
            "buy",
            "order",
            "product",
            "sale",
          ],
        ],

        ["Marketplace", ["marketplace", "vendors", "sellers", "listings"]],

        [
          "Technology / SaaS",
          [
            "software",
            "saas",
            "platform",
            "cloud",
            "api",
            "dashboard",
            "integration",
          ],
        ],

        [
          "AI / Data / ML",
          [
            "artificial intelligence",
            "machine learning",
            "ai",
            "llm",
            "chatbot",
            "analytics",
          ],
        ],

        [
          "Education",
          [
            "education",
            "course",
            "learn",
            "training",
            "tutorial",
            "academy",
            "certification",
          ],
        ],

        [
          "Finance",
          ["bank", "banking", "investment", "loan", "insurance", "finance"],
        ],

        [
          "Healthcare",
          ["health", "medical", "clinic", "hospital", "doctor", "patient"],
        ],

        [
          "News / Media",
          ["news", "media", "journal", "headline", "breaking news"],
        ],

        [
          "Blog / Content",
          ["blog", "article", "post", "read more", "author", "comments"],
        ],

        [
          "Portfolio / Personal",
          [
            "portfolio",
            "my work",
            "projects",
            "case study",
            "developer",
            "designer",
          ],
        ],

        [
          "Corporate Website",
          [
            "about us",
            "our company",
            "leadership",
            "investors",
            "careers",
            "mission",
          ],
        ],

        ["Real Estate", ["real estate", "property", "rent", "buy home"]],

        [
          "Travel / Hospitality",
          ["travel", "hotel", "booking", "reservation", "vacation"],
        ],

        [
          "Government / Public Service",
          ["government", "ministry", "public service", "policy"],
        ],

        [
          "Non-Profit / NGO",
          ["ngo", "charity", "donation", "volunteer", "foundation"],
        ],
      ];

      let bestCategory = "General Website";
      let highestScore = 0;

      for (const [label, keywords] of rules) {
        let score = 0;
        for (const k of keywords) {
          if (text.includes(k)) score++;
        }

        if (score > highestScore) {
          highestScore = score;
          bestCategory = label;
        }
      }

      return bestCategory;
    });
  } catch {
    return "Unknown";
  }
}

/* ---------------- API ---------------- */

app.post("/analyze", async (req, res) => {
  const { url } = req.body;
  if (!url || !isValidUrl(url)) {
    return res.status(400).json({
      status: "error",
      message: "Please enter a valid website URL.",
    });
  }

  const dir = path.join(process.cwd(), "screenshots");
  ensureDir(dir);

  const id = crypto.randomUUID();
  const desktopFile = `desktop-${id}.webp`;
  const mobileFile = `mobile-${id}.webp`;

  const warnings = [];
  let browser;

  try {
    browser = await puppeteer.launch({
      headless: "new",
      protocolTimeout: 120000,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });

    /* ---------- DESKTOP ---------- */

    const desktop = await browser.newPage();
    await hardenPage(desktop);
    await desktop.setViewport({ width: 1440, height: 900 });

    await desktop.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    await stabilizePage(desktop);
    await forceLoadImages(desktop);
    await aggressiveScroll(desktop);

    try {
      await desktop.screenshot({
        path: path.join(dir, desktopFile),
        type: "webp",
        quality: 90,
        fullPage: true,
      });
    } catch {
      warnings.push("Desktop screenshot was partially captured.");
    }

    const category = await extractCategory(desktop);

    const rawColors = await extractCSSColors(desktop);

    const colors = rawColors.map(rgbToHex).filter(Boolean).slice(0, 30);

    // const colors = await extractCSSColors(desktop);
    const fonts = await extractFonts(desktop);
    const fontTypes = classifyFontTypes(fonts);
    const tags = await extractTags(desktop);

    await desktop.close();

    /* ---------- MOBILE ---------- */

    const mobile = await browser.newPage();
    await hardenPage(mobile);
    await mobile.setViewport({
      width: 450,
      height: 844,
      // isMobile: true,
      deviceScaleFactor: 1,
    });

    await mobile.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    await stabilizePage(mobile);

    try {
      await mobile.screenshot({
        path: path.join(dir, mobileFile),
        type: "webp",
        quality: 90,
        fullPage: true,
      });
    } catch {
      warnings.push("Mobile screenshot could not be fully generated.");
    }

    await mobile.close();

    res.json({
      status: warnings.length ? "partial_success" : "success",
      message: warnings.length
        ? "Some data could not be fully extracted, but screenshots were captured."
        : "Website analyzed successfully.",
      category,
      colors,
      fonts,
      fontTypes,
      tags,
      desktop: desktopFile,
      mobile: mobileFile,
      warnings,
    });
  } catch (err) {
    res.status(500).json({
      status: "error",
      message: "The website restricted automation or took too long to respond.",
    });
  } finally {
    if (browser) await browser.close();
  }
});

/* ---------------- SERVER ---------------- */

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
