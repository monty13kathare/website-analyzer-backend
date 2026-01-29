import express from "express";
import cors from "cors";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import path from "path";
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

/* ---------------- CATEGORY (SCORING-BASED) ---------------- */

async function extractCategory(page) {
  return page.evaluate(() => {
    const text = (
      document.title +
      " " +
      document.body.innerText.slice(0, 3000)
    ).toLowerCase();

    const rules = [
      [
        "AI / Data / ML",
        ["ai", "machine learning", "chatbot", "llm", "analytics"],
      ],
      ["Social Media", ["social", "community", "followers", "share"]],
      ["E-commerce", ["shop", "store", "cart", "checkout", "buy"]],
      ["Education", ["course", "learn", "academy", "training"]],
      ["Finance", ["bank", "finance", "investment", "crypto"]],
      ["Healthcare", ["health", "medical", "clinic"]],
      ["SaaS / Technology", ["software", "platform", "api", "dashboard"]],
      ["News / Media", ["news", "media", "headline"]],
      ["Portfolio", ["portfolio", "projects", "case study"]],
    ];

    let best = "General Website";
    let score = 0;

    for (const [label, keywords] of rules) {
      let hits = keywords.filter((k) => text.includes(k)).length;
      if (hits > score) {
        score = hits;
        best = label;
      }
    }

    return best;
  });
}

/* ---------------- ANALYZE ---------------- */

app.post("/analyze", async (req, res) => {
  const { url } = req.body;
  if (!isValidUrl(url)) {
    return res.status(400).json({ message: "Invalid URL" });
  }

  ensureDir("screenshots");
  const id = crypto.randomUUID();

  const desktopFile = `desktop-${id}.webp`;
  const mobileFile = `mobile-${id}.webp`;

  let browser;

  try {
    browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await sleep(3000);

    const websiteName = await page.title();
    const category = await extractCategory(page);

    const colors = await page.evaluate(() => {
      const set = new Set();
      document.querySelectorAll("*").forEach((el) => {
        const s = getComputedStyle(el);
        if (s.color) set.add(s.color);
        if (s.backgroundColor) set.add(s.backgroundColor);
      });
      return [...set]
        .filter((c) => c.startsWith("rgb"))
        .slice(0, 20)
        .map((c) => {
          const m = c.match(/\d+/g);
          return (
            "#" + m.map((x) => Number(x).toString(16).padStart(2, "0")).join("")
          );
        });
    });

    const fonts = await page.evaluate(() => {
      const set = new Set();
      document.querySelectorAll("*").forEach((el) => {
        getComputedStyle(el)
          .fontFamily.split(",")
          .forEach((f) => set.add(f.replace(/["']/g, "").trim()));
      });
      return [...set].slice(0, 8);
    });

    const tags = await page.evaluate(() => {
      const set = new Set();
      document.querySelectorAll("h1,h2").forEach((h) => {
        if (h.innerText.length < 50) set.add(h.innerText.toLowerCase());
      });
      return [...set].slice(0, 10);
    });

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

    res.json({
      websiteName,
      category,
      colors,
      fonts,
      tags,
      desktop: desktopFile,
      mobile: mobileFile,
    });
  } catch (e) {
    res.status(500).json({ message: "Website analysis failed" });
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

  // Replace with DB later
  fs.appendFileSync("submissions.json", JSON.stringify(data, null, 2) + ",\n");

  res.json({ message: "Website submitted successfully" });
});

/* ---------------- START ---------------- */

app.listen(PORT, () => {
  console.log(`🚀 Backend running on port ${PORT}`);
});
