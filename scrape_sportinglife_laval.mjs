import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const CLEARANCE_URL = "https://www.sportinglife.ca/en-CA/clearance/";
const BASE_URL = "https://www.sportinglife.ca";
const OUTPUT_PATH = path.join("data", "sportinglife_laval_clearance.json");

const PRODUCT_CARD_SELECTORS = [
  "li.product-grid__item",
  "div.product-grid__item",
  "div.product-tile",
  "article.product-tile",
  "div.product-card",
  "article",
];

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

async function loadAllClearanceProducts(page) {
  console.log("➡️ Loading all products (scroll + load more)…");

  const { selector: PRODUCT_TILE_SELECTOR } = await findProductCardSelector(page);
  let previousCount = 0;

  while (true) {
    const currentCount = await page.$$eval(
      PRODUCT_TILE_SELECTOR,
      (tiles) => tiles.length,
    );
    console.log("DEBUG — current tile count:", currentCount);

    const showMoreButton =
      (await page.$('text=/Show More/i')) ??
      (await page.$('button:has-text("Show More")')) ??
      (await page.$('a:has-text("Show More")'));

    if (!showMoreButton) {
      break;
    }

    previousCount = currentCount;

    await showMoreButton.click();
    console.log("DEBUG — clicked Show More");
    await page.waitForTimeout(2500);

    let increased = false;
    try {
      await page.waitForFunction(
        (sel, prev) => document.querySelectorAll(sel).length > prev,
        {},
        PRODUCT_TILE_SELECTOR,
        previousCount,
      );
      increased = true;
    } catch (err) {
      increased = false;
    }

    const after = await page.$$eval(PRODUCT_TILE_SELECTOR, (tiles) => tiles.length);
    console.log("DEBUG — current tile count after:", after);

    if (!increased || after <= previousCount) {
      break;
    }
  }

  const finalCount = await page.$$eval(PRODUCT_TILE_SELECTOR, (tiles) => tiles.length);
  console.log("   • Scroll / Load more finished.");
  console.log("DEBUG — final tile count before extraction:", finalCount);
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

  await loadAllClearanceProducts(page);

  console.log("➡️ Extracting products…");

  const { selector: chosenSelector } = await findProductCardSelector(page);

  const tiles = await page.$$(chosenSelector);
  console.log("DEBUG — product tiles:", tiles.length);

  const preview = await page.$$eval(
    chosenSelector,
    (cards) =>
      cards.slice(0, 5).map((card) => {
        const titleEl =
          card.querySelector('[data-testid*="title"], [data-test*="title"], .product-name, .product__name, h3, h4, a');
        const title = (titleEl?.textContent || "").trim().replace(/\s+/g, " ");
        const linkEl =
          card.querySelector('a[href*="/clearance/"]') ||
          card.querySelector('a[href*="/products/"]') ||
          card.querySelector("a");
        const href = linkEl ? linkEl.href : "";
        return { title, href };
      }),
  );

  console.log(
    "DEBUG — first titles:",
    preview.map((p) => `${p.title} -> ${p.href}`).join(" | ") || "<none>",
  );

  const products = await page.$$eval(chosenSelector, (cards) => {
    const extractPrices = (container) => {
      const priceText =
        container.querySelector('[class*="price"], [data-testid*="price"], [data-test*="price"]')?.textContent ||
        container.innerText;
      const prices = [...(priceText || "").matchAll(/\$([\d,]+(?:\.\d{2})?)/g)].map((m) =>
        parseFloat(m[1].replace(",", "")),
      );

      if (prices.length === 0) {
        return { currentPrice: null, originalPrice: null };
      }

      const currentPrice = prices[prices.length - 1];
      const originalPrice = prices.length > 1 ? prices[0] : null;
      return { currentPrice, originalPrice };
    };

    return cards.map((card) => {
      const titleEl =
        card.querySelector('[data-testid*="title"], [data-test*="title"], .product-name, .product__name, h3, h4, a');
      const title = (titleEl?.textContent || "").trim().replace(/\s+/g, " ");

      const linkEl =
        card.querySelector('a[href*="/clearance/"]') ||
        card.querySelector('a[href*="/products/"]') ||
        card.querySelector("a");
      const href = linkEl ? linkEl.href : null;

      const brandEl = card.querySelector(
        '[data-testid*="brand"], [data-test*="brand"], .product-brand, .product__brand, .brand',
      );
      const brand = (brandEl?.textContent || "").trim() || null;

      const imageEl = card.querySelector("img");
      const imageUrl = imageEl ? imageEl.src || imageEl.getAttribute("data-src") : null;

      const { currentPrice, originalPrice } = extractPrices(card);

      return {
        store: "Sporting Life - Laval (online clearance)",
        name: title || href || "",
        productUrl: href,
        imageUrl,
        brand,
        currentPrice,
        originalPrice,
        badge: "Clearance",
      };
    });
  });

  const unique = [];
  const seen = new Set();
  for (const product of products) {
    if (!product.productUrl) continue;
    const normalizedUrl = new URL(product.productUrl, BASE_URL).toString();
    if (seen.has(normalizedUrl)) continue;
    seen.add(normalizedUrl);
    unique.push({ ...product, productUrl: normalizedUrl });
  }

  console.log(`✅ ${unique.length} products found.`);

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(unique, null, 2), "utf-8");

  console.log(`💾 Written file: ${OUTPUT_PATH}`);

  await browser.close();
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  scrape().catch((err) => {
    console.error("❌ Scrape error:", err);
    process.exit(1);
  });
}
