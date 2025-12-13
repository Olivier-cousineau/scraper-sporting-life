import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const STORE_LOCATOR_URL = "https://www.sportinglife.ca/en-CA/store-locator";
const OUTPUT_PATH = path.join("data", "sportinglife_locations.json");

const FALLBACK_LOCATIONS = [
  {
    name: "Southgate Centre",
    hours: "Ouvert · Ferme à 21:00",
    addressLine1: "5015 111 St NW",
    addressLine2: "Unit #940",
    city: "Edmonton",
    province: "AB",
    postalCode: "T6H 4M6",
    country: "CA",
    phone: "(587) 405-5660",
    distanceKm: 545,
  },
  {
    name: "Sporting Life",
    hours: "Ouvert · Ferme à 20:00",
    addressLine1: "3625 Shaganappi Trail Northwest",
    city: "Calgary",
    province: "AB",
    postalCode: "T3A 0E2",
    country: "CA",
    phone: "(403) 313-1675",
    distanceKm: 761,
  },
  {
    name: "Sporting Life",
    hours: "Ouvert · Ferme à 21:00",
    addressLine1: "100 Anderson Road Southeast",
    city: "Calgary",
    province: "AB",
    postalCode: "T2J 3V1",
    country: "CA",
    phone: "(403) 313-4477",
  },
  {
    name: "Quartier DIX30",
    hours: "Ouvert · Ferme à 17:00",
    addressLine1: "9090 Boulevard Leduc",
    addressLine2: "#40",
    city: "Brossard",
    province: "QC",
    postalCode: "J4Y 0E9",
    country: "CA",
    phone: "(450) 648-7669",
    distanceKm: 229,
  },
  {
    name: "Sporting Life",
    hours: "Ouvert · Ferme à 19:00",
    addressLine1: "3003 Boulevard le Carrefour",
    city: "Laval",
    province: "QC",
    postalCode: "H7T 1C7",
    country: "CA",
    phone: "(579) 805-5520",
    distanceKm: 240,
  },
  {
    name: "Lansdowne Park",
    hours: "Ouvert · Ferme à 20:00",
    addressLine1: "125 Marché Way",
    addressLine2: "Lansdowne Park",
    city: "Ottawa",
    province: "ON",
    postalCode: "K1S 3W7",
    country: "CA",
    phone: "(613) 216-6000",
    distanceKm: 379,
  },
  {
    name: "CF Markville",
    hours: "Ouvert · Ferme à 21:30",
    addressLine1: "5000 Highway 7",
    city: "Markham",
    province: "ON",
    postalCode: "L3R 4M9",
    country: "CA",
    phone: "(905) 258-1111",
    distanceKm: 711,
  },
  {
    name: "Hillcrest Mall",
    hours: "Ouvert · Ferme à 21:00",
    addressLine1: "9350 Yonge Street",
    city: "Richmond Hill",
    province: "ON",
    postalCode: "L4C 5G2",
    country: "CA",
    phone: "(905) 292-0001",
    distanceKm: 722,
  },
  {
    name: "Yonge Street",
    hours: "Ouvert · Ferme à 19:00",
    addressLine1: "2665 Yonge Street",
    city: "Toronto",
    province: "ON",
    postalCode: "M4P 2J6",
    country: "CA",
    phone: "(416) 485-1611",
    distanceKm: 727,
  },
  {
    name: "Yorkdale Shopping Centre",
    hours: "Ouvert · Ferme à 21:30",
    addressLine1: "3401 Dufferin Street",
    city: "Toronto",
    province: "ON",
    postalCode: "M6A 2T9",
    country: "CA",
    phone: "(416) 915-2030",
    distanceKm: 730,
  },
  {
    name: "CF Sherway Gardens",
    hours: "Ouvert · Ferme à 21:30",
    addressLine1: "25 The West Mall",
    city: "Etobicoke",
    province: "ON",
    postalCode: "M9C 1B8",
    country: "CA",
    phone: "(416) 620-7750",
    distanceKm: 744,
  },
  {
    name: "Sporting Life",
    hours: "Ouvert · Ferme à 18:00",
    addressLine1: "222 Hurontario Street",
    city: "Collingwood",
    province: "ON",
    postalCode: "L9Y 2M2",
    country: "CA",
    phone: "(705) 532-9926",
    distanceKm: 746,
  },
  {
    name: "Sporting Life",
    hours: "Ouvert · Ferme à 21:00",
    addressLine1: "900 Maple Avenue",
    addressLine2: "102-202",
    city: "Burlington",
    province: "ON",
    postalCode: "L7S 2J8",
    country: "CA",
    phone: "(289) 812-1220",
  },
];

