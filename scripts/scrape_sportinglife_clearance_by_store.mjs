import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const LOCATIONS_PATH = path.join("data", "sportinglife_locations.json");
const OUTPUT_ROOT = path.join("outputs", "sportinglife");
const CLEARANCE_URL = "https://www.sportinglife.ca/en-CA/clearance/";
const BASE_URL = "https://www.sportinglife.ca";

const PRODUCT_CARD_SELECTORS = [
  "li.product-grid__item",
  "div.product-grid__item",
  "div.product-tile",
  "article.product-tile",
  "div.product-card",
  "article",
];

function readEnvInt(name, defaultValue) {
  const value = parseInt(process.env[name] || "", 10);
  return Number.isFinite(value) ? value : defaultValue;
}

function slugify(value) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/(^-|-$)+/g, "")
    .replace(/-{2,}/g, "-")
    .trim();
}

function loadLocations() {
  const raw = fs.readFileSync(LOCATIONS_PATH, "utf-8");
  const locations = JSON.parse(raw);
  if (!Array.isArray(locations)) {
    throw new Error("sportinglife_locations.json must be an array");
  }
  return locations.map((location, index) => {
    const name = location.name || location.storeName || `Store ${index + 1}`;
    const storeSlug =
      location.storeSlug || slugify(location.slug || location.name || name);
    return { ...location, name, storeSlug };
  });
}

function getShardStores(locations, shardIndex, totalShards) {
  if (totalShards !== 2) {
    throw new Error("TOTAL_SHARDS must be 2 for this workflow.");
  }
  if (shardIndex !== 1 && shardIndex !== 2) {
    throw new Error("SHARD_INDEX must be 1 or 2.");
  }

  if (shardIndex === 1) {
    return locations.slice(0, 8);
  }
  return locations.slice(8, 13);
}

async function findProductCardSelector(page) {
  return page.evaluate((selectors) => {
    for (const sel of selectors) {
      const matches = document.querySelectorAll(sel);
      if (matches.length > 0) {
        return { selector: sel, count: matches.length };
      }
    }
    return { selector: selectors[selectors.length - 1], count: 0 };
  }, PRODUCT_CARD_SELECTORS);
}

async function loadAllClearanceProducts(page, selector) {
  // Ensure first batch is ready
  await page.waitForSelector(selector, { timeout: 30000 });

  let stableIterations = 0;

  while (stableIterations < 5) {
    const before = await page.$$eval(selector, (tiles) => tiles.length);

    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    await page.waitForTimeout(1000);

    const showMoreButton =
      (await page.$('text=/Show More/i')) ||
      (await page.$('button:has-text("Show More")')) ||
      (await page.$('a:has-text("Show More")'));

    if (showMoreButton) {
      await showMoreButton.click();
      await page.waitForTimeout(3000);
    } else {
      await page.waitForTimeout(2000);
    }

    const after = await page.$$eval(selector, (tiles) => tiles.length);
    if (after <= before) {
      stableIterations += 1;
    } else {
      stableIterations = 0;
    }
  }
}

function extractPrices(text) {
  if (!text) return { currentPrice: null, originalPrice: null };
  const prices = [...text.matchAll(/\$([\d,]+(?:\.\d{2})?)/g)].map((m) =>
    parseFloat(m[1].replace(",", "")),
  );
  if (prices.length === 0) return { currentPrice: null, originalPrice: null };
  if (prices.length === 1) {
    return { currentPrice: prices[0], originalPrice: null };
  }
  return { currentPrice: prices[prices.length - 1], originalPrice: prices[0] };
}

async function saveDebugArtifacts(page, dir, prefix) {
  if (!page) return;
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const screenshotPath = path.join(dir, `${prefix}-${timestamp}.png`);
  const htmlPath = path.join(dir, `${prefix}-${timestamp}.html`);
  await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
  const html = await page.content().catch(() => null);
  if (html) {
    fs.writeFileSync(htmlPath, html, "utf-8");
  }
}

