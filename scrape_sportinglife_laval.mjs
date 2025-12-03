import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const CLEARANCE_URL =
  process.env.SPORTING_LIFE_CLEARANCE_URL ||
  "https://www.sportinglife.ca/en-CA/clearance/";

async function scrapeSportingLifeLaval() {
  console.log("➡️ Opening clearance page:", CLEARANCE_URL);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto(CLEARANCE_URL, { waitUntil: "networkidle" });

  // Try to close cookie / consent popups if present
  try {
    const cookieBtn = await page.locator('button:has-text("Accept")').first();
    if (await cookieBtn.isVisible()) {
      await cookieBtn.click();
      console.log("✅ Cookies popup closed");
    }
  } catch (_) {}

  console.log("➡️ Loading all products (scroll / load more)…");

  // Loop to click "Load More" if it exists, otherwise scroll to bottom
  for (let i = 0; i < 30; i++) {
    const loadMore = page.locator('button:has-text("Load More")');
    if (await loadMore.count()) {
      console.log(`   • Click "Load More" (#${i + 1})`);
      await loadMore.click();
      await page.waitForTimeout(3000);
    } else {
      const prevHeight = await page.evaluate(() => document.body.scrollHeight);
      await page.mouse.wheel(0, prevHeight);
      await page.waitForTimeout(2000);
      const newHeight = await page.evaluate(() => document.body.scrollHeight);
      if (newHeight === prevHeight) {
        console.log("   • Nothing more to load.");
        break;
      }
    }
  }

  console.log("➡️ Extracting products…");

  const products = await page.evaluate(() => {
    const items = [];

    const cards = document.querySelectorAll(
      '[data-qa="product-tile"], .product-tile, .product-grid__item'
    );

    cards.forEach((card) => {
      const name =
        card.querySelector(
          '[data-qa="product-name"], .product__title, .product-tile__title'
        )?.textContent?.trim() || null;

      const link =
        card.querySelector('a[href*="/p/"]')?.href ||
        card.querySelector('a[href*="/product/"]')?.href ||
        null;

      const img =
        card.querySelector("img")?.getAttribute("src") ||
        card.querySelector("img")?.getAttribute("data-src") ||
        null;

      const currentPriceText =
        card.querySelector(
          ".price__sale, .product-price__sale, [data-qa=\"product-sale-price\"]"
        )?.textContent?.trim() || null;

      const originalPriceText =
        card.querySelector(
          ".price__was, .product-price__original, [data-qa=\"product-original-price\"]"
        )?.textContent?.trim() || null;

      const badge =
        card.querySelector(
          "[data-qa=\"badge\"], .badge, .product-label, .product-flag"
        )?.textContent?.trim() || null;

      if (name && link) {
        items.push({
          store: "Sporting Life - Laval (online clearance)",
          name,
          productUrl: link,
          imageUrl: img,
          currentPrice: currentPriceText,
          originalPrice: originalPriceText,
          badge
        });
      }
    });

    return items;
  });

  await browser.close();

  console.log(`✅ ${products.length} products found.`);

  const outDir = path.join("data");
  const outPath = path.join(outDir, "sportinglife_laval_clearance.json");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(products, null, 2), "utf8");

  console.log("💾 Written file:", outPath);
}

scrapeSportingLifeLaval().catch((err) => {
  console.error("❌ SCRAPER ERROR", err);
  process.exit(1);
});
