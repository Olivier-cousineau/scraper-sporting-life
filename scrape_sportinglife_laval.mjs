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

  // Petit debug pour voir ce que la page contient
  const debugInfo = await page.evaluate(() => {
    const allAnchors = Array.from(document.querySelectorAll("a"));
    const hrefSamples = allAnchors
      .map((a) => a.getAttribute("href") || "")
      .filter(Boolean)
      .slice(0, 50); // 50 premiers pour voir les patterns

    const textSample = document.body.innerText.slice(0, 500);

    const productAnchors = Array.from(
      document.querySelectorAll('a[href*="/p/"], a[href*="/product/"], a[href*="/en-CA/"]')
    );

    return {
      totalAnchors: allAnchors.length,
      productAnchorCount: productAnchors.length,
      hrefSamples,
      textSample,
    };
  });

  console.log("DEBUG — total anchors:", debugInfo.totalAnchors);
  console.log("DEBUG — candidate product anchors:", debugInfo.productAnchorCount);
  console.log("DEBUG — first href samples:", debugInfo.hrefSamples);
  console.log("DEBUG — text sample:\n", debugInfo.textSample);

  const products = await page.evaluate(() => {
    const items = [];
    const anchors = Array.from(
      document.querySelectorAll('a[href*="/p/"], a[href*="/product/"]')
    );

    anchors.forEach((a) => {
      const name = a.textContent?.trim() || null;
      const productUrl = a.href || null;
      if (!name || !productUrl) return;

      const card = a.closest("li, article, div") || a;

      const imgEl =
        card.querySelector("img") || a.querySelector("img");

      const imageUrl =
        imgEl?.getAttribute("src") ||
        imgEl?.getAttribute("data-src") ||
        null;

      const priceContainer = card.closest("li, article, div") || card;

      const currentPriceText =
        priceContainer.querySelector(
          '.price__sale, .product-price__sale, [data-qa="product-sale-price"], .price, .product-price'
        )?.textContent?.trim() || null;

      const originalPriceText =
        priceContainer.querySelector(
          '.price__was, .product-price__original, [data-qa="product-original-price"], .price--original'
        )?.textContent?.trim() || null;

      const badgeText =
        priceContainer.querySelector(
          '[data-qa="badge"], .badge, .product-label, .product-flag'
        )?.textContent?.trim() || null;

      items.push({
        store: "Sporting Life - Laval (online clearance)",
        name,
        productUrl,
        imageUrl,
        currentPrice: currentPriceText,
        originalPrice: originalPriceText,
        badge: badgeText,
      });
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