function toCsv(items) {
  const headers = [
    "store",
    "name",
    "productUrl",
    "imageUrl",
    "brand",
    "currentPrice",
    "originalPrice",
    "badge",
  ];
  const escape = (value) => {
    if (value === null || value === undefined) return "";
    const str = String(value).replace(/"/g, '""');
    if (str.includes(",") || str.includes("\n") || str.includes("\"")) {
      return `"${str}"`;
    }
    return str;
  };
  const rows = items.map((item) => headers.map((h) => escape(item[h])));
  return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
}

async function scrapeStore(store, options) {
  const { debug } = options;
  const storeDir = path.join(OUTPUT_ROOT, store.storeSlug || slugify(store.name));
  fs.mkdirSync(storeDir, { recursive: true });

  let browser;
  let page;

  try {
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage({ locale: "en-CA" });

    await page.goto(CLEARANCE_URL, { waitUntil: "networkidle" });

    const { selector } = await findProductCardSelector(page);
    await loadAllClearanceProducts(page, selector);

    const products = await page.$$eval(selector, (cards, baseUrl, storeName, priceFnSrc) => {
      // eslint-disable-next-line no-new-func
      const extractPrices = new Function(`return (${priceFnSrc})`)();
      return cards.map((card) => {
        const titleEl =
          card.querySelector('[data-testid*="title"], [data-test*="title"], .product-name, .product__name, h3, h4, a');
        const title = (titleEl?.textContent || "").trim().replace(/\s+/g, " ");

        const linkEl =
          card.querySelector('a[href*="/clearance/"]') ||
          card.querySelector('a[href*="/products/"]') ||
          card.querySelector("a");
        const href = linkEl ? linkEl.href || linkEl.getAttribute("href") : null;

        const brandEl = card.querySelector(
          '[data-testid*="brand"], [data-test*="brand"], .product-brand, .product__brand, .brand',
        );
        const brand = (brandEl?.textContent || "").trim() || null;

        const imageEl = card.querySelector("img");
        const imageUrl = imageEl ? imageEl.src || imageEl.getAttribute("data-src") : null;

        const priceText =
          card.querySelector('[class*="price"], [data-testid*="price"], [data-test*="price"]')?.textContent ||
          card.innerText;
        const { currentPrice, originalPrice } = extractPrices(priceText);

        return {
          store: storeName,
          name: title || href || "",
          productUrl: href ? new URL(href, baseUrl).toString() : null,
          imageUrl,
          brand,
          currentPrice,
          originalPrice,
          badge: "Clearance",
        };
      });
    }, BASE_URL, store.name, extractPrices.toString());

    const unique = [];
    const seen = new Set();
    for (const product of products) {
      if (!product.productUrl) continue;
      if (seen.has(product.productUrl)) continue;
      seen.add(product.productUrl);
      unique.push(product);
    }

    const jsonPath = path.join(storeDir, "data.json");
    const csvPath = path.join(storeDir, "data.csv");

    fs.writeFileSync(jsonPath, JSON.stringify(unique, null, 2), "utf-8");
    fs.writeFileSync(csvPath, toCsv(unique), "utf-8");

    return { success: true, count: unique.length, jsonPath, csvPath };
  } catch (error) {
    if (debug) {
      await saveDebugArtifacts(page, storeDir, "debug");
    }
    return { success: false, count: 0, error: error?.message || String(error) };
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

async function run() {
  const totalShards = readEnvInt("TOTAL_SHARDS", 2);
  const shardIndex = readEnvInt("SHARD_INDEX", 1);
  const concurrency = readEnvInt("CONCURRENCY", 1);
  const debug = readEnvInt("DEBUG", 0) === 1;

  const locations = loadLocations();
  const stores = getShardStores(locations, shardIndex, totalShards);

  fs.mkdirSync(OUTPUT_ROOT, { recursive: true });

  console.log(`Processing shard ${shardIndex}/${totalShards} with ${stores.length} stores…`);

  const queue = [...stores];
  const active = [];
  const results = [];

  async function next() {
    const store = queue.shift();
    if (!store) return;
    const promise = scrapeStore(store, { debug })
      .then((result) => {
        results.push({ ...result, storeName: store.name, storeSlug: store.storeSlug });
      })
      .catch((error) => {
        results.push({ success: false, count: 0, storeName: store.name, storeSlug: store.storeSlug, error: error?.message || String(error) });
      })
      .finally(() => {
        active.splice(active.indexOf(promise), 1);
      });
    active.push(promise);
    if (active.length >= concurrency) {
      await Promise.race(active);
    }
    await next();
  }

  await next();
  await Promise.all(active);

  const summary = {
    shardIndex,
    totalShards,
    concurrency,
    totalStores: stores.length,
    timestamp: new Date().toISOString(),
    results,
  };

  const summaryPath = path.join(OUTPUT_ROOT, `_summary_shard_${shardIndex}.json`);
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), "utf-8");
  console.log(`Summary written to ${summaryPath}`);
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  run().catch((err) => {
    console.error("❌ Script error:", err);
    process.exitCode = 1;
  });
}
