import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const CLEARANCE_URL = "https://www.sportinglife.ca/en-CA/clearance/";
const OUTPUT_PATH = path.join("data", "sportinglife_laval_clearance.json");

async function loadAllProducts(page) {
  console.log("➡️ Loading all products (scroll + load more)…");

  const maxScrollRounds = 25;
  for (let i = 0; i < maxScrollRounds; i++) {
    await page.evaluate(() => {
      window.scrollBy(0, window.innerHeight * 0.9);
    });
    await page.waitForTimeout(800);

    const atBottom = await page.evaluate(() => {
      return window.innerHeight + window.scrollY >= document.body.scrollHeight - 10;
    });

    if (atBottom) break;
  }

  const LOAD_MORE_SELECTORS = [
    "button.load-more",
    "button#load-more",
    "button[data-load-more]",
    'button[aria-label*="Load more"]',
    "a.load-more",
    'a[aria-label*="Load more"]'
  ];

  while (true) {
    const loadMore = await page.$(LOAD_MORE_SELECTORS.join(", "));
    if (!loadMore) break;

    const isVisible = await loadMore.isVisible().catch(() => false);
    if (!isVisible) break;

    console.log("➡️ Clicking Load more…");
    await loadMore.click();
    await page.waitForTimeout(1500);

    await page.evaluate(() => window.scrollBy(0, window.innerHeight * 0.5));
  }

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(1000);

  console.log("   • Scroll / Load more finished.");
}

function extractPrice(text) {
  if (!text) return { currentPrice: null, originalPrice: null };

  const prices = [...text.matchAll(/\$([\d,]+(?:\.\d{2})?)/g)].map((m) =>
    parseFloat(m[1].replace(",", ""))
  );
  if (prices.length === 0) return { currentPrice: null, originalPrice: null };

  let originalPrice = null;
  let currentPrice = null;

  if (prices.length === 1) {
    currentPrice = prices[0];
  } else {
    originalPrice = prices[0];
    currentPrice = prices[prices.length - 1];
  }

  return { currentPrice, originalPrice };
}

async function scrape() {
  const browser = await chromium.launch({ headless: true });

  const page = await browser.newPage({ locale: "en-CA" });

  console.log(`➡️ Opening clearance page: ${CLEARANCE_URL}`);
  await page.goto(CLEARANCE_URL, { waitUntil: "networkidle" });

  await loadAllProducts(page);

  console.log("➡️ Extracting products…");

  const rawItems = await page.$$eval("a", (anchors) => {
    return anchors.map((a) => ({
      href: a.href || "",
      text: (a.textContent || "").trim().replace(/\s+/g, " "),
      closestTileText: (
        a.closest("li, article, .product, .product-tile, .product-grid-item") ||
        document.body
      ).innerText
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 300),
    }));
  });

  const productHrefRegex = /\/clearance\/.+\.html/i;
  const productMap = new Map();

  for (const item of rawItems) {
    const { href, text, closestTileText } = item;
    if (!href) continue;
    if (!href.startsWith("https://www.sportinglife.ca/")) continue;
    if (!productHrefRegex.test(href)) continue;

    const urlObj = new URL(href);
    const key = urlObj.origin + urlObj.pathname;

    if (!productMap.has(key)) {
      let name =
        text && text.length > 5
          ? text
          : (closestTileText.split("$")[0] || "").trim();

      if (!name) {
        const path = urlObj.pathname || "";
        const match = path.match(/\/clearance\/([^/]+)\//i);
        const slug = match && match[1] ? match[1] : null;
        if (slug) {
          name = slug.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
        } else {
          name = href;
        }
      }

      const priceInfo = extractPrice(closestTileText);

      productMap.set(key, {
        store: "Sporting Life - Laval (online clearance)",
        name,
        productUrl: key,
        imageUrl: null,
        currentPrice: priceInfo.currentPrice,
        originalPrice: priceInfo.originalPrice,
        badge: "Clearance",
      });
    }
  }

  const products = Array.from(productMap.values());

  console.log(`✅ ${products.length} products found.`);

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(products, null, 2), "utf-8");

  console.log(`💾 Written file: ${OUTPUT_PATH}`);

  await browser.close();
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  scrape().catch((err) => {
    console.error("❌ Scrape error:", err);
    process.exit(1);
  });
}