function normalizeValue(value) {
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim();
  return text.length ? text : undefined;
}

function simplifyStore(rawStore) {
  const address =
    rawStore.address ||
    rawStore.location ||
    rawStore.storeAddress ||
    rawStore.contactAddress ||
    {};
  const normalized = {
    name:
      normalizeValue(rawStore.name) ||
      normalizeValue(rawStore.title) ||
      normalizeValue(rawStore.storeName),
    hours:
      normalizeValue(rawStore.hoursText) ||
      normalizeValue(rawStore.hours) ||
      normalizeValue(rawStore.todayHours),
    addressLine1:
      normalizeValue(rawStore.addressLine1) ||
      normalizeValue(address.address1) ||
      normalizeValue(address.addressLine1) ||
      normalizeValue(address.line1) ||
      normalizeValue(address.street),
    addressLine2:
      normalizeValue(rawStore.addressLine2) ||
      normalizeValue(address.address2) ||
      normalizeValue(address.addressLine2) ||
      normalizeValue(address.line2),
    city:
      normalizeValue(rawStore.city) ||
      normalizeValue(address.city) ||
      normalizeValue(address.town),
    province:
      normalizeValue(rawStore.province) ||
      normalizeValue(rawStore.state) ||
      normalizeValue(address.region) ||
      normalizeValue(address.province) ||
      normalizeValue(address.state),
    postalCode:
      normalizeValue(rawStore.postalCode) ||
      normalizeValue(address.postalCode) ||
      normalizeValue(address.zip),
    country:
      normalizeValue(rawStore.country) || normalizeValue(address.country),
    phone:
      normalizeValue(rawStore.phone) ||
      normalizeValue(rawStore.phoneNumber) ||
      normalizeValue(address.phone) ||
      normalizeValue(address.telephone),
    distanceKm:
      typeof rawStore.distanceKm === "number"
        ? rawStore.distanceKm
        : typeof rawStore.distance === "number"
          ? rawStore.distance
          : undefined,
  };

  return normalized;
}

function findStoreArrays(candidate) {
  const results = [];
  const stack = [candidate];
  while (stack.length) {
    const current = stack.pop();
    if (!current || typeof current !== "object") continue;
    if (Array.isArray(current)) {
      const looksLikeStore = current.some(
        (item) =>
          item &&
          typeof item === "object" &&
          ("address" in item || "addressLine1" in item || "city" in item),
      );
      if (looksLikeStore) {
        results.push(current);
      }
      for (const value of current) {
        if (value && typeof value === "object") stack.push(value);
      }
      continue;
    }
    for (const value of Object.values(current)) {
      if (value && typeof value === "object") stack.push(value);
    }
  }
  return results;
}

