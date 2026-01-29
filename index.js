import express from "express";
import cors from "cors";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import fs from "fs";
import crypto from "crypto";

puppeteer.use(StealthPlugin());

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("screenshots"));

const PORT = process.env.PORT || 5000;

/* ---------------- HELPERS ---------------- */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

const isValidUrl = (value) => {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
};

/* ---------------- INTELLIGENCE RULES ---------------- */

const CATEGORY_RULES = [
  {
    label: "Technology",
    tags: ["tech", "software", "platform", "api", "developer"],
    keywords: ["software", "api", "cloud", "developer", "code"],
  },
  {
    label: "AI / Machine Learning",
    tags: ["ai", "ml", "chatbot", "automation"],
    keywords: ["ai", "machine learning", "llm", "chatbot", "automation"],
  },
  {
    label: "Education",
    tags: ["education", "learning", "courses", "training"],
    keywords: ["course", "learn", "academy", "training", "education"],
  },
  {
    label: "E-commerce",
    tags: ["shopping", "store", "products"],
    keywords: ["shop", "cart", "checkout", "buy", "product"],
  },
  {
    label: "Social Media",
    tags: ["social-media", "community", "network"],
    keywords: ["social", "community", "followers", "share"],
  },
  {
    label: "Entertainment",
    tags: ["fun", "movies", "music", "videos"],
    keywords: ["movie", "music", "video", "entertainment", "stream"],
  },
  {
    label: "Finance",
    tags: ["finance", "banking", "investment"],
    keywords: ["bank", "finance", "investment", "crypto"],
  },
  {
    label: "Healthcare",
    tags: ["health", "medical", "fitness"],
    keywords: ["health", "clinic", "medical", "doctor"],
  },
];

/* ---------------- ANALYSIS ENGINE ---------------- */

async function extractWebsiteIntelligence(page) {
  return page.evaluate((RULES) => {
    const text = (
      document.title +
      " " +
      document.body.innerText.slice(0, 6000)
    ).toLowerCase();

    const categoryScores = [];
    const websiteTags = new Set();

    for (const rule of RULES) {
      let score = 0;
      rule.keywords.forEach((k) => {
        if (text.includes(k)) score++;
      });

      if (score > 0) {
        categoryScores.push({ label: rule.label, score });
        rule.tags.forEach((t) => websiteTags.add(t));
      }
    }

    categoryScores.sort((a, b) => b.score - a.score);

    const categories = categoryScores.slice(0, 6).map((c) => c.label);
    const websiteType = categories[0] || "General Website";

    const relatedPhrases = categories.map(
      (c) => `websites similar to ${c.toLowerCase()} platforms`
    );

    return {
      websiteType,
      categories,
      websiteTags: [...websiteTags],
      relatedPhrases,
    };
  }, CATEGORY_RULES);
}

/* ---------------- FONT EXTRACTION ---------------- */

async function extractFonts(page) {
  return page.evaluate(() => {
    const fonts = new Set();

    document.querySelectorAll("*").forEach((el) => {
      const fontFamily = getComputedStyle(el).fontFamily;
      if (!fontFamily) return;

      fontFamily.split(",").forEach((font) => {
        const clean = font.replace(/["']/g, "").trim().toLowerCase();
        if (
          clean &&
          !["inherit", "initial", "unset", "sans-serif", "serif"].includes(clean)
        ) {
          fonts.add(clean);
        }
      });
    });

    return Array.from(fonts).slice(0, 10);
  });
}

/* ---------------- COLOR EXTRACTION ---------------- */

async function extractColors(page) {
  return page.evaluate(() => {
    const set = new Set();

    document.querySelectorAll("*").forEach((el) => {
      const s = getComputedStyle(el);
      if (s.color?.startsWith("rgb")) set.add(s.color);
      if (s.backgroundColor?.startsWith("rgb")) set.add(s.backgroundColor);
    });

    return [...set].slice(0, 25).map((rgb) => {
      const m = rgb.match(/\d+/g);
      return (
        "#" +
        m.map((x) => Number(x).toString(16).padStart(2, "0")).join("")
      );
    });
  });
}

/* ---------------- SINGLE WEBSITE ANALYSIS ---------------- */

async function analyzeSingleWebsite(browser, url) {
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

/* ---------------- ANALYZE (SINGLE) ---------------- */

app.post("/analyze", async (req, res) => {
  const { url } = req.body;
  if (!isValidUrl(url)) {
    return res.status(400).json({ message: "Invalid URL" });
  }

  ensureDir("screenshots");
  let browser;

  try {
    browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });

    const data = await analyzeSingleWebsite(browser, url);
    res.json(data);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Website analysis failed" });
  } finally {
    if (browser) await browser.close();
  }
});

/* ---------------- ANALYZE (BULK) ---------------- */

app.post("/analyze/bulk", async (req, res) => {
  const { urls } = req.body;

  if (!Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ message: "URLs array required" });
  }

  ensureDir("screenshots");
  let browser;
  const results = [];

  try {
    browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });

    for (const url of urls) {
      if (!isValidUrl(url)) {
        results.push({ url, success: false, error: "Invalid URL" });
        continue;
      }

      try {
        const data = await analyzeSingleWebsite(browser, url);
        results.push({ success: true, data });
      } catch {
        results.push({ url, success: false, error: "Analysis failed" });
      }
    }

    res.json({
      total: urls.length,
      success: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Bulk analysis failed" });
  } finally {
    if (browser) await browser.close();
  }
});

/* ---------------- SUBMIT ---------------- */

app.post("/submit", (req, res) => {
  const data = req.body;
  if (!data.url || !data.websiteName) {
    return res.status(400).json({ message: "Invalid submission" });
  }

  fs.appendFileSync(
    "submissions.json",
    JSON.stringify(data, null, 2) + ",\n"
  );

  res.json({ message: "Website submitted successfully" });
});

/* ---------------- START ---------------- */

app.listen(PORT, () => {
  console.log(`🚀 Backend running on port ${PORT}`);
});
