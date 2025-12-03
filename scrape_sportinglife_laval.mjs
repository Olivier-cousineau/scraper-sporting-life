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

async function loadAllProducts(page) {
  console.log("➡️ Loading all products (scroll + load more)…");

  let previousCount = 0;
  let stableIterations = 0;

  while (stableIterations < 3) {
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });

    await page.evaluate(() => {
      const buttonCandidates = [
        'button[data-testid="load-more"]',
        "button.load-more",
        "button#load-more",
        "button[data-load-more]",
        'button[aria-label*="load more" i]',
        "a.load-more",
        'a[aria-label*="load more" i]',
      ];

      const explicitButton = document.querySelector(buttonCandidates.join(", "));
      if (explicitButton && !explicitButton.disabled && explicitButton.offsetParent !== null) {
        explicitButton.click();
        return;
      }

      const textButton = Array.from(document.querySelectorAll("button, a")).find(
        (el) => /load more/i.test(el.textContent || "") && el.offsetParent !== null,
      );

      if (textButton && !textButton.disabled) {
        textButton.click();
      }
    });

    await page.waitForTimeout(2000);

    const { count: currentCount } = await findProductCardSelector(page);
    console.log("DEBUG — current tile count:", currentCount);

    if (currentCount <= previousCount) {
      stableIterations += 1;
    } else {
      stableIterations = 0;
      previousCount = currentCount;
    }
  }

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