async function scrapeStoresFromPage(page) {
  const storeData = await page.evaluate(() => {
    function normalizeValue(value) {
      if (value === undefined || value === null) return undefined;
      const text = String(value).trim();
      return text.length ? text : undefined;
    }

    function simplifyStore(rawStore) {
      const address =
        rawStore.address ||
        rawStore.location ||
        rawStore.storeAddress ||
        rawStore.contactAddress ||
        {};
      return {
        name:
          normalizeValue(rawStore.name) ||
          normalizeValue(rawStore.title) ||
          normalizeValue(rawStore.storeName),
        hours:
          normalizeValue(rawStore.hoursText) ||
          normalizeValue(rawStore.hours) ||
          normalizeValue(rawStore.todayHours),
        addressLine1:
          normalizeValue(rawStore.addressLine1) ||
          normalizeValue(address.address1) ||
          normalizeValue(address.addressLine1) ||
          normalizeValue(address.line1) ||
          normalizeValue(address.street),
        addressLine2:
          normalizeValue(rawStore.addressLine2) ||
          normalizeValue(address.address2) ||
          normalizeValue(address.addressLine2) ||
          normalizeValue(address.line2),
        city:
          normalizeValue(rawStore.city) ||
          normalizeValue(address.city) ||
          normalizeValue(address.town),
        province:
          normalizeValue(rawStore.province) ||
          normalizeValue(rawStore.state) ||
          normalizeValue(address.region) ||
          normalizeValue(address.province) ||
          normalizeValue(address.state),
        postalCode:
          normalizeValue(rawStore.postalCode) ||
          normalizeValue(address.postalCode) ||
          normalizeValue(address.zip),
        country:
          normalizeValue(rawStore.country) || normalizeValue(address.country),
        phone:
          normalizeValue(rawStore.phone) ||
          normalizeValue(rawStore.phoneNumber) ||
          normalizeValue(address.phone) ||
          normalizeValue(address.telephone),
        distanceKm:
          typeof rawStore.distanceKm === "number"
            ? rawStore.distanceKm
            : typeof rawStore.distance === "number"
              ? rawStore.distance
              : undefined,
      };
    }

    function findStoreArrays(candidate) {
      const results = [];
      const stack = [candidate];
      while (stack.length) {
        const current = stack.pop();
        if (!current || typeof current !== "object") continue;
        if (Array.isArray(current)) {
          const looksLikeStore = current.some(
            (item) =>
              item &&
              typeof item === "object" &&
              ("address" in item || "addressLine1" in item || "city" in item),
          );
          if (looksLikeStore) {
            results.push(current);
          }
          for (const value of current) {
            if (value && typeof value === "object") stack.push(value);
          }
          continue;
        }
        for (const value of Object.values(current)) {
          if (value && typeof value === "object") stack.push(value);
        }
      }
      return results;
    }

    const scriptStores = Array.from(document.querySelectorAll("script"))
      .map((el) => el.textContent || "")
      .filter((text) => text.includes("{"))
      .flatMap((text) => {
        try {
          const parsed = JSON.parse(text);
          return findStoreArrays(parsed);
        } catch (err) {
          return [];
        }
      });

    const windowStores = findStoreArrays(window);
    const candidates = [...scriptStores, ...windowStores].flat();
    return candidates.map(simplifyStore).filter((store) => store.name && store.city);
  });

  return storeData;
}

function dedupeStores(stores) {
  const map = new Map();
  for (const store of stores) {
    const key = `${store.name || ""}|${store.addressLine1 || ""}|${store.city || ""}`.toLowerCase();
    if (!map.has(key)) {
      map.set(key, store);
    }
  }
  return Array.from(map.values());
}

async function scrapeLocations() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ locale: "fr-CA" });

  console.log(`➡️ Ouverture du localisateur de magasins: ${STORE_LOCATOR_URL}`);
  try {
    await page.goto(STORE_LOCATOR_URL, { waitUntil: "networkidle", timeout: 30000 });
  } catch (error) {
    console.warn("⚠️ Impossible de charger la page du localisateur, utilisation de la liste en dur.");
  }

  let stores = [];
  try {
    stores = await scrapeStoresFromPage(page);
    if (stores.length) {
      console.log(`✅ ${stores.length} magasins détectés via la page.`);
    }
  } catch (error) {
    console.warn("⚠️ Erreur pendant l'extraction dynamique, utilisation de la liste en dur.");
  }

  if (!stores.length) {
    stores = FALLBACK_LOCATIONS.map(simplifyStore);
    console.log(`ℹ️ Aucune donnée trouvée en ligne, ${stores.length} magasins provenant de la liste fournie.`);
  }

  const uniqueStores = dedupeStores(stores);

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(uniqueStores, null, 2), "utf-8");
  console.log(`💾 Fichier écrit: ${OUTPUT_PATH}`);

  await browser.close();
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  scrapeLocations().catch((error) => {
    console.error("❌ Erreur lors du scraping des magasins:", error);
    process.exit(1);
  });
}
